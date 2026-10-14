// scripts/lib/router-core.mjs — máquina de estado do mod de roteamento (spec §4.2/§4.3). PURO.
// O adaptador (hooks/router.mjs) só traduz eventos do engine para estas funções.
import { resolveSessionRoute, resolveSubagentRoute, stepEffort, tierOf, TIERS, capAtCeiling, minTier, isTierId } from "./model-routing.mjs";

const MAX_ERRORS = 6;
const MAX_SUMMARY = 300;
export const PROBE_MAX_ERRORS = 3;
const rank = (t) => TIERS.indexOf(t);

export function createRouterState() {
  return { userModel: null, userEffort: null, phase: null, skill: null, sessionTier: null, lastSessionModel: null, ids: {}, idSource: {}, probes: {}, agents: {}, agentTypes: {} };
}

// Sondas R-3: e.model/e.effort que chegam ao turn.step da sessão são sempre os do usuário.
export function observeSession(state, { model, effort }) {
  if (typeof model === "string" && model) state.userModel = model;
  if (effort !== undefined && effort !== null) state.userEffort = effort;
}

// Fase nova → grava e zera a skill da sessão. O adaptador chama no turn.start e sempre que o
// prevc.json muda no meio do turno (H1, spec 2026-10-10 §3).
export function onPhaseChange(state, { phase }) {
  const p = phase ?? null;
  if (p !== state.phase) { state.phase = p; state.skill = null; }
}

export const onTurnStart = onPhaseChange; // nome antigo, mantido para consumidores e testes

export function onSkill(state, { skill, agentId }) {
  if (agentId) return;
  state.skill = typeof skill === "string" ? skill : null;
}

export function learnId(state, modelId) {
  const t = tierOf(modelId);
  if (!t || !isTierId(modelId, t)) return;
  state.ids[t] = modelId;
  state.idSource[t] = "learned";
}

// D21 v1.2 (spec 2026-10-10-routing-session-tier-ids §3.1): candidatos a ID do tier, na ordem cache →
// models.ids → tabela. Nenhum vai ao turn.step sem sonda ok nesta sessão.
export function idCandidates(tier, { cache, config, table } = {}) {
  const out = [];
  for (const id of [cache?.[tier], config?.ids?.[tier], table?.ids?.[tier]]) if (isTierId(id, tier) && !out.includes(id)) out.push(id);
  return out;
}

// Só "modelo inexistente" rejeita o candidato; invalid_request/400 pode ter outra causa e conta como erro.
export function classifyProbe(r) {
  if (!r || typeof r !== "object") return "error";
  if (r.isAnswered === true || r.reason === "empty-reply") return "ok";
  if (r.reason === "api-error" && (r.error === "model_not_found" || r.status === 404)) return "rejected";
  return "error";
}

export function nextProbe(state, tier, ctx) {
  if (state.ids[tier]) return null;
  const p = (state.probes[tier] ??= { tried: [], errors: 0, inFlight: false, gaveUp: false });
  if (p.inFlight || p.gaveUp) return null;
  const id = idCandidates(tier, ctx).find((c) => !p.tried.includes(c));
  if (!id) { p.gaveUp = true; return null; }
  p.inFlight = true;
  p.current = id; // só para o /devflow-route status
  return { tier, id };
}

export function onProbeResult(state, tier, id, outcome) {
  const p = state.probes[tier];
  if (!p) return;
  p.inFlight = false;
  p.current = null;
  if (outcome === "ok") {
    if (!state.ids[tier]) { state.ids[tier] = id; state.idSource[tier] = "probe"; } // aprendido do engine vence
    return;
  }
  if (outcome === "rejected") { p.tried.push(id); return; }
  p.errors += 1; // limite por tier: rejected não zera
  if (p.errors >= PROBE_MAX_ERRORS) p.gaveUp = true;
}

// Sonda antecipada: tiers abaixo do teto que a tabela de sessão (ou o override) pede em alguma fase e ainda
// sem ID. O mod os sonda no 1o passo, para que a troca de fase não pague a sonda no passo que precisa do ID.
export function sessionProbeTiers(state, { table, config }) {
  if (!config?.enabled || !config.session || !table || !state.userModel) return [];
  const ceiling = tierOf(state.userModel);
  if (!ceiling) return [];
  const wanted = new Set();
  for (const phase of Object.keys(table.session?.phases ?? {})) {
    const raw = config.overrides?.session?.phases?.[phase] ?? table.session.phases[phase];
    if (!TIERS.includes(raw)) continue; // "ceiling" ou valor ilegível: fica no teto
    const t = capAtCeiling(raw, ceiling, config.maxTier);
    if (t && t !== ceiling && !state.ids[t]) wanted.add(t);
  }
  return TIERS.filter((t) => wanted.has(t));
}

// Tier que a rota atual da sessão pede abaixo do teto e ainda não tem ID verificado (null se nada a esperar).
export function neededTier(state, { table, config }) {
  if (!state.userModel) return null;
  const route = resolveSessionRoute({ table, config, phase: state.phase, skill: state.skill, userModel: state.userModel, userEffort: state.userEffort });
  return route && route.tier !== route.ceiling && !state.ids[route.tier] ? route.tier : null;
}

// /devflow-route status: o que a sessão sabe de cada tier (ID e origem, ou o estado da sonda) e se o cache está ligado.
export function idStatusLines(state, { cacheOn }) {
  const rows = [];
  for (const t of TIERS) {
    const id = state.ids[t], p = state.probes[t];
    if (id) { rows.push(`  ${t}: ${id} (${state.idSource[t] === "probe" ? "sonda ok" : "aprendido de subagente"})`); continue; }
    if (!p) continue;
    const parts = ["sem ID", p.inFlight ? `sonda em voo (${p.current})` : p.gaveUp ? "desistiu" : "aguardando sonda"];
    if (p.tried.length) parts.push(`rejeitados: ${p.tried.join(", ")}`);
    if (p.errors) parts.push(`erros: ${p.errors}/${PROBE_MAX_ERRORS}`);
    rows.push(`  ${t}: ${parts.join(" · ")}`);
  }
  return [
    ...(rows.length ? ["IDs por tier:", ...rows] : ["IDs por tier: — (nenhuma sonda nesta sessão)"]),
    `cache de IDs: ${cacheOn ? "ligado" : "desligado (caminho recusado ou roteamento desligado)"}`,
  ];
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
    if (id && id !== model) rw.model = id;
    if (!id) rw.idPending = route.tier; // D21: sem ID verificado, só esforço; o adaptador sonda
  }
  if (route.effort && route.effort !== effort) rw.effort = route.effort;
  markSwitch(state, rw, model);
  if (rw.switched && rw.model) rw.idSource = state.idSource[route.tier] ?? "learned";
  return rw.model || rw.effort || rw.switched || rw.idPending ? rw : null;
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
