import { test } from "node:test";
import assert from "node:assert/strict";
import * as mc from "../../scripts/lib/monitor-core.mjs";

test("extractTaskId: Task N na description (formatos do SDD)", () => {
  assert.equal(mc.extractTaskId({ description: "Implement Task 3: parser" }), "Task 3");
  assert.equal(mc.extractTaskId({ description: "Review Task 12 (spec + quality)" }), "Task 12");
  assert.equal(mc.extractTaskId({ description: "Re-review Task 18b fix round 2" }), "Task 18b");
});

test("extractTaskId: Current story no prompt, com e sem marcador de lista (autonomous-loop)", () => {
  assert.equal(mc.extractTaskId({ description: "story", prompt: "Contexto\n- Current story: S2 — login\n" }), "S2");
  assert.equal(mc.extractTaskId({ description: "story", prompt: "Current story: S7 — x" }), "S7");
});

test("extractTaskId: Task N só no corpo do prompt não conta; sem id → null", () => {
  assert.equal(mc.extractTaskId({ description: "investigar", prompt: "Implemente a Task 3 do plano" }), null);
  assert.equal(mc.extractTaskId({}), null);
  assert.equal(mc.extractTaskId({ description: 42, prompt: null }), null);
});

test("extractTaskId: story além de 2048 caracteres do prompt é ignorada", () => {
  const prompt = "x".repeat(mc.PROMPT_SCAN) + "\n- Current story: S9\n";
  assert.equal(mc.extractTaskId({ description: "d", prompt }), null);
});

test("extractRole: Implement/Fix → implement; Review/Re-review → review; resto → null", () => {
  assert.equal(mc.extractRole("Implement Task 3: x"), "implement");
  assert.equal(mc.extractRole("Fix Task 3 findings"), "implement");
  assert.equal(mc.extractRole("Review Task 3 (spec + quality)"), "review");
  assert.equal(mc.extractRole("Re-review Task 3 fix round 1"), "review");
  assert.equal(mc.extractRole("mapear o código"), null);
  assert.equal(mc.extractRole(undefined), null);
});

test("onSpawned: SDD real (tudo general-purpose) — reviewer não vira retentativa do implementer", () => {
  const st = mc.createMonitorState();
  const gp = (agentId, description, now) => mc.onSpawned(st, { agentId, subagentType: "general-purpose", description, prompt: "", model: "sonnet", now });
  const a = gp("a1", "Implement Task 3: parser", 1000);
  assert.deepEqual(a, { id: "a1", label: "general-purpose · Task 3 · implement", startedAt: 1000, lastEventAt: 1000, model: "sonnet", effort: null, streak: 0, retries: 0 });
  assert.equal(gp("a2", "Review Task 3 (spec + quality)", 2000).retries, 0);
  assert.equal(gp("a3", "Re-review Task 3 fix round 1", 3000).retries, 1);
  assert.equal(gp("a4", "Implement Task 3: parser", 4000).retries, 1);
  assert.equal(st.retries["general-purpose::review::Task 3"], 2);
});

test("onSpawned: story sem papel usa '-' na chave; sem id de task → retries null", () => {
  const st = mc.createMonitorState();
  const s = mc.onSpawned(st, { agentId: "a1", subagentType: "devflow:test-writer", description: "story", prompt: "- Current story: S2 — x", now: 1 });
  assert.equal(s.label, "devflow:test-writer · S2");
  assert.equal(st.retries["devflow:test-writer::-::S2"], 1);
  const r = mc.onSpawned(st, { agentId: "a2", subagentType: "Explore", description: "mapear", now: 1 });
  assert.equal(r.retries, null);
  assert.equal(r.label, "Explore");
  assert.equal(mc.onSpawned(st, { subagentType: "Explore", now: 1 }), null);
});

