// tests/e2e/test-model-route-cli.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, readFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI = new URL("../../scripts/model-route.mjs", import.meta.url).pathname;

function fixture({ models = "models:\n  enabled: true\n  ledger: true\n", phase = "E", optIn = "1" } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "model-route-"));
  mkdirSync(join(dir, ".context/runtime/workflows"), { recursive: true });
  if (models !== null) writeFileSync(join(dir, ".context/.devflow.yaml"), models);
  if (phase) writeFileSync(join(dir, ".context/runtime/workflows/prevc.json"),
    JSON.stringify({ status: { project: { name: "x", current_phase: phase }, phases: {} } }));
  const xdg = mkdtempSync(join(tmpdir(), "model-route-xdg-"));
  const env = { ...process.env, XDG_DATA_HOME: xdg, HOME: xdg };
  // null = sem opt-in (undefined dispararia o valor padrão "1" da desestruturação)
  if (optIn === null) delete env.DEVFLOW_MODEL_ROUTING; else env.DEVFLOW_MODEL_ROUTING = optIn;
  return { dir, env, xdg };
}
const run = (args, f, timeout = 10000) => execFileSync("node", [CLI, ...args, "--cwd", f.dir], { encoding: "utf8", env: f.env, timeout });

test("resolve lê a fase do prevc.json e devolve alias", () => {
  const r = JSON.parse(run(["resolve", "--agent", "general-purpose"], fixture({ phase: "C" }))).route;
  assert.deepEqual([r.tier, r.model], ["cheap", "haiku"]);
});

test("resolve com task-tier e --runtime omp devolve o role", () => {
  const r = JSON.parse(run(["resolve", "--agent", "general-purpose", "--task-tier", "capable", "--runtime", "omp"], fixture())).route;
  assert.deepEqual([r.tier, r.source, r.role], ["capable", "plan", "pi/slow"]);
});

test("sem opt-in do usuário (D18) ou sem models → route null, exit 0 (Review Focus 2)", () => {
  assert.equal(JSON.parse(run(["resolve", "--agent", "devflow:documentation-writer"], fixture({ optIn: null }))).route, null);
  assert.equal(JSON.parse(run(["resolve", "--agent", "devflow:documentation-writer"], fixture({ optIn: "0" }))).route, null);
  assert.equal(JSON.parse(run(["resolve", "--agent", "devflow:documentation-writer"], fixture({ models: "git:\n  strategy: x\n" }))).route, null);
});

test(".devflow.yaml como link para /dev/zero ou FIFO não trava nem incha (segurança 1, Review Focus 1)", () => {
  const z = fixture({ models: null });
  symlinkSync("/dev/zero", join(z.dir, ".context/.devflow.yaml"));
  const t0 = Date.now();
  assert.equal(JSON.parse(run(["resolve", "--agent", "devflow:documentation-writer"], z, 5000)).route, null);
  const f = fixture({ models: null });
  execFileSync("mkfifo", [join(f.dir, ".context/.devflow.yaml")]);
  assert.equal(JSON.parse(run(["resolve", "--agent", "devflow:documentation-writer"], f, 5000)).route, null);
  assert.ok(Date.now() - t0 < 5000);
});

test("prevc.json symlink para fora → sem fase", () => {
  const f = fixture({ phase: null });
  const outside = join(mkdtempSync(join(tmpdir(), "outside-")), "p.json");
  writeFileSync(outside, JSON.stringify({ status: { project: { name: "x", current_phase: "C" } } }));
  symlinkSync(outside, join(f.dir, ".context/runtime/workflows/prevc.json"));
  const r = JSON.parse(run(["resolve", "--agent", "general-purpose"], f)).route;
  assert.equal(r.source, "agent", "sem fase confiável cai no default do agente");
});

test("escalate: rubrica → respostas → decisão, ledger sem conteúdo", () => {
  const f = fixture();
  const rep = join(f.dir, "report.txt");
  writeFileSync(rep, "FALHOU: teste X vermelho; email dev@corp.com");
  const rubric = run(["escalate", "--agent", "general-purpose", "--tier", "cheap", "--report", rep], f);
  assert.match(rubric, /needed_tier/);
  assert.doesNotMatch(rubric, /dev@corp\.com/);
  const answers = JSON.stringify({ failure_is_capability: 0.9, claims_done_with_evidence: 0, is_stuck: 0.2, needed_tier: "standard" });
  const d = JSON.parse(run(["escalate", "--agent", "general-purpose", "--tier", "cheap", "--answers", answers, "--signal-red", "--runtime", "omp"], f));
  assert.deepEqual([d.action, d.tier, d.model, d.role], ["escalate", "standard", "sonnet", "default"]);
  const dir = join(f.xdg, "devflow-model-routing", readdirSync(join(f.xdg, "devflow-model-routing"))[0]);
  const content = readFileSync(join(dir, readdirSync(dir)[0]), "utf8");
  assert.match(content, /"action":"escalate"/);
  assert.doesNotMatch(content, /FALHOU|dev@corp/);
});

test("escalate com respostas inválidas → keep", () => {
  const d = JSON.parse(run(["escalate", "--agent", "general-purpose", "--tier", "cheap", "--answers", "lixo"], fixture()));
  assert.equal(d.action, "keep");
});

test("report sobre ledger vazio não quebra", () => {
  assert.match(run(["report"], fixture()), /Subagentes/);
});

test("report --transcripts soma o usage dos subagentes sem ler conteúdo", () => {
  const f = fixture();
  const proj = mkdtempSync(join(tmpdir(), "transcripts-"));
  const sub = join(proj, "sess-1", "subagents");
  mkdirSync(sub, { recursive: true });
  writeFileSync(join(sub, "agent-a.meta.json"), JSON.stringify({ agentType: "devflow:code-reviewer", model: "sonnet" }));
  writeFileSync(join(sub, "agent-a.jsonl"), [
    JSON.stringify({ type: "assistant", message: { model: "claude-sonnet-5-5", content: "SEGREDO", usage: { input_tokens: 5, output_tokens: 7000 } } }),
    "linha quebrada",
  ].join("\n"));
  const out = run(["report", "--transcripts", proj], f);
  assert.match(out, /devflow:code-reviewer \| claude-sonnet-5-5 \| 1 \|/);
  assert.match(out, /7\.0k/);
  assert.doesNotMatch(out, /SEGREDO/);
});

test("uso inválido → exit 2", () => {
  assert.equal(spawnSync("node", [CLI, "voar"], { encoding: "utf8" }).status, 2);
});

test("report não falha com caminho de transcripts inválido (exit 0 sempre, exceto uso inválido)", () => {
  const f = fixture();
  const file = join(mkdtempSync(join(tmpdir(), "notdir-")), "arquivo.txt");
  writeFileSync(file, "x");
  const missing = join(mkdtempSync(join(tmpdir(), "missing-")), "nao-existe");
  for (const t of [file, missing]) {
    const r = spawnSync("node", [CLI, "report", "--transcripts", t, "--cwd", f.dir], { encoding: "utf8", env: f.env, timeout: 10000 });
    assert.equal(r.status, 0, `status ${r.status} para ${t}: ${r.stderr}`);
    assert.match(r.stdout, /Subagentes/);
  }
});
