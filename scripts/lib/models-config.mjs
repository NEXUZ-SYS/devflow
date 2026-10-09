// scripts/lib/models-config.mjs — leitor ÚNICO do bloco `models:` do .devflow.yaml (ADR-011).
// PURO (o mod importa). Nunca lança: qualquer problema → roteamento desligado ou entrada ignorada.
// Lembrete (D18): este bloco é o PEDIDO do repositório; quem liga é effectiveConfig + env do usuário.
import { namedBlock, dedentBlock } from "./yaml-block.mjs";
import { parseYaml } from "./frontmatter.mjs";
import { TIERS, PHASES } from "./model-routing.mjs";

const MAX_BYTES = 256 * 1024;
const AGENT_RE = /^[A-Za-z0-9_-]+$/;

function defaults() {
  return {
    enabled: false,
    session: true,
    subagents: true,
    maxTier: null,
    ledger: false,
    overrides: { agents: {}, phases: {}, session: { phases: {} } },
    midRun: { enabled: false, failureStreak: 3 },
    thresholds: { capability: 0.6, claimsDone: 0.8 },
  };
}

const clean = (v) => (typeof v === "string" ? v.replace(/\s+#.*$/, "").trim() : v);
const isTrue = (v) => clean(v) === true || clean(v) === "true";
const isFalse = (v) => clean(v) === false || clean(v) === "false";
const asTier = (v) => (TIERS.includes(clean(v)) ? clean(v) : null);
const isMap = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

export function readModels(src) {
  const out = defaults();
  if (typeof src !== "string" || src.length > MAX_BYTES) return out;
  let data;
  try {
    const block = namedBlock(src, "models");
    if (!block.some((l) => l.trim() !== "")) return out;
    data = parseYaml(dedentBlock(block));
  } catch {
    return out;
  }
  if (!isMap(data)) return out;

  out.enabled = isTrue(data.enabled);
  if (data.session !== undefined) out.session = !isFalse(data.session);
  if (data.subagents !== undefined) out.subagents = !isFalse(data.subagents);
  out.ledger = isTrue(data.ledger);
  out.maxTier = asTier(data.maxTier);

  out.midRun.enabled = isTrue(data.midRun?.enabled);
  const fs = Number(clean(data.midRun?.failureStreak));
  if (Number.isInteger(fs) && fs >= 1 && fs <= 10) out.midRun.failureStreak = fs;
  for (const k of ["capability", "claimsDone"]) {
    const n = Number(clean(data.thresholds?.[k]));
    if (Number.isFinite(n) && n >= 0 && n <= 1) out.thresholds[k] = n;
  }

  const ov = isMap(data.overrides) ? data.overrides : {};
  for (const [agent, v] of Object.entries(isMap(ov.agents) ? ov.agents : {})) {
    const t = asTier(v?.tier);
    if (AGENT_RE.test(agent) && t) out.overrides.agents[agent] = t;
  }
  for (const [ph, m] of Object.entries(isMap(ov.phases) ? ov.phases : {})) {
    if (!PHASES.includes(ph) || !isMap(m)) continue;
    for (const [agent, v] of Object.entries(m)) {
      const t = asTier(v?.tier);
      if (AGENT_RE.test(agent) && t) (out.overrides.phases[ph] ??= {})[agent] = t;
    }
  }
  const sp = isMap(ov.session) && isMap(ov.session.phases) ? ov.session.phases : {};
  for (const [ph, v] of Object.entries(sp)) {
    const t = clean(v);
    if (PHASES.includes(ph) && (TIERS.includes(t) || t === "ceiling")) out.overrides.session.phases[ph] = t;
  }
  return out;
}
