// tests/integration/test-standards-gate-new-linter.mjs — arquivo novo em `machine/` é violação da
// catraca (achado C-1 da re-revisão da onda B; onda C, item C1).
//
// O contorno: o check não analisa `machine/` (canônico e legado). Um PR criava ali um arquivo com
// código que viola um standard `block`, importava-o da aplicação, e o `gate --ci` saía 0 só com a
// nota "linter novo". A regra: qualquer arquivo novo em `machine/`, nos dois layouts, é violação;
// no GitHub só entra com o override de quem é dono do caminho no CODEOWNERS da base. Exceção
// única, a adoção: a base não tem nada em nenhum dos dois diretórios de standards.
// Nenhum teste chama a API real do GitHub: a API é injetada.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import { writeFileSync, readFileSync, rmSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { runStandardsCommand } from "../../scripts/lib/standards-check-cli.mjs";
import { codeownersSnippet } from "../../scripts/lib/standards-gates.mjs";
import { demoProject as rawDemoProject, isolateFromDefaults, LINT_BAD } from "../helpers/standards-fixture.mjs";

const CLI = join(process.cwd(), "scripts/devflow-standards.mjs");
const env = { ...process.env, CI: "" };
const TEMPS = [];
after(() => { for (const d of TEMPS) rmSync(d, { recursive: true, force: true }); });

const REF = "refs/heads/main";
const CANON = ".context/engineering/standards";
const LEGACY = ".context/standards";
const DEVFLOW_YAML = 'git:\n  strategy: branch-flow\nverify:\n  standards: ["devflow-standards", "gate"]\n';
// O que a oferta gerava para o CODEOWNERS do cliente até esta onda: só o layout canônico tem dono.
const CODEOWNERS_CANON_ONLY = `/${CANON}/ @dona\n/.context/standards.local.yaml @dona\n/.context/.devflow.yaml @dona\n/.context/bin/ @dona\n`;
const STD_MD = `---\nid: std-demo\nsource: local\ndescription: demo\napplyTo: ["**/*.js"]\nenforcement:\n  linter: engineering/standards/machine/std-demo.js\n  level: block\n---\n## Princípios\n- sem BAD\n`;

const git = (root, ...a) => execFileSync("git", ["-C", root, ...a], { encoding: "utf8" });
const run = (root, ...a) => spawnSync("node", [CLI, ...a, `--project=${root}`], { encoding: "utf8", env });
const ci = (root) => run(root, "gate", `--base-ref=${REF}`, "--ci");
const human = (root, ...a) => runStandardsCommand("baseline", a, root, { isInteractive: () => true });
const w = (root, rel, text) => { mkdirSync(dirname(join(root, rel)), { recursive: true }); writeFileSync(join(root, rel), text); };
const commit = (root, msg = "x") => { git(root, "add", "-A"); git(root, "commit", "-qm", msg); };
const NEW_LINTER = (rel) => new RegExp(`linter novo: ${rel.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")} \\(não existia na base`);

// Projeto no layout canônico com o std-demo (block) valendo para todo `.js`, baseline na base e a
// branch `feat` aberta em cima. `codeowners`: o CODEOWNERS da base.
async function project({ codeowners = CODEOWNERS_CANON_ONLY, setup = null } = {}) {
  const root = rawDemoProject();
  TEMPS.push(root);
  w(root, `${CANON}/std-demo.md`, STD_MD);
  git(root, "init", "-q", "-b", "main"); git(root, "config", "user.email", "t@t"); git(root, "config", "user.name", "t");
  w(root, ".context/.devflow.yaml", DEVFLOW_YAML);
  if (codeowners) w(root, ".github/CODEOWNERS", codeowners);
  w(root, "src/old.js", "BAD\n");
  if (setup) setup(root);
  git(root, "add", "-A");
  assert.equal(await human(root, "init"), 0);
  commit(root, "base");
  git(root, "checkout", "-q", "-b", "feat");
  return root;
}

// O PR do contorno: código que viola o standard `block` num arquivo novo de `machine/`, importado
// pela aplicação.
function smuggle(root, machineDir) {
  w(root, `${machineDir}/app.js`, "module.exports = () => 'BAD';\n");
  w(root, "src/main.js", `module.exports = require("../${machineDir}/app.js");\n`);
  commit(root, "código de aplicação estacionado em machine/");
}

// ── A tabela da prova do parecer: as três linhas saem 1 ────────────────────────────────────────

test("C-1: arquivo novo no machine/ LEGADO de um projeto canônico → gate --ci 1", async () => {
  const root = await project();
  smuggle(root, `${LEGACY}/machine`);
  const r = ci(root);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /✗ catraca enfraquecida vs merge-base/);
  assert.match(r.stderr, NEW_LINTER(`${LEGACY}/machine/app.js`));
  assert.doesNotMatch(r.stderr, /nota: linter novo/);
  // Quem fecha é a catraca: o check continua sem analisar machine/.
  assert.doesNotMatch(r.stdout, /violação\(ões\) nova\(s\)/);
});

