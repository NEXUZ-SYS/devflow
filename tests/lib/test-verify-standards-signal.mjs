// tests/lib/test-verify-standards-signal.mjs — sinal `standards` reservado (ADR-013 v1.1.0 / ADR-015).
// O argv do sinal é um token reservado que o plugin resolve pela própria raiz: um comando do
// projeto nunca roda no lugar dele, e com std `block` o gate da fase V falha fechado sem ele.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { readVerify, RESERVED_STANDARDS_ARGV } from "../../scripts/lib/devflow-config.mjs";
import { evaluateGate, hasBlockingStandard } from "../../scripts/lib/verify-gate.mjs";
import { resolveArgv, runSignal } from "../../scripts/lib/verify-run.mjs";
import { harnessArgv } from "../../scripts/lib/sensors-from-verify.mjs";
import { appendEntry, lastEntry } from "../../scripts/lib/verify-ledger.mjs";
import { treeDigest } from "../../scripts/lib/verify-tree-digest.mjs";
import { demoProject } from "../helpers/standards-fixture.mjs";

const RESERVED = 'verify:\n  standards: ["devflow-standards", "gate"]\n';
const VERIFY_RUN = join(process.cwd(), "scripts/lib/verify-run.mjs");
// Projetos de teste criados em tmpdir: apagados ao fim do arquivo.
const TEMPS = [];
after(() => { for (const d of TEMPS) rmSync(d, { recursive: true, force: true }); });

test("RESERVED_STANDARDS_ARGV é o token reservado do contrato", () => {
  assert.deepEqual(RESERVED_STANDARDS_ARGV, ["devflow-standards", "gate"]);
});

test("readVerify aceita só o argv reservado para standards", () => {
  assert.deepEqual(readVerify(RESERVED).signals.standards, ["devflow-standards", "gate"]);
  assert.throws(() => readVerify('verify:\n  standards: ["node", "x.mjs"]\n'), /devflow-standards/);
  assert.throws(() => readVerify('verify:\n  standards: ["devflow-standards", "gate", "--x"]\n'), /devflow-standards/);
  assert.throws(() => readVerify('verify:\n  standards: ["devflow-standards"]\n'), /devflow-standards/);
  assert.throws(() => readVerify('verify:\n  standards: "devflow-standards gate"\n'), /devflow-standards/);
});

test("vocabulário fechado lista o sinal standards na mensagem", () => {
  assert.throws(() => readVerify('verify:\n  smoke: ["bash", "x.sh"]\n'), /unit, integration, e2e, lint, standards/);
});

test("resolveArgv expande pelo próprio plugin, sem argv relativo ao projeto", () => {
  const a = resolveArgv("standards", ["devflow-standards", "gate"], { ci: false, baseRef: "origin/main" });
  assert.equal(a[0], process.execPath);
  assert.equal(a[1], join(process.cwd(), "scripts", "devflow-standards.mjs"));
  assert.deepEqual(a.slice(2), ["gate", "--base-ref=origin/main"]);
  assert.deepEqual(resolveArgv("unit", ["bash", "x.sh"]), ["bash", "x.sh"]);
});

test("resolveArgv: --ci só em CI; fora de CI a expansão não passa --ci", () => {
  const ci = resolveArgv("standards", RESERVED_STANDARDS_ARGV, { ci: true, baseRef: "origin/dev" });
  assert.deepEqual(ci.slice(2), ["gate", "--base-ref=origin/dev", "--ci"]);
  const local = resolveArgv("standards", RESERVED_STANDARDS_ARGV, { ci: false, baseRef: "origin/dev" });
  assert.ok(!local.includes("--ci"));
});

// T18: o default de `ci` vem do isCI() do CLI — CI=1 (e qualquer valor não vazio ≠ false/0)
// conta como CI, igual ao `gate`. Antes o verify-run só reconhecia CI === "true".
test("resolveArgv: sem opção explícita, CI=1 e CI=true passam --ci; CI vazio, 0 e false não", () => {
  const saved = process.env.CI;
  const tail = () => resolveArgv("standards", RESERVED_STANDARDS_ARGV, { baseRef: "origin/main" }).slice(2);
  try {
    for (const v of ["1", "true", "yes"]) {
      process.env.CI = v;
      assert.deepEqual(tail(), ["gate", "--base-ref=origin/main", "--ci"], `CI=${v}`);
    }
    for (const v of ["", "0", "false"]) {
      process.env.CI = v;
      assert.deepEqual(tail(), ["gate", "--base-ref=origin/main"], `CI=${JSON.stringify(v)}`);
    }
    delete process.env.CI;
    assert.deepEqual(tail(), ["gate", "--base-ref=origin/main"]);
  } finally {
    if (saved === undefined) delete process.env.CI; else process.env.CI = saved;
  }
});