test("onSpawned: limite de 500 chaves descarta a mais antiga; 50 linhas preservam a sessão", () => {
  const st = mc.createMonitorState();
  mc.openMain(st, { now: 0 });
  for (let i = 0; i < mc.MAX_KEYS + 1; i++) mc.onSpawned(st, { agentId: `a${i}`, subagentType: "t", description: `Task ${i}`, now: i });
  assert.equal(Object.keys(st.retries).length, mc.MAX_KEYS);
  assert.equal(st.retries["t::-::Task 0"], undefined);
  assert.equal(st.rows.length, mc.MAX_ROWS);
  assert.equal(st.rows[0].id, "main");
});

test("onTool: erro soma, sucesso zera; loop sem linha → false", () => {
  const st = mc.createMonitorState();
  mc.onSpawned(st, { agentId: "a1", subagentType: "t", now: 0 });
  assert.equal(mc.onTool(st, { loopId: "a1", isError: true, now: 5 }), true);
  mc.onTool(st, { loopId: "a1", isError: true, now: 6 });
  assert.equal(st.rows[0].streak, 2);
  assert.equal(st.rows[0].lastEventAt, 6);
  mc.onTool(st, { loopId: "a1", isError: false, now: 7 });
  assert.equal(st.rows[0].streak, 0);
  assert.equal(mc.onTool(st, { loopId: "fork-interno", isError: true, now: 8 }), false);
});

test("onStep: atualiza modelo/esforço e diz se mudou", () => {
  const st = mc.createMonitorState();
  mc.openMain(st, { now: 0 });
  assert.equal(mc.onStep(st, { loopId: "main", model: "claude-opus-5-5", effort: "high", now: 1 }), true);
  assert.equal(mc.onStep(st, { loopId: "main", model: "claude-opus-5-5", effort: "high", now: 2 }), false);
  assert.equal(st.rows[0].lastEventAt, 2);
});

test("openMain/closeMain: sessão reabre zerada no topo e fecha sem tocar subagentes", () => {
  const st = mc.createMonitorState();
  mc.onSpawned(st, { agentId: "a1", subagentType: "t", now: 0 });
  mc.openMain(st, { now: 10 });
  mc.onTool(st, { loopId: "main", isError: true, now: 11 });
  mc.openMain(st, { now: 20 });
  assert.equal(st.rows[0].id, "main");
  assert.equal(st.rows[0].streak, 0);
  assert.equal(st.rows[0].startedAt, 20);
  assert.equal(mc.closeMain(st), true);
  assert.deepEqual(st.rows.map((r) => r.id), ["a1"]);
  assert.equal(mc.closeMain(st), false);
});

test("reap: com lista, sai quem terminou ou sumiu; sessão nunca sai", () => {
  const st = mc.createMonitorState();
  mc.openMain(st, { now: 0 });
  for (const id of ["a1", "a2", "a3", "a4"]) mc.onSpawned(st, { agentId: id, subagentType: "t", now: 0 });
  const list = [{ id: "a1", status: "running" }, { id: "a2", status: "completed" }, { id: "a3", status: "killed" }];
  assert.equal(mc.reap(st, { list, now: 1 }), true);
  assert.deepEqual(st.rows.map((r) => r.id), ["main", "a1"]);
  assert.equal(mc.isLive(st), true);
});

test("reap: sem lista (falhou), sai só quem está sem evento há mais de 30 s", () => {
  const st = mc.createMonitorState();
  mc.onSpawned(st, { agentId: "velho", subagentType: "t", now: 0 });
  mc.onSpawned(st, { agentId: "novo", subagentType: "t", now: 0 });
  mc.onTool(st, { loopId: "novo", isError: false, now: 20_000 });
  mc.reap(st, { list: null, now: mc.STALE_MS + 1 });
  assert.deepEqual(st.rows.map((r) => r.id), ["novo"]);
  mc.reap(st, { list: null, now: 20_000 + mc.STALE_MS + 1 });
  assert.equal(mc.isLive(st), false);
});
