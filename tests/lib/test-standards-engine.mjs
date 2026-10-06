// tests/lib/test-standards-engine.mjs — engine único de standards (ADR-015 D5).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, rmSync, symlinkSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  checkFiles, findProjectRoot, trustedPluginRoot, applicableStandards, resolveBaseline,
} from "../../scripts/lib/standards-engine.mjs";
import { saveBaseline, loadBaseline, initBaseline, baselinePath, fingerprint } from "../../scripts/lib/standards-baseline.mjs";
import { demoProject as makeProject } from "../helpers/standards-fixture.mjs";
import { runLintersFor } from "../../scripts/lib/run-linter.mjs";

const created = [];
const demoProject = (opts) => { const r = makeProject(opts); created.push(r); return r; };
after(() => { for (const d of created) rmSync(d, { recursive: true, force: true }); });

function withEnv(name, value, fn) {
  const saved = process.env[name];
  try {
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
    return fn();
  } finally {
    if (saved === undefined) delete process.env[name]; else process.env[name] = saved;
  }
}

test("raiz do plugin vem do próprio arquivo, sem env", () => {
  withEnv("CLAUDE_PLUGIN_ROOT", undefined, () => assert.equal(trustedPluginRoot(), process.cwd()));
});

// Prova diferente do teste anterior: aquele só olha a função; este prova que o LOADER do
// engine usa a raiz confiável — com o env ausente E com o env envenenado apontando para um
// diretório com um "default" falso, os defaults vêm do plugin real.
test("defaults do plugin carregam pela raiz confiável, ignorando CLAUDE_PLUGIN_ROOT", () => {
  const root = demoProject({ isolate: false });
  const fake = mkdtempSync(join(tmpdir(), "fake-plugin-"));
  created.push(fake);
  mkdirSync(join(fake, ".claude-plugin"), { recursive: true });
  writeFileSync(join(fake, ".claude-plugin/plugin.json"), "{}");
  mkdirSync(join(fake, "assets/standards"), { recursive: true });
  writeFileSync(join(fake, "assets/standards/std-fake.md"), `---\nid: std-fake\ndescription: f\napplyTo: ["src/**"]\n---\n`);
  for (const env of [undefined, fake]) {
    withEnv("CLAUDE_PLUGIN_ROOT", env, () => {
      const stds = applicableStandards(root, "src/a.ts");
      const defaults = stds.filter(s => s.origin === "default");
      assert.ok(defaults.length > 0, `sem defaults com env=${env}`);
      assert.ok(!stds.some(s => s.id === "std-fake"), "default do plugin falso vazou");
    });
  }
});

test("achado block sem baseline → blocking + hasBaseline false", async () => {
  const root = demoProject();
  writeFileSync(join(root, "src/a.js"), "BAD\n");
  const r = await checkFiles({ projectRoot: root, files: ["src/a.js"] });
  assert.equal(r.blocking.length, 1);
  assert.equal(r.hasBaseline, false);
  assert.equal(r.baselineError, null);
  const f = r.blocking[0];
  assert.deepEqual(
    { stdId: f.stdId, ruleId: f.ruleId, path: f.path, line: f.line, level: f.level },
    { stdId: "std-demo", ruleId: "no-bad", path: "src/a.js", line: 1, level: "block" },
  );
  assert.equal(f.fp, fingerprint(f));
});

test("achado no baseline → baselined, não blocking", async () => {
  const root = demoProject();
  writeFileSync(join(root, "src/a.js"), "BAD\n");
  const first = await checkFiles({ projectRoot: root, files: ["src/a.js"] });
  saveBaseline(root, initBaseline(first.blocking, { by: "t" }));
  const r = await checkFiles({ projectRoot: root, files: ["src/a.js"] });
  assert.equal(r.blocking.length, 0);
  assert.equal(r.baselined.length, 1);
  assert.equal(r.hasBaseline, true);
});

