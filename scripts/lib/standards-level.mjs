// scripts/lib/standards-level.mjs — nível de enforcement (ADR-015 D3).
export const LEVELS = ["block", "warn", "review"];
export const RANK = { warn: 0, review: 1, block: 2 };
const valid = (v) => (LEVELS.includes(v) ? v : null);
// enforcement.rules deve ser um MAPA ruleId → nível, nunca um array: um array
// também passa em `typeof x === "object"`, mas indexar por ruleId (string)
// pegaria posições numéricas por acidente e Object.values trataria elementos
// posicionais como níveis válidos.
const isRulesMap = (r) => !!r && typeof r === "object" && !Array.isArray(r);

export function defaultLevelFor(std) {
  return std && std.source === "local" ? "block" : "warn";
}

export function resolveLevel(std, ruleId, { advisory = false } = {}) {
  const enf = (std && std.enforcement) || {};
  const byRule = isRulesMap(enf.rules) ? valid(enf.rules[ruleId]) : null;
  if (byRule) return byRule;
  if (advisory) return "warn";
  if (enf.level !== undefined) return valid(enf.level) || "warn";
  return defaultLevelFor(std);
}

export function maxLevel(std) {
  const enf = (std && std.enforcement) || {};
  const levels = [resolveLevel(std, "")];
  if (isRulesMap(enf.rules)) for (const v of Object.values(enf.rules)) if (valid(v)) levels.push(v);
  return levels.reduce((a, b) => (RANK[b] > RANK[a] ? b : a), "warn");
}
