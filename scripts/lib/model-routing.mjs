// scripts/lib/model-routing.mjs — núcleo do roteamento de modelos do DevFlow
// (spec docs/superpowers/specs/2026-10-08-model-routing-design.md).
// PURO: sem import de node:* — o mod (function hooks, sem Node) importa este arquivo.

export const TIERS = Object.freeze(["cheap", "standard", "capable", "top"]);
export const EFFORTS = Object.freeze(["low", "medium", "high", "xhigh", "max"]);
export const PHASES = Object.freeze(["P", "R", "E", "V", "C"]);

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