test("round-trip checkFiles → init → save → load → checkFiles dá zero blocking (v2, legado e caminho ecoado)", async () => {
  const bodies = [
    undefined, // LINT_BAD, formato v2
    'console.log("VIOLATION: 3 problemas em "+require("path").resolve(process.argv[2])+".");process.exit(1)',
    'console.log("VIOLATION: [advisory] regra-x — algo em "+process.argv[2]+" [x]");console.log("VIOLATION estranho");process.exit(1)',
  ];
  for (const linterBody of bodies) {
    const root = demoProject(linterBody ? { linterBody, level: "block" } : {});
    writeFileSync(join(root, "src/a.js"), "BAD\nBAD\n");
    const first = await checkFiles({ projectRoot: root, files: ["src/a.js"] });
    const all = [...first.blocking, ...first.warnings, ...first.review];
    assert.ok(all.length >= 1);
    for (const f of all) {
      for (const k of ["stdId", "ruleId", "path", "message"]) assert.equal(typeof f[k], "string", `${k} não é string`);
      assert.ok(!f.message.includes(root), `mensagem carrega a raiz: ${f.message}`);
    }
    saveBaseline(root, initBaseline(all, { by: "t" }));
    const loaded = loadBaseline(root);
    assert.ok(loaded.entries.length >= 1);
    const r = await checkFiles({ projectRoot: root, files: ["src/a.js"], baseline: loaded });
    assert.equal(r.blocking.length + r.warnings.length + r.review.length, 0);
    assert.equal(r.baselined.length, all.length);
  }
});

test("segunda ocorrência igual no mesmo arquivo bloqueia (multiconjunto)", async () => {
  const root = demoProject();
  writeFileSync(join(root, "src/a.js"), "BAD\n");
  saveBaseline(root, initBaseline((await checkFiles({ projectRoot: root, files: ["src/a.js"] })).blocking, { by: "t" }));
  writeFileSync(join(root, "src/a.js"), "BAD\nok\nBAD\n");
  const r = await checkFiles({ projectRoot: root, files: ["src/a.js"] });
  assert.equal(r.blocking.length, 1);
  assert.equal(r.baselined.length, 1);
});

test("arquivo novo com violação bloqueia mesmo com baseline existente", async () => {
  const root = demoProject();
  saveBaseline(root, initBaseline([], { by: "t" }));
  writeFileSync(join(root, "src/novo.js"), "ok\nBAD\n");
  assert.equal((await checkFiles({ projectRoot: root, files: ["src/novo.js"] })).blocking.length, 1);
});

test("caminho absoluto, não normalizado e fora do projeto", async () => {
  const root = demoProject();
  writeFileSync(join(root, "src/a.js"), "BAD\n");
  const abs = await checkFiles({ projectRoot: root, files: [`${root}/lib/../src/a.js`] });
  assert.equal(abs.blocking[0].path, "src/a.js");
  const out = await checkFiles({ projectRoot: root, files: ["/etc/hosts", "../fora.js"] });
  assert.deepEqual([out.blocking.length, out.errors.length], [0, 0]);
});

test("arquivo sob symlink para fora do projeto não é analisado (toRelPosix recebe caminho absoluto)", async () => {
  const root = demoProject();
  const outside = mkdtempSync(join(tmpdir(), "fora-"));
  created.push(outside);
  writeFileSync(join(outside, "x.js"), "BAD\n");
  symlinkSync(outside, join(root, "src/ext"));
  const r = await checkFiles({ projectRoot: root, files: ["src/ext/x.js", join(root, "src/ext/x.js")] });
  assert.deepEqual([r.blocking.length, r.warnings.length, r.baselined.length, r.errors.length], [0, 0, 0, 0]);
});

test("path do achado é sempre o rel do arquivo analisado, mesmo se o linter reportar outro caminho", async () => {
  const root = demoProject({ linterBody: 'console.log("VIOLATION no-bad ../../etc/passwd:3 m");console.log("VIOLATION: legado");process.exit(1)' });
  writeFileSync(join(root, "src/a.js"), "x\n");
  const r = await checkFiles({ projectRoot: root, files: ["src/a.js"] });
  assert.equal(r.blocking.length, 2);
  for (const f of r.blocking) assert.equal(f.path, "src/a.js");
});

test("nível warn vai para warnings", async () => {
  const root = demoProject({ level: "warn" });
  writeFileSync(join(root, "src/a.js"), "BAD\n");
  const r = await checkFiles({ projectRoot: root, files: ["src/a.js"] });
  assert.equal(r.warnings.length, 1);
  assert.equal(r.blocking.length, 0);
});

