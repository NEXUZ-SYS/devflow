// scripts/lib/routing-ledger.mjs — formato do ledger de roteamento (spec §8). PURO.
// Chaves por allowlist e VALORES por regex/enum: nunca prompt, resposta ou texto livre (ADR-005).
import { TIERS, EFFORTS, PHASES } from "./model-routing.mjs";

export const LEDGER_KEYS = Object.freeze([
  "ts", "sessionId", "scope", "agentId", "agentType", "phase", "skill", "tier", "model", "effort",
  "source", "ceiling", "adapter", "usage", "cacheReadRatio", "switched", "escalation",
]);
const SAFE = /^[A-Za-z0-9:_./@[\]-]{1,64}$/;
const TS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
const ENUM = {
  scope: ["session", "subagent"],
  phase: PHASES,
  tier: TIERS,
  ceiling: TIERS,
  effort: EFFORTS,
  source: ["plan", "skill", "project", "phase", "agent", "explicit", "inherit"],
  adapter: ["mod", "classic", "omp", "cli"],
};
const SAFE_KEYS = ["sessionId", "agentId", "agentType", "skill", "model"];
const USAGE_KEYS = ["input_tokens", "output_tokens", "cache_read_input_tokens", "cache_creation_input_tokens"];
const ESC = { at: ["retry", "midRun"], from: TIERS, to: TIERS, action: ["keep", "human", "escalate"] };

const num = (v) => typeof v === "number" && Number.isFinite(v);

export function buildEntry(fields) {
  const out = {};
  const f = fields ?? {};
  if (typeof f.ts === "string" && TS.test(f.ts)) out.ts = f.ts;
  for (const k of SAFE_KEYS) if (typeof f[k] === "string" && SAFE.test(f[k])) out[k] = f[k];
  for (const [k, allowed] of Object.entries(ENUM)) if (allowed.includes(f[k])) out[k] = f[k];
  if (f.usage && typeof f.usage === "object") {
    const u = {};
    for (const k of USAGE_KEYS) if (num(f.usage[k])) u[k] = f.usage[k];
    if (Object.keys(u).length) out.usage = u;
  }
  if (num(f.cacheReadRatio) && f.cacheReadRatio >= 0 && f.cacheReadRatio <= 1) out.cacheReadRatio = f.cacheReadRatio;
  if (typeof f.switched === "boolean") out.switched = f.switched;
  if (f.escalation && typeof f.escalation === "object") {
    const e = {};
    for (const [k, allowed] of Object.entries(ESC)) if (allowed.includes(f.escalation[k])) e[k] = f.escalation[k];
    if (f.escalation.scores && typeof f.escalation.scores === "object") {
      const s = {};
      for (const k of ["failure_is_capability", "claims_done_with_evidence", "is_stuck"]) if (num(f.escalation.scores[k])) s[k] = f.escalation.scores[k];
      if (Object.keys(s).length) e.scores = s;
    }
    if (Object.keys(e).length) out.escalation = e;
  }
  return out;
}

// FNV-1a 64 bits — puro (o mod não tem node:crypto).
export function projectKey(path) {
  let h = 0xcbf29ce484222325n;
  const s = String(path);
  for (let i = 0; i < s.length; i++) {
    h ^= BigInt(s.charCodeAt(i));
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return h.toString(16).padStart(16, "0");
}

export function ledgerDirFrom({ xdgDataHome, home, cwd }) {
  const base = typeof xdgDataHome === "string" && xdgDataHome.startsWith("/") ? xdgDataHome : `${home}/.local/share`;
  return `${base}/devflow-model-routing/${projectKey(cwd)}`;
}
