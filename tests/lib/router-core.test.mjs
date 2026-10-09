// tests/lib/router-core.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as C from "../../scripts/lib/router-core.mjs";
import { readModels } from "../../scripts/lib/models-config.mjs";
import { effectiveConfig } from "../../scripts/lib/model-routing.mjs";

const table = JSON.parse(readFileSync(new URL("../../assets/model-routing/routes.json", import.meta.url), "utf8"));
const config = effectiveConfig(readModels("models:\n  enabled: true\n  midRun:\n    enabled: true\n"), "1");
const ctx = { table, config };
const step = (s, model, effort) => { C.observeSession(s, { model, effort }); return C.onSessionStep(s, { model, effort }, ctx); };

test("sessão: a troca é EFETIVA, marcada no passo em que o patch aplica outro modelo (nada de marca na 1a rota)", () => {
  const s = C.createRouterState();
  C.learnId(s, "claude-sonnet-5-5");
  const marks = [];
  for (const phase of ["P", "R", "E", "V", "C"]) {
    C.onTurnStart(s, { phase });
    const rw = step(s, "claude-opus-5-5", "xhigh");
    marks.push([phase, !!rw?.switched, rw?.model ?? null]);
  }
  assert.deepEqual(marks.filter((m) => m[1]).map((m) => m[0]), ["E"], "só E troca; V e C seguem em sonnet (e.model sempre vem como o do usuário, R-3)");
  assert.ok(marks.find((m) => m[0] === "E")[1], "E sai de opus para sonnet: troca");
  assert.equal(marks.find((m) => m[0] === "P")[1], false, "P fica no modelo do usuário: sem troca");
});

test("sessão: sessão que já começa em E e troca opus → sonnet no 1o passo marca switched", () => {
  const s = C.createRouterState();
  C.learnId(s, "claude-sonnet-5-5");
  C.onTurnStart(s, { phase: "E" });
  const rw = step(s, "claude-opus-5-5", "xhigh");
  assert.equal(rw.model, "claude-sonnet-5-5");
  assert.equal(rw.switched, true);
});

test("sessão: troca só de esforço (sem model) não conta como switched (não custa cache)", () => {
  const s = C.createRouterState();
  C.onTurnStart(s, { phase: "E" }); // sem ID de sonnet aprendido: só esforço
  const rw = step(s, "claude-opus-5-5", "xhigh");
  assert.equal(rw.model, undefined);
  assert.equal(rw.effort, "medium");
  assert.equal(rw.switched, false);
});

test("sessão: em E usa o ID completo aprendido, nunca alias (D21)", () => {
  const s = C.createRouterState();
  C.onTurnStart(s, { phase: "E" });
  const sem = step(s, "claude-opus-5-5", "xhigh");
  assert.equal(sem.model, undefined, "sem ID aprendido: só esforço");
  assert.equal(sem.effort, "medium");
  C.learnId(s, "claude-sonnet-5-5");
  const com = step(s, "claude-opus-5-5", "xhigh");
  assert.equal(com.model, "claude-sonnet-5-5");
  C.learnId(s, "sonnet");
  assert.equal(s.ids.standard, "claude-sonnet-5-5", "alias não substitui ID");
});

test("sessão: /model e /effort do usuário viram teto no passo seguinte (Review Focus 4)", () => {
  const s = C.createRouterState();
  C.learnId(s, "claude-sonnet-5-5");
  C.onTurnStart(s, { phase: "E" });
  step(s, "claude-opus-5-5", "xhigh");
  const rw = step(s, "claude-haiku-4-5", "low");
  assert.equal(s.userModel, "claude-haiku-4-5");
  assert.equal(s.userEffort, "low");
  assert.equal(rw?.model, undefined, "nunca sobe acima do novo teto");
});

test("sessão: skill de subagente não muda o esforço da sessão; troca de fase limpa a skill", () => {
  const s = C.createRouterState();
  C.onTurnStart(s, { phase: "P" });
  C.onSkill(s, { skill: "superpowers:brainstorming" });
  C.onSkill(s, { skill: "devflow:commit-message", agentId: "a1" });
  assert.equal(s.skill, "superpowers:brainstorming");
  C.onTurnStart(s, { phase: "R" });
  assert.equal(s.skill, null);
});