test("C-1: arquivo novo no machine/ CANÔNICO → gate --ci 1", async () => {
  const root = await project();
  smuggle(root, `${CANON}/machine`);
  const r = ci(root);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /✗ catraca enfraquecida vs merge-base/);
  assert.match(r.stderr, NEW_LINTER(`${CANON}/machine/app.js`));
  assert.doesNotMatch(r.stderr, /nota: linter novo/);
});

test("C-1 (controle): o mesmo código em src/ → gate --ci 1, pelo check", async () => {
  const root = await project();
  w(root, "src/app.js", "module.exports = () => 'BAD';\n");
  commit(root);
  const r = ci(root);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /✗ 1 violação\(ões\) nova\(s\) de nível block/);
  assert.match(r.stdout, /src\/app\.js:1 \[std-demo\/no-bad\]/);
});

test("arquivo novo em subdiretório de machine/ e em machine/ de standard novo também é violação", async () => {
  const root = await project();
  w(root, `${CANON}/machine/lib/util.js`, "module.exports = 1;\n");
  w(root, `${CANON}/std-novo.md`, STD_MD.replace(/std-demo/g, "std-novo"));
  w(root, `${CANON}/machine/std-novo.js`, "process.exitCode = 0;\n");
  commit(root);
  const r = ci(root);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, NEW_LINTER(`${CANON}/machine/lib/util.js`));
  assert.match(r.stderr, NEW_LINTER(`${CANON}/machine/std-novo.js`));
});

test("sem --ci (fase V local) o arquivo novo em machine/ é nota de catraca enfraquecida, não erro", async () => {
  const root = await project();
  smuggle(root, `${CANON}/machine`);
  const r = run(root, "gate", `--base-ref=${REF}`);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stderr, /nota: catraca enfraquecida vs merge-base \(o CI vai falhar sem aprovação de code owner\)/);
  assert.match(r.stderr, NEW_LINTER(`${CANON}/machine/app.js`));
});

test("alterar um linter existente continua sendo violação", async () => {
  const root = await project();
  w(root, `${CANON}/machine/std-demo.js`, `${readFileSync(join(root, CANON, "machine/std-demo.js"), "utf8")}\n// mexido\n`);
  commit(root);
  const r = ci(root);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /linter alterado: .*machine\/std-demo\.js \(exige revisão humana\)/);
});

// ── Override ───────────────────────────────────────────────────────────────────────────────────

const LABEL = "standards-ratchet-approved";
function fakeApi(root) {
  return (path) => {
    const sha = git(root, "rev-parse", "HEAD").trim();
    if (/\/pulls\/\d+$/.test(path)) return { user: { login: "agente" }, state: "open", head: { sha } };
    const ev = path.match(/\/issues\/\d+\/events\?per_page=100&page=(\d+)$/);
    if (ev) return ev[1] === "1" ? [{ event: "labeled", label: { name: LABEL }, actor: { login: "dona", type: "User" } }] : [];
    const rv = path.match(/\/pulls\/\d+\/reviews\?per_page=100&page=(\d+)$/);
    if (rv) return rv[1] === "1" ? [{ id: 1, user: { login: "dona", type: "User" }, state: "APPROVED", commit_id: sha }] : [];
    throw new Error(`rota inesperada ${path}`);
  };
}
async function approvedByDona(root) {
  const out = [];
  const oe = console.error, ol = console.log;
  console.error = (...m) => out.push(m.map(String).join(" ")); console.log = (...m) => out.push(m.map(String).join(" "));
  try {
    const code = await runStandardsCommand("gate", [`--base-ref=${REF}`, "--ci", "--allow-weakening", "--pr=7", "--repo=o/r"], root, { isInteractive: () => false, api: fakeApi(root) });
    return { code, out: out.join("\n") };
  } finally { console.error = oe; console.log = ol; }
}

test("override de quem é dono do layout libera o arquivo novo em machine/ → 0", async () => {
  const root = await project();
  smuggle(root, `${CANON}/machine`);
  const r = await approvedByDona(root);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /⚠ catraca enfraquecida vs merge-base, aprovada por code owner/);
  assert.match(r.out, NEW_LINTER(`${CANON}/machine/app.js`));
});

test("layout sem dono no CODEOWNERS da base: o override não tem aprovador e o gate fecha → 1", async () => {
  const root = await project(); // o CODEOWNERS da base só cobre o layout canônico
  smuggle(root, `${LEGACY}/machine`);
  const r = await approvedByDona(root);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /✗ catraca enfraquecida vs merge-base/);
  assert.match(r.out, /sem responsável: \.context\/standards\/machine\/app\.js — nenhuma regra casa/);
  assert.doesNotMatch(r.out, /aprovada por code owner/);
});

