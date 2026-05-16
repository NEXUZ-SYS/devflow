// tests/integration/assert-no-decision-leak.mjs
//
// AC5 asserter for the standards concern-first E2E gate. Verifies that no
// std's ## Princípios section contains a verbatim substring (>= N chars) of
// any ADR's ## Decisão section — i.e. concern standards describe operational
// rules, they do not copy-paste ADR decisions.
//
// Usage (CLI):   node assert-no-decision-leak.mjs <projectRoot>
// Usage (import): import { assertNoDecisionLeak } from "./assert-no-decision-leak.mjs"

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

function extractSection(md, heading) {
  const re = new RegExp(`^##\\s+${heading}\\s*$`, "mi");
  const m = md.match(re);
  if (!m) return "";
  const rest = md.slice(m.index + m[0].length);
  const next = rest.match(/^##\s+/m);
  return (next ? rest.slice(0, next.index) : rest).trim();
}

// Collapse whitespace so formatting differences don't mask a real leak.
function normalize(s) {
  return s.replace(/\s+/g, " ").trim();
}

export function assertNoDecisionLeak({ projectRoot, minSubstringLen = 40 }) {
  const adrsDir = join(projectRoot, ".context/adrs");
  const stdsDir = join(projectRoot, ".context/standards");
  if (!existsSync(adrsDir) || !existsSync(stdsDir)) return [];

  const adrs = readdirSync(adrsDir).filter(f => /^\d+-.*\.md$/.test(f));
  const stds = readdirSync(stdsDir).filter(f =>
    f.startsWith("std-") && f.endsWith(".md") && !f.endsWith(".deprecated.md")
  );

  const decisions = adrs.map(a => ({
    adr: a,
    text: normalize(extractSection(readFileSync(join(adrsDir, a), "utf-8"), "Decisão")),
  }));

  const leaks = [];
  for (const std of stds) {
    const principios = normalize(
      extractSection(readFileSync(join(stdsDir, std), "utf-8"), "Princípios")
    );
    if (!principios) continue;
    for (const { adr, text } of decisions) {
      if (text.length < minSubstringLen) continue;
      for (let pos = 0; pos + minSubstringLen <= text.length; pos += 10) {
        const chunk = text.slice(pos, pos + minSubstringLen);
        if (principios.includes(chunk)) {
          leaks.push({ std, adr, chunk });
          break;
        }
      }
    }
  }
  return leaks;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const projectRoot = process.argv[2];
  if (!projectRoot) {
    console.error("Usage: node assert-no-decision-leak.mjs <projectRoot>");
    process.exit(2);
  }
  const leaks = assertNoDecisionLeak({ projectRoot });
  if (leaks.length > 0) {
    console.error(`✗ ${leaks.length} decision leak(s) detected:`);
    for (const l of leaks) {
      console.error(`  ${l.std} ← ${l.adr}: "${l.chunk.slice(0, 60)}..."`);
    }
    process.exit(1);
  }
  console.log("✓ no decision leak — std Princípios are operational, not ADR copies");
  process.exit(0);
}
