// tests/lib/model-routing-resolve.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveSubagentRoute, resolveSessionRoute, agentName, effectiveConfig } from "../../scripts/lib/model-routing.mjs";
import { readModels } from "../../scripts/lib/models-config.mjs";

const table = JSON.parse(readFileSync(new URL("../../assets/model-routing/routes.json", import.meta.url), "utf8"));
const cfgOf = (yaml) => effectiveConfig(readModels(yaml), "1");
const on = cfgOf("models:\n  enabled: true\n");
const base = { table, config: on, ceilingModel: "claude-opus-5-5", ceilingEffort: "xhigh" };

test("desligado (repo sem models, sem opt-in do usuário ou subagents:false) → null", () => {
  assert.equal(resolveSubagentRoute({ ...base, config: cfgOf(""), agentType: "devflow:documentation-writer" }), null);
  assert.equal(resolveSubagentRoute({ ...base, config: effectiveConfig(readModels("models:\n  enabled: true\n"), undefined), agentType: "devflow:documentation-writer" }), null);
  assert.equal(resolveSubagentRoute({ ...base, config: cfgOf("models:\n  enabled: true\n  subagents: false\n"), agentType: "devflow:documentation-writer" }), null);
});

test("tipo não roteável fica intocado", () => {
  for (const t of ["Explore", "Plan", "claude-code-guide", "outro-plugin:agente", "fork"]) {
    assert.equal(resolveSubagentRoute({ ...base, agentType: t, phase: "E" }), null, t);
  }
});

test("rota abaixo do teto devolve alias; rota igual ao teto não toca no despacho (D21)", () => {
  const d = resolveSubagentRoute({ ...base, agentType: "devflow:documentation-writer", phase: "E" });
  assert.deepEqual([d.tier, d.model, d.effort, d.source], ["cheap", "haiku", "low", "agent"]);
  const a = resolveSubagentRoute({ ...base, agentType: "devflow:architect", phase: "E" });
  assert.deepEqual([a.tier, a.model, a.source], ["capable", null, "agent"]);
});

test("teto: sessão em sonnet nunca põe o architect em opus (Review Focus 3)", () => {
  const r = resolveSubagentRoute({ ...base, ceilingModel: "claude-sonnet-5-5", agentType: "devflow:architect" });
  assert.equal(r.tier, "standard");
  assert.equal(r.model, null, "igual ao teto: herda o modelo da sessão");
});

test("teto ilegível → null", () => {
  assert.equal(resolveSubagentRoute({ ...base, ceilingModel: "best", agentType: "devflow:architect" }), null);
});

test("precedência: plan > skill > projeto-fase > fase > projeto-agente > agente", () => {
  const cfg = cfgOf(
    "models:\n  enabled: true\n  overrides:\n    agents:\n      code-reviewer:\n        tier: cheap\n    phases:\n      R:\n        code-reviewer:\n          tier: standard\n      E:\n        general-purpose:\n          tier: cheap\n",
  );
  const r = (agentType, extra) => resolveSubagentRoute({ ...base, config: cfg, agentType, ...extra });
  assert.equal(r("devflow:code-reviewer", { phase: "R", taskTier: "cheap" }).source, "plan");
  assert.deepEqual([r("devflow:code-reviewer", { phase: "R" }).tier, r("devflow:code-reviewer", { phase: "R" }).source], ["standard", "project"]);
  assert.deepEqual([r("devflow:code-reviewer", { phase: "E" }).tier, r("devflow:code-reviewer", { phase: "E" }).source], ["cheap", "project"]);
  const finalReview = r("general-purpose", { phase: "E", skill: "final-review" });
  assert.deepEqual([finalReview.tier, finalReview.source], ["capable", "skill"], "o override de fase do projeto não rebaixa a revisão final");
  const plain = resolveSubagentRoute({ ...base, agentType: "devflow:code-reviewer", phase: "R" });
  assert.deepEqual([plain.tier, plain.source], ["capable", "phase"]);
});

test("model explícito: respeitado dentro do teto, rebaixado (alias) acima dele, ignorado se desconhecido", () => {
  const inside = resolveSubagentRoute({ ...base, agentType: "general-purpose", explicitModel: "sonnet" });
  assert.deepEqual([inside.tier, inside.model, inside.source], ["standard", null, "explicit"]);
  const above = resolveSubagentRoute({ ...base, ceilingModel: "claude-sonnet-5-5", agentType: "general-purpose", explicitModel: "opus" });
  assert.deepEqual([above.tier, above.model], ["standard", "sonnet"]);
  assert.equal(resolveSubagentRoute({ ...base, agentType: "general-purpose", explicitModel: "gpt-5" }), null);
});

test("maxTier do projeto limita mesmo abaixo do teto", () => {
  const cfg = cfgOf("models:\n  enabled: true\n  maxTier: standard\n");
  const r = resolveSubagentRoute({ ...base, config: cfg, agentType: "devflow:architect" });
  assert.deepEqual([r.tier, r.model], ["standard", "sonnet"]);
});

test("esforço do subagente nunca passa do esforço do usuário", () => {
  const r = resolveSubagentRoute({ ...base, ceilingEffort: "medium", agentType: "devflow:architect" });
  assert.equal(r.effort, "medium");
});

test("agentName tira só o prefixo devflow:", () => {
  assert.equal(agentName("devflow:architect"), "architect");
  assert.equal(agentName("general-purpose"), "general-purpose");
});

test("sessão: fase E vai para standard; P fica no teto; fora de workflow não muda", () => {
  const s = (extra) => resolveSessionRoute({ table, config: on, userModel: "claude-opus-5-5", userEffort: "xhigh", ...extra });
  assert.deepEqual(s({ phase: "E", skill: null }), { tier: "standard", effort: "medium", source: "phase", ceiling: "capable" });
  assert.equal(s({ phase: "P" }).tier, "capable");
  assert.equal(s({ phase: null }).source, "inherit");
});

test("sessão: esforço por skill, 'ceiling' = esforço do usuário, nunca acima dele", () => {
  const s = (skill, userEffort = "xhigh") =>
    resolveSessionRoute({ table, config: on, phase: "P", skill, userModel: "claude-opus-5-5", userEffort });
  assert.equal(s("superpowers:brainstorming").effort, "xhigh");
  assert.equal(s("devflow:commit-message").effort, "low");
  assert.equal(s("superpowers:brainstorming", "high").effort, "high");
});

test("sessão: override do projeto, camada desligada e opt-in ausente", () => {
  const cfg = cfgOf("models:\n  enabled: true\n  overrides:\n    session:\n      phases:\n        E: capable\n");
  assert.equal(resolveSessionRoute({ table, config: cfg, phase: "E", userModel: "claude-opus-5-5", userEffort: "high" }).tier, "capable");
  assert.equal(resolveSessionRoute({ table, config: cfgOf("models:\n  enabled: true\n  session: false\n"), phase: "E", userModel: "opus", userEffort: "high" }), null);
  assert.equal(resolveSessionRoute({ table, config: effectiveConfig(readModels("models:\n  enabled: true\n"), "0"), phase: "E", userModel: "opus", userEffort: "high" }), null);
});
