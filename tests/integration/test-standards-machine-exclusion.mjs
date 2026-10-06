// tests/integration/test-standards-machine-exclusion.mjs — o check não analisa os linters do
// próprio projeto (achado I-4 da revisão final; onda B, item B2), pelos caminhos do CLI.
//
// `check --all`, `check --staged`, o snapshot do `gate --ci`, a conferência da adoção e o
// `baseline init/prune` veem o mesmo conjunto de arquivos: nada sob `machine/` (canônico e
// legado). O engine direto e os dois hooks estão em tests/lib/test-standards-engine-machine.mjs.
// A proteção dos linters não muda: alterar um arquivo de `machine/` continua enfraquecendo a
// catraca para o gate.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import { writeFileSync, readFileSync, rmSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { runStandardsCommand } from "../../scripts/lib/standards-check-cli.mjs";
import { saveBaseline, loadBaseline, fingerprint } from "../../scripts/lib/standards-baseline.mjs";
import { demoProject as rawDemoProject } from "../helpers/standards-fixture.mjs";

const CLI = join(process.cwd(), "scripts/devflow-standards.mjs");
const env = { ...process.env, CI: "" };
const TEMPS = [];
after(() => { for (const d of TEMPS) rmSync(d, { recursive: true, force: true }); });

const CANON = ".context/engineering/standards";
const LEGACY = ".context/standards";
const LINTER = `${CANON}/machine/std-demo.js`;
const run = (root, ...a) => spawnSync("node", [CLI, ...a, `--project=${root}`], { encoding: "utf8", env });
const ci = (root) => run(root, "gate", "--base-ref=refs/heads/main", "--ci");
const git = (root, ...a) => execFileSync("git", ["-C", root, ...a], { encoding: "utf8" });
const human = (root, ...a) => runStandardsCommand("baseline", a, root, { isInteractive: () => true });
const commit = (root) => { git(root, "add", "-A"); git(root, "commit", "-qm", "x"); };
function put(root, rel, text = "BAD\n") {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), text);
}
const entry = (path, count = 1) => {
  const e = { stdId: "std-demo", ruleId: "no-bad", path, message: "remova BAD" };
  return { ...e, fp: fingerprint(e), count };
};
const findings = (r) => { const j = JSON.parse(r.stdout.split("\n")[0]); return [...j.blocking, ...j.warnings, ...j.review, ...j.baselined].map((f) => f.path).sort(); };

// Repositório com o std-demo (block) valendo para todo `.js`: sem a exclusão, o próprio linter —
// que tem "BAD" no código — e qualquer arquivo de machine/ viram achado dele.
function repo() {
  const root = rawDemoProject();
  TEMPS.push(root);
  const md = join(root, CANON, "std-demo.md");
  writeFileSync(md, readFileSync(md, "utf8").replace('applyTo: ["src/**"]', 'applyTo: ["**/*.js"]'));
  git(root, "init", "-q", "-b", "main"); git(root, "config", "user.email", "t@t"); git(root, "config", "user.name", "t");
  writeFileSync(join(root, ".context/.devflow.yaml"), 'git:\n  strategy: branch-flow\nverify:\n  standards: ["devflow-standards", "gate"]\n');
  return root;
}
// Base commitada na `main` (com ou sem baseline) e a branch `feat` aberta a partir dela.
async function base({ withBaseline = true, setup = null } = {}) {
  const root = repo();
  put(root, "src/old.js");
  if (setup) setup(root);
  git(root, "add", "-A");
  if (withBaseline) assert.equal(await human(root, "init"), 0);
  commit(root);
  git(root, "checkout", "-q", "-b", "feat");
  return root;
}

test("check --all: arquivos de machine/ (canônico e legado) não geram achado; fora dele, sim", () => {
  const root = repo();
  put(root, `${CANON}/machine/novo.js`);
  put(root, `${LEGACY}/machine/antigo.js`);
  const clean = run(root, "check", "--all", "--json");
  assert.equal(clean.status, 0, clean.stdout + clean.stderr);
  assert.deepEqual(findings(clean), []);
  put(root, "src/a.js");
  put(root, `${CANON}/outro/x.js`);
  const dirty = run(root, "check", "--all", "--json");
  assert.equal(dirty.status, 1, "controle: o standard vale para o resto do projeto");
  assert.deepEqual(findings(dirty), [`${CANON}/outro/x.js`, "src/a.js"]);
});

