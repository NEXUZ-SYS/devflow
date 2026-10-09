// scripts/lib/model-routing.mjs — núcleo do roteamento de modelos do DevFlow
// (spec docs/superpowers/specs/2026-10-08-model-routing-design.md).
// PURO: sem import de node:* — o mod (function hooks, sem Node) importa este arquivo.

export const TIERS = Object.freeze(["cheap", "standard", "capable", "top"]);
export const EFFORTS = Object.freeze(["low", "medium", "high", "xhigh", "max"]);
export const PHASES = Object.freeze(["P", "R", "E", "V", "C"]);

// Mesma verdade do Claude Code: 1|true|yes|on, com trim e sem diferenciar caixa.
export function functionHooksOn(v) {
  return ["1", "true", "yes", "on"].includes(String(v ?? "").trim().toLowerCase());
}

const ALIAS = Object.freeze({ cheap: "haiku", standard: "sonnet", capable: "opus", top: "fable" });
const ROLE = Object.freeze({ cheap: "pi/smol", standard: "default", capable: "pi/slow", top: "pi/plan" });
const FAMILY = [
  [/(^|[^a-z])haiku/, "cheap"],
  [/(^|[^a-z])sonnet/, "standard"],
  [/(^|[^a-z])opus/, "capable"],
  [/(^|[^a-z])fable/, "top"],
];

const rank = (t) => TIERS.indexOf(t);
const erank = (e) => EFFORTS.indexOf(e);

export function tierOf(value) {
  if (typeof value !== "string") return null;
  const s = value.trim().toLowerCase();
  if (!s) return null;
  if (TIERS.includes(s)) return s;
  for (const [tier, role] of Object.entries(ROLE)) if (role === s) return tier;
  for (const [re, tier] of FAMILY) if (re.test(s)) return tier;
  return null;
}

export const toAlias = (tier) => (Object.hasOwn(ALIAS, tier) ? ALIAS[tier] : null);
export const toRole = (tier) => (Object.hasOwn(ROLE, tier) ? ROLE[tier] : null);

export function nextTier(tier) {
  const i = rank(tier);
  return i < 0 ? null : TIERS[Math.min(i + 1, TIERS.length - 1)];
}

export function minTier(a, b) {
  if (rank(a) < 0) return rank(b) < 0 ? null : b;
  if (rank(b) < 0) return a;
  return rank(a) <= rank(b) ? a : b;
}

// D5: o resultado nunca passa do teto nem do maxTier. Teto ilegível → null (não roteia).
export function capAtCeiling(tier, ceilingTier, maxTierCfg = null) {
  if (rank(tier) < 0 || rank(ceilingTier) < 0) return null;
  let t = minTier(tier, ceilingTier);
  if (rank(maxTierCfg) >= 0) t = minTier(t, maxTierCfg);
  return t;
}

// Teto de esforço desconhecido (ausente ou numérico) → null: o adaptador não mexe no esforço.
export function capEffort(effort, ceilingEffort) {
  if (erank(effort) < 0 || erank(ceilingEffort) < 0) return null;
  return erank(effort) <= erank(ceilingEffort) ? effort : ceilingEffort;
}

// D13: falha de ferramenta sobe um degrau no passo seguinte; sucesso volta ao base.
export function stepEffort(base, failureStreak, ceilingEffort) {
  if (erank(base) < 0) return null;
  const up = failureStreak > 0 ? EFFORTS[Math.min(erank(base) + 1, EFFORTS.length - 1)] : base;
  return capEffort(up, ceilingEffort);
}

// prevc.json não é confiável (ADR-014): só a fase, por allowlist.
export function phaseFromPrevcJson(text) {
  if (typeof text !== "string" || !text) return null;
  try {
    const p = JSON.parse(text)?.status?.project?.current_phase;
    return PHASES.includes(p) ? p : null;
  } catch {
    return null;
  }
}

// D18: o repositório pede (models.enabled); só o usuário liga (DEVFLOW_MODEL_ROUTING=1).
export function effectiveConfig(config, envValue) {
  const base = config && typeof config === "object" ? config : {};
  return { ...base, enabled: base.enabled === true && envValue === "1" };
}

// ---- resolvedores (spec §5, D3 revisada na fase R, D21) ----

export function agentName(agentType) {
  return String(agentType ?? "").replace(/^devflow:/, "");
}

function isRoutable(table, agentType) {
  const t = String(agentType ?? "");
  return (table?.routable ?? []).includes(t) || (table?.routablePrefix ? t.startsWith(table.routablePrefix) : false);
}

function pick(...cands) {
  for (const [tier, source] of cands) if (TIERS.includes(tier)) return { tier, source };
  return null;
}

export function resolveSubagentRoute({ table, config, agentType, phase, skill, taskTier, explicitModel, ceilingModel, ceilingEffort }) {
  if (!config?.enabled || !config.subagents || !table) return null;
  if (!isRoutable(table, agentType)) return null;
  const ceiling = tierOf(ceilingModel);
  if (!ceiling) return null;
  const name = agentName(agentType);

  let chosen;
  const hasExplicit = explicitModel !== undefined && explicitModel !== null && explicitModel !== "";
  if (hasExplicit) {
    const t = tierOf(explicitModel);
    if (!t) return null;
    chosen = { tier: t, source: "explicit" };
  } else {
    chosen = pick(
      [taskTier, "plan"],
      [table.skills?.[skill]?.[name] ?? table.skills?.[skill]?.["*"], "skill"],
      [config.overrides?.phases?.[phase]?.[name], "project"],
      [table.phases?.[phase]?.[name], "phase"],
      [config.overrides?.agents?.[name], "project"],
      [table.agents?.[name]?.tier, "agent"],
    ) ?? { tier: ceiling, source: "inherit" };
  }

  const tier = capAtCeiling(chosen.tier, ceiling, config.maxTier);
  if (!tier) return null;
  // No próprio teto (inclui a rota inherit) o esforço do usuário é preservado: o do tier não rebaixa xhigh.
  const wantEffort = table.agents?.[name]?.effort ?? (tier === ceiling ? ceilingEffort : table.effortByTier?.[tier]);
  const effort = capEffort(wantEffort, ceilingEffort);
  // D21: alias só quando muda algo. Igual ao teto (herda) ou explícito já dentro do teto → não toca.
  const unchanged = hasExplicit ? tier === chosen.tier : tier === ceiling;
  return { tier, model: unchanged ? null : toAlias(tier), effort, source: chosen.source, ceiling };
}

export function resolveSessionRoute({ table, config, phase, skill, userModel, userEffort }) {
  if (!config?.enabled || !config.session || !table) return null;
  const ceiling = tierOf(userModel);
  if (!ceiling) return null;

  let want = ceiling;
  let source = "inherit";
  if (PHASES.includes(phase)) {
    const raw = config.overrides?.session?.phases?.[phase] ?? table.session?.phases?.[phase];
    want = raw === "ceiling" ? ceiling : TIERS.includes(raw) ? raw : ceiling;
    source = "phase";
  }
  const tier = capAtCeiling(want, ceiling, config.maxTier);
  if (!tier) return null;
  const rawEffort = table.session?.skills?.[skill];
  // Sem esforço mapeado e no próprio teto: nada foi pedido além do que o usuário já escolheu.
  const wantEffort = rawEffort === "ceiling" ? userEffort : rawEffort ?? (tier === ceiling ? userEffort : table.effortByTier?.[tier]);
  return { tier, effort: capEffort(wantEffort, userEffort), source, ceiling };
}