// C2: o trecho que a oferta gera hoje dá dono aos dois layouts.
test("com o trecho de CODEOWNERS gerado pela oferta na base, o dono aprova o arquivo novo no machine/ legado → 0", async () => {
  const root = await project({ codeowners: `* @todos\n${codeownersSnippet("@dona")}` });
  smuggle(root, `${LEGACY}/machine`);
  const semOverride = ci(root);
  assert.equal(semOverride.status, 1, semOverride.stdout + semOverride.stderr);
  const r = await approvedByDona(root);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /⚠ catraca enfraquecida vs merge-base, aprovada por code owner/);
  assert.match(r.out, NEW_LINTER(`${LEGACY}/machine/app.js`));
});

test("o CODEOWNERS é o da BASE: dar dono ao layout legado no próprio PR não libera → 1", async () => {
  const root = await project();
  w(root, ".github/CODEOWNERS", `${CODEOWNERS_CANON_ONLY}/${LEGACY}/ @dona\n`);
  smuggle(root, `${LEGACY}/machine`);
  const r = await approvedByDona(root);
  assert.equal(r.code, 1, r.out);
  assert.doesNotMatch(r.out, /aprovada por code owner/);
});

// ── A exceção: o PR de adoção de verdade ───────────────────────────────────────────────────────

// Base de um projeto que ainda não tem standards: nada em nenhum dos dois diretórios. O
// `standards.local.yaml` e o `.devflow.yaml` moram fora deles.
function bare({ setup = null } = {}) {
  const root = mkdtempSync(join(tmpdir(), "std-adocao-"));
  TEMPS.push(root);
  isolateFromDefaults(root);
  git(root, "init", "-q", "-b", "main"); git(root, "config", "user.email", "t@t"); git(root, "config", "user.name", "t");
  w(root, ".context/.devflow.yaml", DEVFLOW_YAML);
  w(root, "src/ok.js", "module.exports = 1;\n");
  if (setup) setup(root);
  commit(root, "base sem standards");
  git(root, "checkout", "-q", "-b", "feat");
  return root;
}
// O que o PR de adoção traz: o standard, o linter dele e um auxiliar.
function adopt(root) {
  w(root, `${CANON}/std-demo.md`, STD_MD);
  w(root, `${CANON}/machine/std-demo.js`, LINT_BAD);
  w(root, `${CANON}/machine/lib/util.js`, "module.exports = 1;\n");
}

test("adoção de verdade (a base não tem nada nos dois diretórios de standards): os linters novos são nota → 0", async () => {
  const root = bare();
  assert.equal(git(root, "ls-tree", "-r", "--name-only", "main", "--", CANON, LEGACY).trim(), "", "premissa: a base não tem arquivo da catraca");
  adopt(root);
  git(root, "add", "-A");
  assert.equal(await human(root, "init"), 0);
  commit(root, "adoção");
  const r = ci(root);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stderr, /nota: linter novo: \.context\/engineering\/standards\/machine\/std-demo\.js \(não existia na base\)/);
  assert.match(r.stderr, /nota: linter novo: \.context\/engineering\/standards\/machine\/lib\/util\.js \(não existia na base\)/);
  assert.doesNotMatch(r.stderr, /catraca enfraquecida/);
});

// O que decide a adoção é o conteúdo da BASE. Um único arquivo num dos dois diretórios basta
// para o PR não ser adoção — mesmo que seja no outro layout, e mesmo sem machine/ na base.
for (const [label, rel] of [
  ["um standard sem linter no layout canônico", `${CANON}/std-texto.md`],
  ["um arquivo qualquer no layout legado", `${LEGACY}/README.md`],
  ["só o baseline", `${CANON}/baseline.json`],
]) {
  test(`não é adoção quando a base tem ${label}: linter novo → 1`, async () => {
    const root = bare({ setup: (r) => w(r, rel, rel.endsWith(".json") ? '{"version":1,"entries":[]}\n' : "# texto\n") });
    adopt(root);
    commit(root, "parece adoção, mas a base já tinha arquivo da catraca");
    const r = ci(root);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stderr, NEW_LINTER(`${CANON}/machine/std-demo.js`));
    assert.doesNotMatch(r.stderr, /nota: linter novo/);
  });
}

test("o PR não fabrica adoção apagando os standards da base: continua violação → 1", async () => {
  const root = await project();
  // Apaga tudo o que a base tinha nos diretórios de standards e traz "a adoção" de novo, com um arquivo a mais.
  rmSync(join(root, CANON), { recursive: true });
  adopt(root);
  w(root, `${CANON}/machine/app.js`, "module.exports = () => 'BAD';\n");
  commit(root);
  const r = ci(root);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, NEW_LINTER(`${CANON}/machine/app.js`));
  assert.doesNotMatch(r.stderr, /nota: linter novo/);
});