test("subagente: teto é o modelo do usuário (parentModel) e tier igual ao teto não toca", () => {
  const s = C.createRouterState();
  const a = C.onSpawn(s, { subagentType: "devflow:architect", parentModel: "claude-opus-5-5" }, { ...ctx, phase: "E" });
  assert.deepEqual([a.tier, a.model], ["capable", null]);
  const d = C.onSpawn(s, { subagentType: "devflow:documentation-writer", parentModel: "claude-sonnet-5-5" }, { ...ctx, phase: "E" });
  assert.deepEqual([d.tier, d.model], ["cheap", "haiku"]);
  const b = C.onSpawn(s, { subagentType: "devflow:architect", parentModel: "claude-sonnet-5-5" }, { ...ctx, phase: "E" });
  assert.deepEqual([b.tier, b.model], ["standard", null], "sessão em sonnet: architect herda sonnet");
});

test("subagente: fork, workflow e tipo não roteável ficam intocados", () => {
  const s = C.createRouterState();
  assert.equal(C.onSpawn(s, { subagentType: "general-purpose", parentModel: "opus", fork: true }, ctx), null);
  assert.equal(C.onSpawn(s, { subagentType: "general-purpose", parentModel: "opus", workflow: { runId: "wf_1" } }, ctx), null);
  assert.equal(C.onSpawn(s, { subagentType: "Explore", parentModel: "opus" }, ctx), null);
});

test("subagente: esforço sobe após falha e volta no sucesso", () => {
  const s = C.createRouterState();
  C.observeSession(s, { model: "claude-opus-5-5", effort: "xhigh" });
  const r = C.onSpawn(s, { subagentType: "general-purpose", parentModel: "claude-opus-5-5" }, { ...ctx, phase: "E" });
  C.onSpawned(s, "a1", r, "claude-sonnet-5-5");
  assert.equal(s.ids.standard, "claude-sonnet-5-5", "aprende o ID pelo spawn");
  assert.equal(C.onSubagentStep(s, { agentId: "a1", model: "claude-sonnet-5-5", effort: "medium" }), null);
  C.onSubagentTool(s, "a1", { isError: true, summary: "Bash: exit 1" }, config);
  assert.equal(C.onSubagentStep(s, { agentId: "a1", model: "claude-sonnet-5-5", effort: "medium" }).effort, "high");
  C.onSubagentTool(s, "a1", { isError: false }, config);
  assert.equal(C.onSubagentStep(s, { agentId: "a1", model: "claude-sonnet-5-5", effort: "medium" }), null);
});

test("escalada no meio: gatilho só em streak === N, uma vez por subagente, nunca com midRun desligado", () => {
  const s = C.createRouterState();
  C.observeSession(s, { model: "claude-opus-5-5", effort: "xhigh" });
  C.learnId(s, "claude-sonnet-5-5");
  const r = C.onSpawn(s, { subagentType: "devflow:documentation-writer", parentModel: "claude-opus-5-5" }, { ...ctx, phase: "E" });
  C.onSpawned(s, "a2", r, "claude-haiku-5-5");
  const triggers = [];
  for (let i = 0; i < 20; i++) triggers.push(C.onSubagentTool(s, "a2", { isError: true, summary: `erro ${i}` }, config).trigger);
  assert.equal(triggers.filter(Boolean).length, 1, "uma consulta por subagente (segurança 4)");
  assert.equal(triggers.indexOf(true), 2, "dispara na 3ª falha");
  assert.match(C.midRunReport(s, "a2"), /erro 19/);
  const off = effectiveConfig(readModels("models:\n  enabled: true\n"), "1");
  const s2 = C.createRouterState();
  C.observeSession(s2, { model: "claude-opus-5-5", effort: "xhigh" });
  C.onSpawned(s2, "b", C.onSpawn(s2, { subagentType: "general-purpose", parentModel: "claude-opus-5-5" }, { table, config: off, phase: "E" }), "claude-sonnet-5-5");
  for (let i = 0; i < 5; i++) assert.equal(C.onSubagentTool(s2, "b", { isError: true }, off).trigger, false, "midRun desligado (D19)");
});

