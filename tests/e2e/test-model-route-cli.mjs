// tests/e2e/test-model-route-cli.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, readFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ledgerDirFrom } from "../../scripts/lib/routing-ledger.mjs";
import { ompCeilingTier } from "../../scripts/lib/omp-ceiling.mjs";
const PLUGIN = new URL("../..", import.meta.url).pathname;
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
  const r = JSON.parse(run(["resolve", "--agent", "devflow:architect", "--task-tier", "capable", "--runtime", "omp"], fixture())).route;
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

test("escalate respeita o opt-in (D18/D5): sem a env ou sem models.enabled → keep, sem ledger; ligado → decisão", () => {
  const answers = JSON.stringify({ failure_is_capability: 0.9, claims_done_with_evidence: 0.1, is_stuck: 0.9, needed_tier: "capable" });
  const esc = (f) => JSON.parse(run(["escalate", "--agent", "general-purpose", "--tier", "standard", "--answers", answers], f));
  const semEnv = fixture({ optIn: null });
  const off = esc(semEnv);
  assert.deepEqual([off.action, off.tier, off.model, off.role, off.reason], ["keep", "standard", null, null, "roteamento desligado"]);
  assert.deepEqual(readdirSync(semEnv.xdg), [], "desligado não grava no ledger");
  const semYaml = esc(fixture({ models: "git:\n  strategy: x\n" }));
  assert.deepEqual([semYaml.action, semYaml.model], ["keep", null]);
  const on = esc(fixture());
  assert.ok(["escalate", "human", "keep"].includes(on.action));
  assert.deepEqual([on.action, on.model], ["escalate", "opus"]);
  // a rubrica (--report) continua disponível com o roteamento desligado
  const rep = join(mkdtempSync(join(tmpdir(), "rep-")), "r.txt");
  writeFileSync(rep, "x");
  assert.match(run(["escalate", "--agent", "general-purpose", "--tier", "cheap", "--report", rep], fixture({ optIn: null })), /needed_tier/);
});

// ---- teto do omp na CLI (D5): sem adaptador em execução, a CLI limita a saída ----
const ans = (needed) => JSON.stringify({ failure_is_capability: 0.9, claims_done_with_evidence: 0.1, is_stuck: 0.9, needed_tier: needed });
const resolveOmp = (agent, f, extra = []) => JSON.parse(run(["resolve", "--agent", agent, "--task-tier", "capable", "--runtime", "omp", ...extra], f)).route;

test("omp: agente genérico é limitado ao role de activities.execution (tier <= standard)", () => {
  const r = resolveOmp("general-purpose", fixture());
  assert.deepEqual([r.tier, r.role], ["standard", "default"]);
});

test("omp: agent_role_defaults é o teto (architect pi/plan deixa passar pi/slow)", () => {
  const r = resolveOmp("devflow:architect", fixture());
  assert.deepEqual([r.tier, r.role], ["capable", "pi/slow"]);
});

test("omp: escalate acima do teto fica no teto", () => {
  const d = JSON.parse(run(["escalate", "--agent", "general-purpose", "--tier", "cheap", "--answers", ans("top"), "--runtime", "omp"], fixture()));
  assert.deepEqual([d.action, d.tier, d.role], ["escalate", "standard", "default"]);
});

test("omp: --ceiling explícito menor vence o teto do omp", () => {
  const d = JSON.parse(run(["escalate", "--agent", "architect", "--tier", "cheap", "--answers", ans("top"), "--runtime", "omp", "--ceiling", "standard"], fixture()));
  assert.deepEqual([d.action, d.tier], ["escalate", "standard"]);
});

test("omp: teto ilegível (role commit) → resolve null e escalate keep sem ledger", () => {
  const f = fixture();
  assert.equal(resolveOmp("devflow:documentation-writer", f), null);
  const d = JSON.parse(run(["escalate", "--agent", "documentation-writer", "--tier", "cheap", "--answers", ans("top"), "--runtime", "omp"], f));
  assert.deepEqual([d.action, d.reason, d.model, d.role], ["keep", "teto ilegível", null, null]);
  assert.deepEqual(readdirSync(f.xdg), [], "keep por teto ilegível não grava no ledger");
});

test("omp: sem default, o model do .context/agents/<nome>.md é o teto", () => {
  const f = fixture();
  mkdirSync(join(f.dir, ".context/agents"), { recursive: true });
  writeFileSync(join(f.dir, ".context/agents/x.md"), "---\nname: x\nmodel: haiku\n---\ncorpo\n");
  const r = resolveOmp("devflow:x", f);
  assert.deepEqual([r.tier, r.role], ["cheap", "pi/smol"]);
});

