// tests/lib/test-standards-engine-machine.mjs — o check não analisa os linters do próprio projeto
// (achado I-4 da revisão final; onda B, item B2).
//
// A exclusão de `machine/` mora no laço de `checkFiles`, para que todos os caminhos de entrada
// vejam o mesmo conjunto de arquivos. Aqui: o engine direto (com e sem `contentRoot`, que é como
// o `--staged`, o snapshot do `gate --ci` e a conferência da adoção chegam a ele) e os dois hooks
// pós-edição. Os caminhos pelo CLI estão em tests/integration/test-standards-machine-exclusion.mjs.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { checkFiles } from "../../scripts/lib/standards-engine.mjs";
import { saveBaseline, initBaseline } from "../../scripts/lib/standards-baseline.mjs";
import { demoProject as makeProject } from "../helpers/standards-fixture.mjs";

const REPO = resolve(import.meta.dirname, "../..");
const HOOK_CLI = join(REPO, "scripts/lib/standards-hook-cli.mjs");
const CANON = ".context/engineering/standards";
const LEGACY = ".context/standards";

const created = [];
after(() => { for (const d of created) rmSync(d, { recursive: true, force: true }); });

// O std-demo passa a valer para todo `.js` do projeto: sem a exclusão, o próprio linter (que tem
// "BAD" no código) e qualquer arquivo de machine/ viram achado dele.
function wideProject(opts) {
  const root = makeProject(opts);
  created.push(root);
  const md = join(root, CANON, "std-demo.md");
  writeFileSync(md, readFileSync(md, "utf8").replace('applyTo: ["src/**"]', 'applyTo: ["**/*.js"]'));
  return root;
}
function put(root, rel, text = "BAD\n") {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), text);
  return rel;
}
const all = (r) => [...r.blocking, ...r.warnings, ...r.review, ...r.baselined];
const paths = (r) => all(r).map((f) => f.path).sort();

const IN_MACHINE = [`${CANON}/machine/std-demo.js`, `${CANON}/machine/novo.js`, `${CANON}/machine/lib/util.js`, `${LEGACY}/machine/antigo.js`];
// Não são o diretório de linters: continuam analisados.
const OUTSIDE = ["src/a.js", "src/machine/x.js", `${CANON}/outro/x.js`, `${CANON}/machine-extra/x.js`, ".context/machine/x.js"];

test("checkFiles: arquivo em machine/ (canônico e legado) que viola outro standard não gera achado", async () => {
  const root = wideProject();
  for (const rel of [...IN_MACHINE.slice(1), ...OUTSIDE]) put(root, rel);
  const r = await checkFiles({ projectRoot: root, files: [...IN_MACHINE, ...OUTSIDE], baseline: null });
  assert.deepEqual(r.errors, []);
  assert.deepEqual(paths(r), [...OUTSIDE].sort(), "só o que está fora de machine/ é analisado");
});

test("checkFiles: caminho absoluto e não normalizado para dentro de machine/ também fica de fora", async () => {
  const root = wideProject();
  put(root, `${CANON}/machine/novo.js`);
  put(root, "src/a.js");
  const r = await checkFiles({
    projectRoot: root, baseline: null,
    files: [join(root, CANON, "machine/novo.js"), `${root}/src/../${CANON}/machine/./novo.js`, join(root, "src/a.js")],
  });
  assert.deepEqual(paths(r), ["src/a.js"]);
});

// `--staged` (índice num tmp) e o snapshot do `gate --ci` (blobs do HEAD num tmp) chegam ao
// engine com `contentRoot` ≠ `projectRoot`: o caminho relativo ao conteúdo é o que decide.
test("checkFiles com contentRoot: o conteúdo num tmp segue a mesma regra", async () => {
  const root = wideProject();
  const content = mkdtempSync(join(tmpdir(), "content-"));
  created.push(content);
  for (const rel of [...IN_MACHINE, ...OUTSIDE]) put(content, rel);
  const r = await checkFiles({ projectRoot: root, contentRoot: content, files: [...IN_MACHINE, ...OUTSIDE], baseline: null });
  assert.deepEqual(r.errors, []);
  assert.deepEqual(paths(r), [...OUTSIDE].sort());
});

const ev = (file, cwd) => JSON.stringify({ tool_name: "Write", tool_input: { file_path: file }, cwd, session_id: "s-machine" });
const hook = (mode, file, cwd) => spawnSync(process.execPath, [HOOK_CLI, `--mode=${mode}`], { input: ev(file, cwd), cwd: REPO, encoding: "utf8" });

test("hook síncrono: editar um arquivo de machine/ não bloqueia; o mesmo conteúdo fora dele bloqueia", () => {
  const root = wideProject(); // std-demo em block
  saveBaseline(root, initBaseline([], { by: "t" })); // com baseline o hook síncrono bloqueia
  for (const rel of [`${CANON}/machine/novo.js`, `${CANON}/machine/std-demo.js`, `${LEGACY}/machine/antigo.js`]) {
    if (!rel.endsWith("std-demo.js")) put(root, rel);
    const r = hook("sync", join(root, rel), root);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, "", `o hook síncrono agiu sobre ${rel}: ${r.stdout}`);
  }
  const ctl = hook("sync", join(root, put(root, "src/a.js")), root);
  assert.equal(JSON.parse(ctl.stdout).decision, "block", "controle: fora de machine/ o bloqueio continua");
});

test("hook assíncrono: editar um arquivo de machine/ não gera aviso; o mesmo conteúdo fora dele gera", () => {
  const root = wideProject({ level: "warn" }); // warn roda no hook assíncrono
  for (const rel of [`${CANON}/machine/novo.js`, `${CANON}/machine/std-demo.js`, `${LEGACY}/machine/antigo.js`]) {
    if (!rel.endsWith("std-demo.js")) put(root, rel);
    const r = hook("async", join(root, rel), root);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, "", `o hook assíncrono agiu sobre ${rel}: ${r.stdout}`);
  }
  const ctl = hook("async", join(root, put(root, "src/a.js")), root);
  assert.match(ctl.stdout, /Standard std-demo violated: VIOLATION no-bad src\/a\.js:1/, "controle: fora de machine/ o aviso continua");
});