test("applyMidRun: uma troca, nunca para baixo, nunca acima do teto, só com ID conhecido", () => {
  const s = C.createRouterState();
  C.observeSession(s, { model: "claude-opus-5-5", effort: "xhigh" });
  const r = C.onSpawn(s, { subagentType: "devflow:documentation-writer", parentModel: "claude-opus-5-5" }, { ...ctx, phase: "E" });
  C.onSpawned(s, "a", r, "claude-haiku-5-5");
  assert.equal(C.applyMidRun(s, "a", { action: "escalate", tier: "standard" }), false, "sem ID de standard");
  const s3 = C.createRouterState();
  C.observeSession(s3, { model: "claude-opus-5-5", effort: "xhigh" });
  C.learnId(s3, "claude-sonnet-5-5");
  C.onSpawned(s3, "a", C.onSpawn(s3, { subagentType: "devflow:documentation-writer", parentModel: "claude-opus-5-5" }, { ...ctx, phase: "E" }), "claude-haiku-5-5");
  assert.equal(C.applyMidRun(s3, "a", { action: "escalate", tier: "standard" }), true);
  assert.equal(C.onSubagentStep(s3, { agentId: "a", model: "claude-haiku-5-5", effort: "low" }).model, "claude-sonnet-5-5");
  assert.equal(C.applyMidRun(s3, "a", { action: "escalate", tier: "capable" }), false, "só uma troca");
  const s2 = C.createRouterState();
  C.observeSession(s2, { model: "claude-sonnet-5-5", effort: "high" });
  C.learnId(s2, "claude-opus-5-5");
  C.onSpawned(s2, "b", C.onSpawn(s2, { subagentType: "devflow:documentation-writer", parentModel: "claude-sonnet-5-5" }, { ...ctx, phase: "E" }), "claude-haiku-5-5");
  assert.equal(C.applyMidRun(s2, "b", { action: "escalate", tier: "capable" }), false, "acima do teto");
});

test("applyMidRun: /model depois da escalada rebaixa o teto no passo seguinte", () => {
  const s = C.createRouterState();
  C.observeSession(s, { model: "claude-opus-5-5", effort: "xhigh" });
  C.learnId(s, "claude-sonnet-5-5");
  C.learnId(s, "claude-opus-5-5");
  C.onSpawned(s, "a", C.onSpawn(s, { subagentType: "devflow:documentation-writer", parentModel: "claude-opus-5-5" }, { ...ctx, phase: "E" }), "claude-haiku-5-5");
  assert.equal(C.applyMidRun(s, "a", { action: "escalate", tier: "capable" }), true);
  assert.equal(C.onSubagentStep(s, { agentId: "a", model: "claude-haiku-5-5", effort: "low" }).model, "claude-opus-5-5");
  C.observeSession(s, { model: "claude-sonnet-5-5", effort: "high" });
  const rw = C.onSubagentStep(s, { agentId: "a", model: "claude-opus-5-5", effort: "low" });
  assert.equal(rw?.model, "claude-sonnet-5-5", "nunca acima do novo teto");
});

test("applyMidRun: respeita maxTier", () => {
  const mk = () => {
    const s = C.createRouterState();
    C.observeSession(s, { model: "claude-opus-5-5", effort: "xhigh" });
    C.learnId(s, "claude-sonnet-5-5");
    C.learnId(s, "claude-opus-5-5");
    C.onSpawned(s, "a", C.onSpawn(s, { subagentType: "devflow:documentation-writer", parentModel: "claude-opus-5-5" }, { ...ctx, phase: "E" }), "claude-haiku-5-5");
    return s;
  };
  assert.equal(C.applyMidRun(mk(), "a", { action: "escalate", tier: "capable" }, "standard"), false);
  assert.equal(C.applyMidRun(mk(), "a", { action: "escalate", tier: "standard" }, "standard"), true);
});

test("router-core é puro", () => {
  const src = readFileSync(new URL("../../scripts/lib/router-core.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(src, /from\s+["']node:/);
});

test("sessão: e.model sempre igual ao do usuário (R-3) — 3 passos em E dão 1 troca; voltar ao modelo do usuário dá a 2a", () => {
  const s = C.createRouterState();
  C.learnId(s, "claude-sonnet-5-5");
  const marks = [];
  for (const phase of ["E", "E", "E", "R"]) {
    C.onTurnStart(s, { phase });
    marks.push(!!step(s, "claude-opus-5-5", "xhigh")?.switched);
  }
  assert.deepEqual(marks, [true, false, false, true]);
});