// Rodada 1 (C1): a base padrão vai na forma completa — um nome curto pode ser tomado por uma
// tag homônima. Um BASE_REF do ambiente é repassado como veio (o gate o resolve sem ambiguidade).
test("resolveArgv: sem BASE_REF a base é refs/remotes/origin/main; com BASE_REF, o valor do ambiente", () => {
  const saved = process.env.BASE_REF;
  try {
    delete process.env.BASE_REF;
    assert.deepEqual(resolveArgv("standards", RESERVED_STANDARDS_ARGV, { ci: true }).slice(2), ["gate", "--base-ref=refs/remotes/origin/main", "--ci"]);
    process.env.BASE_REF = "origin/develop";
    assert.deepEqual(resolveArgv("standards", RESERVED_STANDARDS_ARGV, { ci: false }).slice(2), ["gate", "--base-ref=origin/develop"]);
  } finally {
    if (saved === undefined) delete process.env.BASE_REF; else process.env.BASE_REF = saved;
  }
});

// T19: no CI, o override do gate (`--allow-weakening --pr --repo`) entra quando o ambiente traz o
// PR e o repositório, bem formados. Sem isso, um PR com o override aprovado ficava vermelho na
// matriz do verify. Variável ausente ou inválida = sem override: o gate segue fechado, e nunca
// recebe um argumento malformado (que seria uso incorreto, exit 2).
test("resolveArgv: DEVFLOW_PR_NUMBER e DEVFLOW_REPO válidos repassam o override — só em CI", () => {
  const env = { DEVFLOW_PR_NUMBER: "42", DEVFLOW_REPO: "acme/app" };
  assert.deepEqual(
    resolveArgv("standards", RESERVED_STANDARDS_ARGV, { ci: true, baseRef: "refs/remotes/origin/main", env }).slice(2),
    ["gate", "--base-ref=refs/remotes/origin/main", "--ci", "--allow-weakening", "--pr=42", "--repo=acme/app"],
  );
  assert.deepEqual(
    resolveArgv("standards", RESERVED_STANDARDS_ARGV, { ci: false, baseRef: "origin/main", env }).slice(2),
    ["gate", "--base-ref=origin/main"],
    "fora do CI o gate não consulta override; as variáveis não entram",
  );
});

test("resolveArgv: variável ausente ou inválida significa sem override", () => {
  const tail = (env) => resolveArgv("standards", RESERVED_STANDARDS_ARGV, { ci: true, baseRef: "origin/main", env }).slice(2);
  const plain = ["gate", "--base-ref=origin/main", "--ci"];
  for (const env of [
    {}, { DEVFLOW_PR_NUMBER: "42" }, { DEVFLOW_REPO: "acme/app" },
    { DEVFLOW_PR_NUMBER: "", DEVFLOW_REPO: "acme/app" }, { DEVFLOW_PR_NUMBER: "42", DEVFLOW_REPO: "" },
    { DEVFLOW_PR_NUMBER: "abc", DEVFLOW_REPO: "acme/app" }, { DEVFLOW_PR_NUMBER: "7;id", DEVFLOW_REPO: "acme/app" },
    { DEVFLOW_PR_NUMBER: "007", DEVFLOW_REPO: "acme/app" }, { DEVFLOW_PR_NUMBER: "-1", DEVFLOW_REPO: "acme/app" },
    { DEVFLOW_PR_NUMBER: "42\n", DEVFLOW_REPO: "acme/app" }, { DEVFLOW_PR_NUMBER: " 42", DEVFLOW_REPO: "acme/app" },
    { DEVFLOW_PR_NUMBER: "42", DEVFLOW_REPO: "acme" }, { DEVFLOW_PR_NUMBER: "42", DEVFLOW_REPO: "acme/app/x" },
    { DEVFLOW_PR_NUMBER: "42", DEVFLOW_REPO: "../.." }, { DEVFLOW_PR_NUMBER: "42", DEVFLOW_REPO: "acme/app --jq .x" },
    { DEVFLOW_PR_NUMBER: "42", DEVFLOW_REPO: "acme/app\n" },
  ]) assert.deepEqual(tail(env), plain, JSON.stringify(env));
});