test("nível review vai para review", async () => {
  const root = demoProject({ level: "review" });
  writeFileSync(join(root, "src/a.js"), "BAD\n");
  const r = await checkFiles({ projectRoot: root, files: ["src/a.js"] });
  assert.deepEqual([r.review.length, r.blocking.length, r.warnings.length], [1, 0, 0]);
});

test("select separa linters que podem bloquear dos demais", async () => {
  const b = demoProject({ level: "block" }), w = demoProject({ level: "warn" });
  for (const r of [b, w]) writeFileSync(join(r, "src/a.js"), "BAD\n");
  assert.equal((await checkFiles({ projectRoot: w, files: ["src/a.js"], select: "blockable" })).warnings.length, 0);
  assert.equal((await checkFiles({ projectRoot: w, files: ["src/a.js"], select: "nonblockable" })).warnings.length, 1);
  assert.equal((await checkFiles({ projectRoot: b, files: ["src/a.js"], select: "nonblockable" })).blocking.length, 0);
  assert.equal((await checkFiles({ projectRoot: b, files: ["src/a.js"], select: "blockable" })).blocking.length, 1);
  await assert.rejects(checkFiles({ projectRoot: b, files: ["src/a.js"], select: "tudo" }), /select/);
});

test("linter que lança exceção vira erro, não limpo (D4)", async () => {
  const root = demoProject({ linterBody: 'throw new Error("boom")' });
  writeFileSync(join(root, "src/a.js"), "BAD\n");
  const r = await checkFiles({ projectRoot: root, files: ["src/a.js"] });
  assert.equal(r.errors.length, 1);
  assert.deepEqual({ stdId: r.errors[0].stdId, path: r.errors[0].path }, { stdId: "std-demo", path: "src/a.js" });
  assert.equal(r.blocking.length, 0);
});

test("orçamento esgotado: não dispara mais linters e aborta os em curso", async () => {
  const root = demoProject({ linterBody: "setTimeout(()=>{}, 60000);" });
  const files = [];
  for (let i = 0; i < 20; i++) { writeFileSync(join(root, `src/f${i}.js`), "x\n"); files.push(`src/f${i}.js`); }
  const t0 = Date.now();
  const r = await checkFiles({ projectRoot: root, files, budgetMs: 500, concurrency: 4 });
  assert.ok(Date.now() - t0 < 3000, `levou ${Date.now() - t0}ms`);
  assert.equal(r.errors.length, 20);
  assert.ok(r.errors.every(e => /orçamento/.test(e.reason)));
  assert.equal(r.errors.filter(e => /não executado/.test(e.reason)).length, 16, "só os 4 em curso chegaram a disparar");
});

test("baseline inválido não derruba o engine: vira baselineError", async () => {
  const root = demoProject();
  mkdirSync(join(root, ".context/engineering/standards"), { recursive: true });
  writeFileSync(baselinePath(root), "x");
  writeFileSync(join(root, "src/a.js"), "BAD\n");
  const r = await checkFiles({ projectRoot: root, files: ["src/a.js"] });
  assert.match(r.baselineError, /baseline inválido/);
  assert.equal(r.baselineSource, "invalido");
  assert.equal(r.hasBaseline, false);
  assert.equal(r.blocking.length, 1);
});

test("baseline apagado da árvore mas versionado no HEAD continua valendo", async () => {
  const root = demoProject();
  writeFileSync(join(root, "src/a.js"), "BAD\n");
  saveBaseline(root, initBaseline((await checkFiles({ projectRoot: root, files: ["src/a.js"] })).blocking, { by: "t" }));
  execFileSync("git", ["init", "-q", "-b", "main", root]);
  execFileSync("git", ["-C", root, "add", "-A"]);
  execFileSync("git", ["-C", root, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "i"]);
  rmSync(baselinePath(root));
  const r = await checkFiles({ projectRoot: root, files: ["src/a.js"] });
  assert.equal(r.blocking.length, 0);
  assert.match(r.baselineSource, /HEAD/);
});

test("resolveBaseline: arquivo presente → 'arquivo'; ausente sem git → null", () => {
  const root = demoProject();
  assert.deepEqual(resolveBaseline(root), { baseline: null, source: "nenhum" });
  saveBaseline(root, initBaseline([], { by: "t" }));
  const r = resolveBaseline(root);
  assert.equal(r.source, "arquivo");
  assert.deepEqual(r.baseline.entries, []);
});