test("check --staged: linter novo ou alterado no índice não é barrado por outro standard", () => {
  const root = repo();
  commit(root);
  put(root, `${CANON}/machine/novo.js`);
  put(root, LINTER, `${readFileSync(join(root, LINTER), "utf8")}\n// BAD: atualização legítima do linter\n`);
  put(root, `${LEGACY}/machine/antigo.js`);
  git(root, "add", "-A");
  const clean = run(root, "check", "--staged", "--json");
  assert.equal(clean.status, 0, clean.stdout + clean.stderr);
  assert.deepEqual(findings(clean), []);
  put(root, "src/a.js");
  git(root, "add", "-A");
  const dirty = run(root, "check", "--staged", "--json");
  assert.equal(dirty.status, 1, "controle: o que está fora de machine/ continua barrado");
  assert.deepEqual(findings(dirty), ["src/a.js"]);
});

test("check <caminho de machine/> pelo nome: nada a analisar → 0", () => {
  const root = repo();
  const r = run(root, "check", LINTER, "--json");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(findings(r), []);
});

test("baseline init não registra achado em machine/", async () => {
  const root = await base();
  assert.deepEqual(loadBaseline(root).entries.map((e) => e.path), ["src/old.js"]);
});

test("baseline prune tira a entrada antiga com caminho em machine/", async () => {
  const root = await base();
  // Baseline criado antes desta mudança: o próprio linter aparecia como achado.
  saveBaseline(root, { version: 1, entries: [entry("src/old.js"), entry(LINTER), entry(`${LEGACY}/machine/antigo.js`)] });
  put(root, `${LEGACY}/machine/antigo.js`);
  const r = run(root, "baseline", "prune");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /2 entrada\(s\) removida\(s\)/);
  assert.deepEqual(loadBaseline(root).entries.map((e) => e.path), ["src/old.js"]);
});

test("gate --ci: linter novo em machine/ com conteúdo que viola outro standard → não é achado do check; quem fecha é a catraca (1)", async () => {
  const root = await base();
  put(root, `${CANON}/machine/std-novo.js`); // "BAD": violaria o std-demo se fosse analisado
  put(root, `${CANON}/machine/lib/util.js`);
  commit(root);
  const r = ci(root);
  // Arquivo novo em machine/ é violação da catraca; o check continua sem analisar o diretório.
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /linter novo: .*machine\/std-novo\.js \(não existia na base; arquivo novo em machine\/ exige revisão humana\)/);
  assert.match(r.stdout, /✓ standards: nenhuma violação nova de nível block/);
  assert.doesNotMatch(r.stdout + r.stderr, /violação\(ões\) nova\(s\)/);
});

test("gate --ci: com um linter novo em machine/, a violação nova fora dele continua barrada (1)", async () => {
  const root = await base();
  put(root, `${CANON}/machine/std-novo.js`);
  put(root, "src/new.js");
  commit(root);
  const r = ci(root);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /✗ 1 violação\(ões\) nova\(s\) de nível block/);
  assert.match(r.stdout, /src\/new\.js:1 \[std-demo\/no-bad\]/);
  assert.doesNotMatch(r.stdout, /machine\//);
});

test("gate --ci: alterar um linter existente continua sendo catraca enfraquecida (1)", async () => {
  const root = await base();
  put(root, LINTER, `${readFileSync(join(root, LINTER), "utf8")}\n// mexido\n`);
  commit(root);
  const r = ci(root);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /✗ catraca enfraquecida vs merge-base/);
  assert.match(r.stderr, /linter alterado: .*machine\/std-demo\.js \(exige revisão humana\)/);
});

test("gate --ci: remover um linter existente continua sendo catraca enfraquecida (1)", async () => {
  const root = await base({ setup: (r) => put(r, `${CANON}/machine/helper.js`, "module.exports = 1;\n") });
  rmSync(join(root, CANON, "machine/helper.js"));
  commit(root);
  const r = ci(root);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /linter removido: .*machine\/helper\.js/);
});

test("adoção legítima com linter que 'violaria' outro standard: init na branch → 0, sem entrada em machine/", async () => {
  const root = await base({ withBaseline: false });
  assert.equal(await human(root, "init"), 0);
  assert.deepEqual(loadBaseline(root).entries.map((e) => e.path), ["src/old.js"]);
  commit(root);
  const r = ci(root);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.doesNotMatch(r.stderr, /adoção aceita/);
});

// A conferência da adoção analisa a árvore da base pelo mesmo engine: lá `machine/` também não
// é analisado, então uma entrada com caminho em machine/ não tem lastro na base.
test("adoção: entrada do baseline com caminho em machine/ → a base não tinha (1)", async () => {
  const root = await base({ withBaseline: false });
  saveBaseline(root, { version: 1, entries: [entry("src/old.js"), entry(LINTER)] });
  commit(root);
  const r = ci(root);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /adoção aceita o que a base não tinha: std-demo\/no-bad em \.context\/engineering\/standards\/machine\/std-demo\.js/);
  assert.doesNotMatch(r.stderr, /src\/old\.js \(/);
});
