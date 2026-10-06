// Task 21 — CI do repo, CODEOWNERS, guia e CHANGELOG (teste estrutural).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readVerifyFromPath } from "../../scripts/lib/devflow-config.mjs";
import { codeownersFor, codeownersRules } from "../../scripts/lib/standards-label-approval.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");
const DONO = "@walterfrey";

test("CI do repo roda o sinal standards", () => {
  assert.match(read(".github/workflows/test.yml"), /signal: \[unit, integration, e2e, lint, standards\]/);
});

test("test.yml não ganha as peças do override (sem rótulo, sem review, sem token de PR)", () => {
  const y = read(".github/workflows/test.yml");
  assert.doesNotMatch(y, /DEVFLOW_PR_NUMBER|DEVFLOW_REPO/);
  assert.doesNotMatch(y, /pull-requests:/);
  assert.doesNotMatch(y, /pull_request_review|labeled/);
  assert.match(y, /SEIS checks/);
  for (const n of ["sinal: unit", "sinal: integration", "sinal: e2e", "sinal: lint", "sinal: standards", "guards (anti-tamper, independentes de verify.lint)"]) assert.ok(y.includes(n), `check ${n}`);
});

test("o próprio repo declara o sinal reservado", () => {
  assert.deepEqual(readVerifyFromPath(join(ROOT, ".context/.devflow.yaml")).signals.standards, ["devflow-standards", "gate"]);
});

test("CODEOWNERS cobre a catraca", () => {
  const c = read(".github/CODEOWNERS");
  assert.match(c, /\/\.context\/engineering\/standards\//);
  assert.match(c, /\/assets\/standards\/machine\//);
});

test("CODEOWNERS: os caminhos da catraca e do executor resolvem para o dono, pelo leitor do gate", () => {
  const c = read(".github/CODEOWNERS");
  const caminhos = [
    // catraca (standards-ratchet.mjs: stdRels, localRel, cfgRel, shimRel, node_modules)
    ".context/engineering/standards/baseline.json",
    ".context/engineering/standards/std-security.md",
    ".context/engineering/standards/machine/std-x.js",
    ".context/standards/std-legado.md",
    ".context/standards/machine/std-legado.js",
    ".context/standards.local.yaml",
    ".context/.devflow.yaml",
    ".context/bin/devflow-standards.mjs",
    ".context/bin/devflow-plugin.ref",
    ".context/engineering/standards/machine/node_modules/pacote/index.js",
    // executor: o plugin é o próprio PR neste repositório
    "scripts/devflow-standards.mjs",
    "scripts/lib/verify-run.mjs",
    "scripts/lib/run-linter.mjs",
    "scripts/lib/verify-gate.mjs",
    "scripts/lib/standards-ratchet.mjs",
    "scripts/lib/standards-label-approval.mjs",
    "scripts/lib/context-paths.mjs",   // define os caminhos da catraca
    "scripts/lib/devflow-config.mjs",  // lê o verify:
    "scripts/lib/path-guard.mjs",
    "assets/standards/std-security.md", // o nível que o gate aplica vem do .md default
    "assets/standards/MANIFEST.txt",
    "assets/standards/machine/std-security.js",
    "assets/standards/bin/devflow-standards.mjs",
    "assets/standards/ci/github-actions.yml",
    ".github/workflows/test.yml",
    ".github/CODEOWNERS",
  ];
  for (const p of caminhos) assert.deepEqual(codeownersFor(c, p), [DONO], `${p} deveria ter o dono ${DONO}`);
});

test("CODEOWNERS: as regras da catraca vêm por último e usam /pasta/ (nunca dir/*)", () => {
  const regras = codeownersRules(read(".github/CODEOWNERS"));
  assert.ok(regras.length >= 5, "as cinco linhas do brief são obrigatórias");
  for (const r of regras) {
    assert.deepEqual(r.owners, [DONO]);
    assert.equal(r.odd, false);
    assert.doesNotMatch(r.pattern, /\/\*$/, `padrão ${r.pattern}: dir/* não alcança arquivo aninhado`);
  }
  const idx = (p) => regras.findIndex(r => r.pattern === p);
  const executor = idx("/scripts/");
  assert.ok(executor >= 0, "scripts/ inteiro com dono");
  assert.ok(idx("/assets/standards/") >= 0, "assets/standards/ inteiro com dono");
  for (const p of ["/assets/standards/machine/", "/assets/standards/bin/", "/scripts/lib/standards-*.mjs"]) {
    assert.ok(idx(p) >= 0, `linha literal do brief: ${p}`);
  }
  for (const p of ["/.context/engineering/standards/", "/.context/standards/", "/.context/standards.local.yaml", "/.context/.devflow.yaml", "/.context/bin/"]) {
    assert.ok(idx(p) > executor, `${p} deve vir depois das regras do executor`);
  }
  assert.ok(idx("/.context/engineering/standards/") > idx("/assets/standards/ci/"), "catraca por último");
});

test("guia cobre baseline, enforce, gate, exit codes e limites", () => {
  assert.ok(existsSync(join(ROOT, "docs/guia-enforcement-standards.md")));
  const g = read("docs/guia-enforcement-standards.md");
  for (const re of [/baseline init/, /enforce/, /gate --base-ref/, /exit 3/, /--no-verify/, /terminal interativo/, /script -qc/, /executa o JS de `machine\/`/, /Node no runner/, /standards-ratchet-approved/, /credencial de code owner/, /público/, /GitLab/, /junto do resultado/]) assert.match(g, re);
});

test("guia tem as três seções pedidas e o review no último commit", () => {
  const g = read("docs/guia-enforcement-standards.md");
  for (const t of ["Limites e resíduos conhecidos", "Não verificado em ambiente real", "Nota de migração"]) {
    assert.match(g, new RegExp(`^#{2,3} ${t}`, "m"), `seção '${t}'`);
  }
  assert.match(g, /último commit/);
  assert.match(g, /devflow-plugin\.ref/);
  assert.match(g, /DEVFLOW_PR_NUMBER/);
  assert.match(g, /Require review from Code Owners/);
  assert.match(g, /sinal: standards/);
  assert.match(g, /guards \(anti-tamper, independentes de verify\.lint\)/);
  assert.doesNotMatch(g, /Nada passa a bloquear sozinho/);
});

test("CHANGELOG tem a entrada", () => {
  assert.match(read("CHANGELOG.md"), /enforcement determinístico de standards/i);
});