test("impressão digital não depende do diretório do clone (linter que ecoa o caminho)", async () => {
  const echo = 'const p=require("path").resolve(process.argv[2]);console.log("VIOLATION: 1 problema em "+p+".");process.exit(1)';
  const plain = 'console.log("VIOLATION: 1 problema em "+process.argv[2]+".");process.exit(1)';
  for (const body of [echo, plain]) {
    const a = demoProject({ linterBody: body }), b = demoProject({ linterBody: body });
    for (const r of [a, b]) writeFileSync(join(r, "src/x.js"), "x\n");
    const fa = (await checkFiles({ projectRoot: a, files: [join(a, "src/x.js")] })).blocking[0];
    const fb = (await checkFiles({ projectRoot: b, files: ["src/x.js"] })).blocking[0];
    assert.equal(fa.fp, fb.fp);
    assert.match(fa.message, /em src\/x\.js\./);
  }
});

test("contentRoot separado: linter lê do contentRoot e a mensagem não carrega nenhuma das raízes", async () => {
  const echo = 'const fs=require("fs");const p=require("path").resolve(process.argv[2]);if(fs.readFileSync(p,"utf8").includes("BAD")){console.log("VIOLATION: ruim em "+p+".");process.exit(1)}';
  const root = demoProject({ linterBody: echo });
  writeFileSync(join(root, "src/x.js"), "ok\n");
  const staged = mkdtempSync(join(tmpdir(), "staged-"));
  created.push(staged);
  mkdirSync(join(staged, "src"));
  writeFileSync(join(staged, "src/x.js"), "BAD\n");
  const r = await checkFiles({ projectRoot: root, contentRoot: staged, files: ["src/x.js"] });
  assert.equal(r.blocking.length, 1);
  assert.equal(r.blocking[0].message, "ruim em src/x.js.");
});

test("findProjectRoot sobe de um subdiretório; fora de projeto → null", () => {
  // T14 rodada 1: a subida vale DENTRO de git (até o toplevel); a fixture vira repositório.
  const root = demoProject();
  execFileSync("git", ["init", "-q", root]);
  mkdirSync(join(root, "src/deep/er"), { recursive: true });
  assert.equal(findProjectRoot(join(root, "src/deep/er")), root);
  assert.equal(findProjectRoot("/"), null);
  // Fora de git, um diretório pai com .context não é achado.
  const nogit = demoProject();
  mkdirSync(join(nogit, "src/deep/er"), { recursive: true });
  assert.equal(findProjectRoot(join(nogit, "src/deep/er")), null);
});

// T14 rodada 1: a subida para no toplevel do git (inclusive); fora de git, só o diretório
// inicial. Um .context plantado num ancestral (/tmp/.context, $HOME/.context) não vale.
test("findProjectRoot: .context num ancestral ACIMA do toplevel do git não é achado", () => {
  const outer = mkdtempSync(join(tmpdir(), "fpr-outer-"));
  created.push(outer);
  mkdirSync(join(outer, ".context"));
  const repo = join(outer, "repo");
  mkdirSync(join(repo, "src/deep"), { recursive: true });
  execFileSync("git", ["init", "-q", repo]);
  assert.equal(findProjectRoot(join(repo, "src/deep")), null);
  assert.equal(findProjectRoot(repo), null);
});

test("findProjectRoot: fora de git, .context num diretório pai não é achado; no próprio, é", () => {
  const outer = mkdtempSync(join(tmpdir(), "fpr-nogit-"));
  created.push(outer);
  mkdirSync(join(outer, ".context"));
  mkdirSync(join(outer, "sub"));
  assert.equal(findProjectRoot(join(outer, "sub")), null);
  assert.equal(findProjectRoot(outer), outer);
});

test("findProjectRoot: dentro de git, cwd em subdiretório acha o .context da raiz do repo", () => {
  const root = demoProject();
  execFileSync("git", ["init", "-q", root]);
  mkdirSync(join(root, "src/deep/er"), { recursive: true });
  assert.equal(findProjectRoot(join(root, "src/deep/er")), root);
  assert.equal(findProjectRoot(root), root);
});