test("omp: nome de agente fora de ^[a-z0-9-]+$ não lê arquivo (cai no execution)", () => {
  const f = fixture();
  mkdirSync(join(f.dir, ".context/agents"), { recursive: true });
  writeFileSync(join(f.dir, ".context/agents/x.md"), "---\nmodel: haiku\n---\n");
  assert.equal(ompCeilingTier(PLUGIN, f.dir, "../agents/x"), "standard");
  assert.equal(ompCeilingTier(PLUGIN, f.dir, "x"), "cheap");
});

test("sem --runtime omp o teto continua top (o adaptador limita)", () => {
  const r = JSON.parse(run(["resolve", "--agent", "general-purpose", "--task-tier", "capable"], fixture())).route;
  assert.equal(r.tier, "capable");
  const d = JSON.parse(run(["escalate", "--agent", "general-purpose", "--tier", "cheap", "--answers", ans("top")], fixture()));
  assert.deepEqual([d.action, d.tier], ["escalate", "top"]);
});

// ---- antes × depois (spec §8) ----
function baFixture(ledgerLines) {
  const f = fixture();
  const dir = ledgerDirFrom({ xdgDataHome: f.xdg, home: f.xdg, cwd: f.dir });
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "mod.jsonl"), ledgerLines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  const proj = mkdtempSync(join(tmpdir(), "ba-transcripts-"));
  const line = (timestamp, model, i, o) => JSON.stringify({ timestamp, type: "assistant", message: { model, content: "SEGREDO", usage: { input_tokens: i, output_tokens: o } } });
  mkdirSync(join(proj, "s1", "subagents"), { recursive: true });
  writeFileSync(join(proj, "s1.jsonl"), [line("2026-10-08T11:00:00.000Z", "claude-opus-5", 1000, 600), line("2026-10-08T15:00:00.000Z", "claude-opus-5", 2000, 400)].join("\n"));
  writeFileSync(join(proj, "s1", "subagents", "agent-a.meta.json"), JSON.stringify({ agentType: "devflow:code-reviewer" }));
  writeFileSync(join(proj, "s1", "subagents", "agent-a.jsonl"), [
    line("2026-10-08T11:30:00.000Z", "claude-opus-5", 3000, 3000),
    line("2026-10-08T14:00:00.000Z", "claude-sonnet-5", 4000, 1000),
    "linha quebrada",
  ].join("\n"));
  return { f, proj };
}
const cutLine = { ts: "2026-10-08T12:00:00.000Z", scope: "subagent", agentType: "devflow:code-reviewer", escalation: { at: "retry", from: "cheap", to: "standard", action: "escalate" } };

test("report: Antes × depois separa as janelas pelo menor ts do ledger (clássico: transcripts >= corte entram no depois)", () => {
  const { f, proj } = baFixture([cutLine]);
  const out = run(["report", "--transcripts", proj], f);
  assert.match(out, /## Antes × depois/);
  assert.match(out, /Corte: 2026-10-08T12:00:00\.000Z/);
  const [subs, sess] = out.split("### Sessão");
  assert.match(subs, /\| antes \| claude-opus-5 \| 3\.0k \| 3\.0k \| 100\.0% \|/);
  assert.match(subs, /\| depois \| claude-sonnet-5 \| 4\.0k \| 1\.0k \| 100\.0% \|/);
  assert.match(sess, /\| antes \| claude-opus-5 \| 1\.0k \| 0\.6k \| 100\.0% \|/);
  assert.match(sess, /\| depois \| claude-opus-5 \| 2\.0k \| 0\.4k \| 100\.0% \|/);
  assert.doesNotMatch(out, /SEGREDO/);
});

test("report: com usage no ledger, transcripts posteriores ao corte NÃO entram no depois", () => {
  const { f, proj } = baFixture([{ ts: "2026-10-08T12:00:00.000Z", scope: "subagent", agentType: "devflow:code-reviewer", model: "claude-haiku-5", usage: { input_tokens: 500, output_tokens: 250 } }]);
  const out = run(["report", "--transcripts", proj], f);
  const [subs, sess] = out.split("### Sessão");
  const afterSub = subs.slice(subs.indexOf("## Antes × depois"));
  assert.match(afterSub, /\| depois \| claude-haiku-5 \| 0\.5k \| 0\.3k \| 100\.0% \|/);
  assert.doesNotMatch(afterSub, /\| depois \| claude-sonnet-5/);
  assert.doesNotMatch(sess, /\| depois \|/, "sessão: nada do ledger e transcript posterior descartado");
  assert.match(sess, /\| antes \| claude-opus-5/);
});

test("report: ledger vazio → seção diz que não há comparativo", () => {
  const f = fixture();
  assert.match(run(["report"], f), /sem comparativo/);
});