test("resolveArgv: sem `env` explícito, as variáveis vêm do ambiente do processo", () => {
  const saved = { pr: process.env.DEVFLOW_PR_NUMBER, repo: process.env.DEVFLOW_REPO };
  const tail = () => resolveArgv("standards", RESERVED_STANDARDS_ARGV, { ci: true, baseRef: "origin/main" }).slice(2);
  try {
    delete process.env.DEVFLOW_PR_NUMBER; delete process.env.DEVFLOW_REPO;
    assert.deepEqual(tail(), ["gate", "--base-ref=origin/main", "--ci"]);
    process.env.DEVFLOW_PR_NUMBER = "9"; process.env.DEVFLOW_REPO = "o/r";
    assert.deepEqual(tail(), ["gate", "--base-ref=origin/main", "--ci", "--allow-weakening", "--pr=9", "--repo=o/r"]);
  } finally {
    for (const [k, v] of [["DEVFLOW_PR_NUMBER", saved.pr], ["DEVFLOW_REPO", saved.repo]]) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  }
});

test("verify-run em CI: com o PR e o repositório no ambiente, o override aprovado deixa o sinal verde", () => {
  const d = repo({ verify: RESERVED });
  const g = (...a) => execFileSync("git", ["-C", d, ...a], { encoding: "utf8" });
  g("config", "user.email", "t@t"); g("config", "user.name", "t");
  writeFileSync(join(d, "CODEOWNERS"), "/.context/ @dona\n");
  writeFileSync(join(d, "src/a.js"), "ok\n");
  g("add", "-A"); g("commit", "-qm", "base"); g("checkout", "-q", "-b", "feat");
  const md = join(d, ".context/engineering/standards/std-demo.md");
  writeFileSync(md, readFileSync(md, "utf8").replace("level: block", "level: warn"));
  g("add", "-A"); g("commit", "-qm", "rebaixa o nível");
  const sha = g("rev-parse", "HEAD").trim();
  // `gh` de mentira (sem rede): rótulo e review da dona, no head do PR.
  const bin = mkdtempSync(join(tmpdir(), "gh-")); TEMPS.push(bin);
  const label = "standards-ratchet-approved";
  writeFileSync(join(bin, "gh"), `#!/usr/bin/env bash
case "$*" in
  *"repos/o/r/pulls/7") echo '{"user":{"login":"agente"},"state":"open","head":{"sha":"${sha}"},"labels":[{"name":"${label}"}]}' ;;
  *"/events?per_page=100&page=1") echo '[{"event":"labeled","label":{"name":"${label}"},"actor":{"login":"dona","type":"User"},"created_at":"2026-01-01T00:00:00Z","id":1}]' ;;
  *"/reviews?per_page=100&page=1") echo '[{"id":9,"user":{"login":"dona","type":"User"},"state":"APPROVED","commit_id":"${sha}","submitted_at":"2026-01-01T01:00:00Z"}]' ;;
  *"page="*) echo '[]' ;;
  *) exit 1 ;;
esac
`);
  chmodSync(join(bin, "gh"), 0o755);
  const env = { ...process.env, CI: "1", BASE_REF: "refs/heads/main", PATH: `${bin}${delimiter}${process.env.PATH}` };
  delete env.CLAUDE_PLUGIN_ROOT; delete env.DEVFLOW_PR_NUMBER; delete env.DEVFLOW_REPO;
  const without = spawnSync("node", [VERIFY_RUN, "standards", d], { cwd: "/", encoding: "utf8", env });
  assert.equal(without.status, 1, without.stderr);
  assert.match(without.stderr, /catraca enfraquecida/);
  assert.equal(lastEntry(d, "standards").exit, 1);
  const invalid = spawnSync("node", [VERIFY_RUN, "standards", d], { cwd: "/", encoding: "utf8", env: { ...env, DEVFLOW_PR_NUMBER: "7;id", DEVFLOW_REPO: "o/r" } });
  assert.equal(invalid.status, 1, "variável inválida: sem override, e não uso incorreto (2)");
  const withPr = spawnSync("node", [VERIFY_RUN, "standards", d], { cwd: "/", encoding: "utf8", env: { ...env, DEVFLOW_PR_NUMBER: "7", DEVFLOW_REPO: "o/r" } });
  assert.equal(withPr.status, 0, withPr.stderr);
  assert.match(withPr.stderr, /aprovada por code owner/);
  assert.equal(lastEntry(d, "standards").exit, 0);
});