test("orçamento: o filho abortado não sobrevive, mesmo capturando SIGTERM", async () => {
  // O linter ignora SIGTERM e, se sobreviver 1,5s, escreve um sentinela no cwd (contentRoot).
  const body = 'process.on("SIGTERM",()=>{});setTimeout(()=>{require("fs").writeFileSync("vivo-"+process.pid,"x")},1500);';
  const root = demoProject({ linterBody: body });
  for (let i = 0; i < 3; i++) writeFileSync(join(root, `src/f${i}.js`), "x\n");
  const t0 = Date.now();
  const r = await checkFiles({ projectRoot: root, files: ["src/f0.js", "src/f1.js", "src/f2.js"], budgetMs: 300 });
  assert.ok(Date.now() - t0 < 1400, `abort não matou o filho a tempo: ${Date.now() - t0}ms`);
  assert.equal(r.errors.length, 3);
  await new Promise(res => setTimeout(res, 2000));
  assert.deepEqual(readdirSync(root).filter(n => n.startsWith("vivo-")), [], "filho sobreviveu ao abort");
});

test("orçamento: neto que herda o stdio não segura o checkFiles até o teto de 5s", async () => {
  // O linter dispara um neto com stdio:"inherit" (herda os pipes do execFile) e dorme. Sem
  // destruir child.stdout/stderr no abort, o execFile só resolve quando o neto fecha os pipes.
  const body = 'require("child_process").spawn(process.execPath,["-e","setTimeout(()=>{},4000)"],{stdio:"inherit"});setTimeout(()=>{},60000);';
  const root = demoProject({ linterBody: body });
  writeFileSync(join(root, "src/a.js"), "x\n");
  const t0 = Date.now();
  const r = await checkFiles({ projectRoot: root, files: ["src/a.js"], budgetMs: 500 });
  const ms = Date.now() - t0;
  assert.ok(ms < 1500, `neto segurou o checkFiles: ${ms}ms`);
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0].reason, /orçamento/);
});

test("budgetMs inválido lança TypeError; Infinity continua válido", async () => {
  const root = demoProject();
  writeFileSync(join(root, "src/a.js"), "ok\n");
  for (const budgetMs of ["500", NaN, -1, null]) {
    await assert.rejects(checkFiles({ projectRoot: root, files: ["src/a.js"], budgetMs }), TypeError, `aceitou ${budgetMs}`);
  }
  const r = await checkFiles({ projectRoot: root, files: ["src/a.js"], budgetMs: Infinity });
  assert.equal(r.errors.length, 0);
});

test("runLintersFor sem raiz confiável não carrega defaults do CLAUDE_PLUGIN_ROOT envenenado (D5)", async () => {
  const root = demoProject();
  const fake = mkdtempSync(join(tmpdir(), "fake-plugin-"));
  created.push(fake);
  mkdirSync(join(fake, "assets/standards/machine"), { recursive: true });
  writeFileSync(join(fake, "assets/standards/std-fake.md"),
    `---\nid: std-fake\ndescription: f\napplyTo: ["src/**"]\nenforcement:\n  linter: machine/std-fake.js\n---\n`);
  writeFileSync(join(fake, "assets/standards/machine/std-fake.js"), 'console.log("VIOLATION: fake");process.exit(1)');
  writeFileSync(join(root, "src/a.js"), "ok\n");
  const r = await withEnv("CLAUDE_PLUGIN_ROOT", fake, () =>
    runLintersFor({ tool: "Edit", path: "src/a.js" }, root, undefined));
  const ids = [...r.violations, ...r.rejected].map(x => x.id);
  assert.ok(!ids.includes("std-fake"), `std do plugin envenenado foi carregado: ${JSON.stringify(r)}`);
});

// T18: o gate roda em duas passadas (linters que já existiam na base, depois os novos ou
// alterados). `stdFilter` escolhe os standards de cada passada.
test("checkFiles: stdFilter restringe os standards executados", async () => {
  const root = demoProject();
  writeFileSync(join(root, "src/x.js"), "BAD\n");
  const all = await checkFiles({ projectRoot: root, files: ["src/x.js"], baseline: null });
  assert.equal(all.blocking.length, 1);
  const none = await checkFiles({ projectRoot: root, files: ["src/x.js"], baseline: null, stdFilter: () => false });
  assert.deepEqual([none.blocking.length, none.errors.length], [0, 0]);
  const only = await checkFiles({ projectRoot: root, files: ["src/x.js"], baseline: null, stdFilter: (s) => s.id === "std-demo" });
  assert.equal(only.blocking.length, 1);
  await assert.rejects(checkFiles({ projectRoot: root, files: [], baseline: null, stdFilter: "std-demo" }), TypeError);
});

