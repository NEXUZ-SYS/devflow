// scripts/lib/router-core.mjs — máquina de estado do mod de roteamento (spec §4.2/§4.3). PURO.
// O adaptador (hooks/router.mjs) só traduz eventos do engine para estas funções.
import { resolveSessionRoute, resolveSubagentRoute, stepEffort, tierOf, TIERS, capAtCeiling, minTier } from "./model-routing.mjs";

const MAX_ERRORS = 6;
const MAX_SUMMARY = 300;
const rank = (t) => TIERS.indexOf(t);

export function createRouterState() {
  return { userModel: null, userEffort: null, phase: null, skill: null, sessionTier: null, lastSessionModel: null, ids: {}, agents: {}, agentTypes: {} };
}

// Sondas R-3: e.model/e.effort que chegam ao turn.step da sessão são sempre os do usuário.
export function observeSession(state, { model, effort }) {
  if (typeof model === "string" && model) state.userModel = model;
  if (effort !== undefined && effort !== null) state.userEffort = effort;
}

export function onTurnStart(state, { phase }) {
  const p = phase ?? null;
  if (p !== state.phase) { state.phase = p; state.skill = null; }
}

export function onSkill(state, { skill, agentId }) {
  if (agentId) return;
  state.skill = typeof skill === "string" ? skill : null;
}

export function learnId(state, modelId) {
  if (typeof modelId !== "string" || !/^claude-[a-z0-9-]+$/.test(modelId)) return;
  const t = tierOf(modelId);
  if (t) state.ids[t] = modelId;
}

// e.model chega SEMPRE com o modelo do usuário (sonda R-3), mesmo depois de uma troca. Por isso a troca
// é medida contra o último modelo EFETIVAMENTE aplicado à sessão (lastSessionModel). No 1o passo a sessão
// estava no modelo do usuário. Troca só de esforço não conta (não custa cache).
function markSwitch(state, rw, model) {
  const effective = rw.model ?? model;
  const before = state.lastSessionModel ?? model;
  rw.switched = typeof effective === "string" && typeof before === "string" && effective !== before;
  if (typeof effective === "string") state.lastSessionModel = effective;
}

export function onSessionStep(state, { model, effort }, { table, config }) {
  if (!state.userModel) return null;
  const route = resolveSessionRoute({ table, config, phase: state.phase, skill: state.skill, userModel: state.userModel, userEffort: state.userEffort });
  const rw = { switched: false };
  if (!route) { markSwitch(state, rw, model); return rw.switched ? rw : null; }
  state.sessionTier = route.tier;
  if (route.tier !== route.ceiling) {
    const id = state.ids[route.tier];
    if (id && id !== model) rw.model = id; // D21: sem ID aprendido, só esforço
  }
  if (route.effort && route.effort !== effort) rw.effort = route.effort;
  markSwitch(state, rw, model);
  return rw.model || rw.effort || rw.switched ? rw : null;
}

export function onSpawn(state, e, { table, config, phase, skill }) {
  if (e?.fork || e?.workflow) return null;
  return resolveSubagentRoute({
    table, config, agentType: e?.subagentType, phase: phase ?? state.phase, skill: skill ?? null, taskTier: null,
    explicitModel: e?.model ?? null, ceilingModel: e?.parentModel ?? state.userModel, ceilingEffort: state.userEffort,
  });
}

// agentType de TODO subagente despachado (roteado ou não): o ledger de consumo o agrupa por tipo.
export function onSpawned(state, agentId, route, resolvedModel, agentType) {
  learnId(state, resolvedModel);
  if (agentId && typeof agentType === "string") state.agentTypes[agentId] = agentType;
  if (!agentId || !route) return;
  state.agents[agentId] = {
    agentType: typeof agentType === "string" ? agentType : null,
    tier: tierOf(resolvedModel) ?? route.tier, ceiling: route.ceiling, effortBase: route.effort,
    streak: 0, errors: [], decided: false, escalatedTo: null,
  };
}

export function onSubagentTool(state, agentId, { isError, summary }, config) {
  const a = state.agents[agentId];
  if (!a) return { trigger: false };
  if (!isError) { a.streak = 0; return { trigger: false }; }
  a.streak += 1;
  a.errors.push(String(summary ?? "erro").slice(0, MAX_SUMMARY));
  if (a.errors.length > MAX_ERRORS) a.errors.shift();
  const limit = config?.midRun?.failureStreak ?? 3;
  const trigger = !!config?.midRun?.enabled && !a.decided && a.streak === limit;
  if (trigger) a.decided = true; // uma consulta por subagente (segurança 4)
  return { trigger };
}

export function onSubagentStep(state, { agentId, model, effort }) {
  const a = state.agents[agentId];
  if (!a) return null;
  const rw = {};
  if (a.escalatedTo) {
    const cap = capAtCeiling(a.escalatedTo, tierOf(state.userModel) ?? a.ceiling);
    const id = cap ? state.ids[cap] : null;
    if (id && id !== model) rw.model = id;
  }
  const eff = stepEffort(a.effortBase, a.streak, state.userEffort);
  if (eff && eff !== effort) rw.effort = eff;
  return rw.model || rw.effort ? rw : null;
}

export function midRunReport(state, agentId) {
  const a = state.agents[agentId];
  return a ? `Falhas recentes de ferramenta (${a.streak} seguidas):\n- ${a.errors.join("\n- ")}` : "";
}

export function applyMidRun(state, agentId, decision, maxTier = null) {
  const a = state.agents[agentId];
  if (!a || a.escalatedTo || decision?.action !== "escalate") return false;
  const teto = minTier(a.ceiling, tierOf(state.userModel) ?? a.ceiling);
  const to = capAtCeiling(decision.tier, teto, maxTier);
  if (!to || to !== decision.tier || rank(to) <= rank(a.tier) || !state.ids[to]) return false;
  a.escalatedTo = to;
  return true;
}