test("verify-run com CI=1 roda o gate em modo CI: sem merge-base → exit 3 no ledger", () => {
  const d = repo({ verify: RESERVED });
  writeFileSync(join(d, "src/a.js"), "ok\n");
  const env = { ...process.env, CI: "1", BASE_REF: "origin/nao-existe" }; delete env.CLAUDE_PLUGIN_ROOT;
  const r = spawnSync("node", [VERIFY_RUN, "standards", d], { cwd: "/", encoding: "utf8", env });
  assert.equal(r.status, 3, r.stderr);
  assert.equal(lastEntry(d, "standards").exit, 3);
  const local = spawnSync("node", [VERIFY_RUN, "standards", d], { cwd: "/", encoding: "utf8", env: { ...env, CI: "" } });
  assert.equal(local.status, 0, local.stderr);
});

test("resolveArgv ignora qualquer argv do projeto para standards (sempre o reservado do plugin)", () => {
  const a = resolveArgv("standards", ["node", "x.js"], { ci: false, baseRef: "origin/main" });
  assert.equal(a[1], join(process.cwd(), "scripts", "devflow-standards.mjs"));
  assert.ok(!a.includes("x.js"));
});

function repo({ level = "block", verify = null } = {}) {
  const d = demoProject({ level });
  TEMPS.push(d);
  execFileSync("git", ["init", "-q", "-b", "main", d]);
  writeFileSync(join(d, ".context/.devflow.yaml"), `git:\n  strategy: branch-flow\n${verify ?? ""}`);
  return d;
}

// Política do stub (ADR-013 v1.1.0): o contrato é RECUSADO. O x.js do projeto nunca roda
// para o sinal standards, nenhuma entrada verde entra no ledger e o gate BLOCKa.
test("stub do projeto não forja o verde: contrato recusado, x.js não roda, ledger sem verde", () => {
  const d = repo({ verify: 'verify:\n  standards: ["node", "x.js"]\n' });
  const marker = join(d, "rodou.txt");
  writeFileSync(join(d, "x.js"), `require("fs").writeFileSync(${JSON.stringify(marker)}, "sim"); process.exit(0);\n`);
  assert.throws(() => runSignal("standards", { root: d }), /devflow-standards/);
  const cli = spawnSync("node", [VERIFY_RUN, "standards", d], { encoding: "utf8" });
  assert.notEqual(cli.status, 0);
  assert.equal(existsSync(marker), false, "o x.js do projeto não pode rodar");
  assert.equal(lastEntry(d, "standards"), null);
  const r = evaluateGate({ root: d, requiredSignals: [] });
  assert.equal(r.pass, false);
  assert.equal(r.warnOnly, false);
});

test("hasBlockingStandard: block → true; só warn → false", () => {
  assert.equal(hasBlockingStandard(repo({})), true);
  assert.equal(hasBlockingStandard(repo({ level: "warn" })), false);
});

test("std block sem verify: nenhum → BLOCK standards (não warn-only)", () => {
  const r = evaluateGate({ root: repo({}), requiredSignals: [] });
  assert.equal(r.pass, false);
  assert.equal(r.warnOnly, false);
  assert.equal(r.blocks[0].signal, "standards");
});

test("std block com verify sem standards → BLOCK", () => {
  const r = evaluateGate({ root: repo({ verify: 'verify:\n  unit: ["bash","ok.sh"]\n' }), requiredSignals: [] });
  assert.equal(r.pass, false);
  assert.ok(r.blocks.some(b => b.signal === "standards"));
});

test("std block com standards declarado → exigido no ledger (sem entrada → BLOCK)", () => {
  const r = evaluateGate({ root: repo({ verify: RESERVED }), requiredSignals: [] });
  assert.equal(r.pass, false);
  assert.equal(r.blocks[0].signal, "standards");
  assert.match(r.blocks[0].reason, /sem observação/);
});

test("std block com standards vermelho no ledger (exit 1 e exit 3) → BLOCK", () => {
  for (const exit of [1, 3]) {
    const d = repo({ verify: RESERVED });
    appendEntry(d, { signal: "standards", exit, treeDigest: treeDigest(d), at: "x" });
    const r = evaluateGate({ root: d, requiredSignals: [] });
    assert.equal(r.pass, false, `exit ${exit}`);
    assert.match(r.blocks[0].reason, /vermelho/);
  }
});

test("std block com standards verde e digest atual → PASS; sem duplicar em requiredSignals", () => {
  const d = repo({ verify: RESERVED });
  appendEntry(d, { signal: "standards", exit: 0, treeDigest: treeDigest(d), at: "x" });
  const r = evaluateGate({ root: d, requiredSignals: ["standards"] });
  assert.equal(r.pass, true, JSON.stringify(r.blocks));
  assert.equal(r.warnOnly, false);
});