// T18, rodada 2 (poc22): `src/**` não casava nome com terminador de linha, e o arquivo passava
// sem lint no hook, no check e no gate.
test("checkFiles: arquivo com terminador de linha no nome (ou num diretório do caminho) é lintado", async () => {
  const root = demoProject();
  const names = ["src/mod\n.js", "src/a\rb.js", "src/util\u2028/x.js", "src/par\u2029agrafo.js", "src/normal.js"];
  for (const n of names) { mkdirSync(join(root, n, ".."), { recursive: true }); writeFileSync(join(root, n), "// BAD\n"); }
  const r = await checkFiles({ projectRoot: root, files: names, baseline: null });
  assert.deepEqual(r.errors, [], JSON.stringify(r.errors));
  assert.deepEqual(r.blocking.map(f => f.path).sort(), [...names].sort());
});

// T18, rodada 2 (poc21, caso d): com `contentRoot` (blobs do índice ou do HEAD), o caminho é
// resolvido só por ele. Antes era resolvido pela árvore de trabalho: com `src/` trocado por um
// link para um diretório fora do applyTo, `src/new.js` virava `fora/new.js` e não era lintado.
// Rodada 3 da T18: o caminho com "\r", U+2028 ou U+2029 fazia o achado perder a regra (ruleId
// virava o id do std), e `rules: { no-bad: block }` num std `warn` saía como `warn`.
test("checkFiles: regra em block num std warn vale também em arquivo com CR, U+2028 ou U+2029 no caminho", async () => {
  const root = demoProject({ level: "warn" });
  const stdFile = join(root, ".context/engineering/standards/std-demo.md");
  writeFileSync(stdFile, readFileSync(stdFile, "utf8").replace("  level: warn\n", "  level: warn\n  rules:\n    no-bad: block\n"));
  const cp = (n) => String.fromCodePoint(n);
  const names = ["src/normal.js", "src/a\rb.js", `src/util${cp(0x2028)}/x.js`, `src/par${cp(0x2029)}agrafo.js`];
  for (const n of names) { mkdirSync(join(root, n, ".."), { recursive: true }); writeFileSync(join(root, n), "// BAD\n"); }
  const r = await checkFiles({ projectRoot: root, files: names, baseline: null });
  assert.deepEqual(r.errors, [], JSON.stringify(r.errors));
  assert.deepEqual(r.warnings.map(f => [f.path, f.ruleId]), [], "nenhum achado pode cair no nível do std");
  assert.deepEqual(r.blocking.map(f => f.path).sort(), [...names].sort());
  for (const f of r.blocking) {
    assert.equal(f.ruleId, "no-bad", JSON.stringify(f.path));
    assert.equal(f.line, 1);
    assert.equal(f.message, "remova BAD");
  }
});

test("checkFiles: com contentRoot, a árvore de trabalho não decide o caminho do arquivo", async () => {
  const root = demoProject();
  mkdirSync(join(root, "fora"), { recursive: true });
  rmSync(join(root, "src"), { recursive: true });
  symlinkSync("fora", join(root, "src")); // na árvore, src/ é um link para fora do applyTo
  const content = mkdtempSync(join(tmpdir(), "content-")); created.push(content);
  mkdirSync(join(content, "src"), { recursive: true });
  writeFileSync(join(content, "src/new.js"), "BAD\n");
  const r = await checkFiles({ projectRoot: root, contentRoot: content, files: ["src/new.js"], baseline: null });
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.blocking.map(f => f.path), ["src/new.js"]);
  // Caminho que sai do contentRoot continua descartado.
  const out = await checkFiles({ projectRoot: root, contentRoot: content, files: ["../x.js", "/etc/passwd"], baseline: null });
  assert.deepEqual([out.blocking.length, out.errors.length], [0, 0]);
});

