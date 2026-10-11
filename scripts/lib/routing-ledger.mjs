// scripts/lib/routing-ledger.mjs — formato do ledger de roteamento (spec §8). PURO.
// Chaves por allowlist e VALORES por regex/enum: nunca prompt, resposta ou texto livre (ADR-005).
import { TIERS, EFFORTS, PHASES, isTierId } from "./model-routing.mjs";

export const LEDGER_KEYS = Object.freeze([
  "ts", "sessionId", "scope", "agentId", "agentType", "phase", "skill", "tier", "model", "effort",
  "source", "ceiling", "adapter", "usage", "cacheReadRatio", "switched", "escalation",
  "idPending", "idSource", "probe",
]);
const SAFE = /^[A-Za-z0-9:_./@[\]-]{1,64}$/;
const TS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
const ENUM = {
  scope: ["session", "subagent", "probe"],
  phase: PHASES,
  tier: TIERS,
  ceiling: TIERS,
  effort: EFFORTS,
  source: ["plan", "skill", "project", "phase", "agent", "explicit", "inherit"],
  adapter: ["mod", "classic", "omp", "cli"],
  idPending: TIERS,
  idSource: ["learned", "probe"],
  probe: ["ok", "rejected", "error"],
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

const dataBase = ({ xdgDataHome, home }) =>
  (typeof xdgDataHome === "string" && xdgDataHome.startsWith("/") ? xdgDataHome : `${home}/.local/share`).replace(/\/+$/, "");

export function ledgerDirFrom({ xdgDataHome, home, cwd }) {
  return `${dataBase({ xdgDataHome, home })}/devflow-model-routing/${projectKey(cwd)}`;
}

// Cache de IDs verificados (spec 2026-10-10-routing-session-tier-ids §3.3): por usuário, não por projeto.
// É só fonte de candidato: o mod re-sonda antes de usar.
export function idsCachePathFrom({ xdgDataHome, home }) {
  return `${dataBase({ xdgDataHome, home })}/devflow-model-routing/ids.json`;
}

function pickIds(src) {
  const out = {};
  if (!src || typeof src !== "object" || Array.isArray(src)) return out;
  for (const t of TIERS) if (Object.hasOwn(src, t) && isTierId(src[t], t)) out[t] = src[t];
  return out;
}

export function parseIdsCache(text) {
  let d;
  try { d = JSON.parse(text); } catch { return {}; }
  return d && d.version === 1 ? pickIds(d.ids) : {};
}

export function serializeIdsCache(ids) {
  return JSON.stringify({ version: 1, ids: pickIds(ids) }) + "\n";
}