test("só std warn → standards não é exigido", () => {
  assert.equal(evaluateGate({ root: repo({ level: "warn" }), requiredSignals: [] }).pass, true);
});

test("harnessArgv: standards vira o verify-run do plugin; demais sinais inalterados", () => {
  assert.deepEqual(harnessArgv("standards", RESERVED_STANDARDS_ARGV), ["node", VERIFY_RUN, "standards"]);
  assert.deepEqual(harnessArgv("unit", ["bash", "tests/run-unit.sh"]), ["bash", "tests/run-unit.sh"]);
});

test("catálogo do harness traduz o sinal reservado para o verify-run do plugin", async () => {
  const { buildCatalog } = await import("../../scripts/lib/sensors-from-verify.mjs");
  const c = buildCatalog({ signals: { unit: ["bash", "tests/run-unit.sh"], standards: ["devflow-standards", "gate"] } });
  assert.equal(c.sensors.find(x => x.id === "standards").command, `node ${VERIFY_RUN} standards`);
  assert.equal(c.sensors.find(x => x.id === "unit").command, "bash tests/run-unit.sh");
});

test("doctor avisa quando o sensor standards aponta para um plugin que sumiu", async () => {
  const { getCheck } = await import("../../scripts/lib/doctor.mjs");
  const d = repo({ verify: RESERVED });
  mkdirSync(join(d, ".context/config"), { recursive: true });
  writeFileSync(join(d, ".context/config/sensors.json"), JSON.stringify({ version: 1, sensors: [{ id: "standards", command: "node /nao/existe/verify-run.mjs standards" }] }));
  const r = getCheck("harness-sensors").run({ cwd: d, which: () => true, exec: () => ({ code: 0, stdout: "", stderr: "" }) });
  assert.equal(r.status, "WARN");
  assert.match(r.diagnosis, /não existe/);
});

test("doctor OK quando o sensor standards aponta para o verify-run existente", async () => {
  const { getCheck } = await import("../../scripts/lib/doctor.mjs");
  const d = repo({ verify: RESERVED });
  mkdirSync(join(d, ".context/config"), { recursive: true });
  writeFileSync(join(d, ".context/config/sensors.json"), JSON.stringify({ version: 1, sensors: [{ id: "standards", command: `node ${VERIFY_RUN} standards` }] }));
  const r = getCheck("harness-sensors").run({ cwd: d, which: () => true, exec: () => ({ code: 0, stdout: "", stderr: "" }) });
  assert.equal(r.status, "OK", r.diagnosis);
});

test("verify-run standards roda num projeto-cliente sem CLAUDE_PLUGIN_ROOT e com cwd diferente", () => {
  const d = repo({ verify: RESERVED });
  writeFileSync(join(d, "src/a.js"), "ok\n");
  const env = { ...process.env }; delete env.CLAUDE_PLUGIN_ROOT; env.CI = "";
  const ok = spawnSync("node", [VERIFY_RUN, "standards", d], { cwd: "/", encoding: "utf8", env });
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(lastEntry(d, "standards").exit, 0);
  writeFileSync(join(d, "src/a.js"), "BAD\n");
  const bad = spawnSync("node", [VERIFY_RUN, "standards", d], { cwd: "/", encoding: "utf8", env });
  assert.equal(bad.status, 1, bad.stderr);
  assert.equal(lastEntry(d, "standards").exit, 1);
});

test("raiz do plugin não verificada → resolveArgv lança e o verify-run grava exit 3 (fail-closed)", async () => {
  const fake = mkdtempSync(join(tmpdir(), "fake-plugin-"));
  try {
    cpSync(join(process.cwd(), "scripts"), join(fake, "scripts"), { recursive: true });
    // Sem .claude-plugin/plugin.json: verifyPluginRoot falha para esta cópia.
    const mod = await import(join(fake, "scripts/lib/verify-run.mjs"));
    assert.throws(() => mod.resolveArgv("standards", RESERVED_STANDARDS_ARGV, { ci: false, baseRef: "origin/main" }), /raiz do plugin/);
    const d = repo({ verify: RESERVED });
    const r = spawnSync("node", [join(fake, "scripts/lib/verify-run.mjs"), "standards", d], { encoding: "utf8" });
    assert.equal(r.status, 3, r.stderr);
    assert.equal(lastEntry(d, "standards").exit, 3);
  } finally {
    rmSync(fake, { recursive: true, force: true });
  }
});
