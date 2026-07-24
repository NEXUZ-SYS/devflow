// scripts/reversa-import/ledger.mjs
// Ledger de confiança do corpus importado.
// Os marcadores nativos do Reversa (🟢 CONFIRMADO · 🟡 INFERIDO · 🔴 LACUNA)
// têm a MESMA semântica do ledger que a fase V observa (ADR-013). Aqui eles
// são agregados e os itens RC do handoff viram constraints com alvo e risco.
//
// testInputs REGISTRA, nunca converte: traduzir Gherkin em teste é decisão de
// design da fase E, não do importador.
import { readFileSync, statSync } from "node:fs";
import { scanMarkers } from "./markers.mjs";

const TEXT_RE = /\.(md|feature|txt|ya?ml|json)$/i;
const MAX_SCAN_BYTES = 1024 * 1024;
const SCENARIO_RE = /^\s*(?:Cenário|Cenario|Scenario|Esquema do Cenário|Scenario Outline):/;
const TAG_RE = /^\s*(@[\w-]+(?:\s+@[\w-]+)*)\s*$/;
const RISK_RE = /\b(RISK-\d+)\b/;

function readSafe(p) {
  try {
    if (statSync(p).size > MAX_SCAN_BYTES) return "";
    return readFileSync(p, "utf-8");
  } catch { return ""; }
}

function parseFeature(text) {
  let scenarios = 0;
  const tags = new Set();
  for (const line of String(text).split("\n")) {
    if (SCENARIO_RE.test(line)) { scenarios += 1; continue; }
    const m = line.match(TAG_RE);
    if (m) for (const t of m[1].split(/\s+/)) tags.add(t);
  }
  return { scenarios, tags: [...tags] };
}

export function buildLedger(artifacts = [], { handoff } = {}) {
  const markers = { official: 0, captured: 0, inferred: 0, gap: 0, total: 0 };
  const byFile = {};
  const testInputs = [];

  for (const a of artifacts) {
    if (!TEXT_RE.test(a.relPath)) continue;
    const text = readSafe(a.path);
    if (!text) continue;

    const m = scanMarkers(text);
    if (m.total > 0) {
      byFile[a.relPath] = {
        official: m.official, captured: m.captured,
        inferred: m.inferred, gap: m.gap, total: m.total,
      };
      markers.official += m.official;
      markers.captured += m.captured;
      markers.inferred += m.inferred;
      markers.gap += m.gap;
    }

    if (a.kind === "test-input" && /\.feature$/i.test(a.relPath)) {
      const { scenarios, tags } = parseFeature(text);
      testInputs.push({ relPath: a.relPath, format: "gherkin", scenarios, tags });
    }
  }
  markers.total = markers.official + markers.captured + markers.inferred + markers.gap;

  const constraints = ((handoff && handoff.rcItems) || []).map((rc) => {
    const hit = `${rc.how} ${rc.what}`.match(RISK_RE);
    return {
      id: rc.id, what: rc.what, where: rc.where, how: rc.how,
      risk: hit ? hit[1] : null, origin: "handoff-rc",
    };
  });

  return { markers, byFile, constraints, testInputs };
}
