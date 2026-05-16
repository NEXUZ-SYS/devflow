// scripts/lib/standard-enrich.mjs
//
// Extracts ONLY the ## Guardrails and ## Enforcement sections from ADRs, to be
// used as raw input for a standard's `## Linter` section. Decisão / Contexto /
// Alternativas Consideradas are deliberately NOT extracted — those are ADR
// territory and must never leak into a concern-based standard's prose.
//
// Public API:
//   enrichFromAdrs(adrPaths: string[])
//     → { guardrails: string[], enforcement: string[], sources: string[] }
//   (guardrails and enforcement are deduped across all input ADRs)

import { readFileSync } from "node:fs";

// Returns the text of a ## <heading> section, or null if absent.
// Section ends at the next ## heading or EOF.
function extractSection(markdown, heading) {
  const re = new RegExp(`^##\\s+${heading}\\s*$`, "mi");
  const m = markdown.match(re);
  if (!m) return null;
  const start = m.index + m[0].length;
  const rest = markdown.slice(start);
  const nextHeading = rest.match(/^##\s+/m);
  return nextHeading ? rest.slice(0, nextHeading.index) : rest;
}

// Extracts bullet items from a section. Handles plain bullets ("- text",
// "* text") and GFM checkboxes ("- [ ] text", "- [x] text").
function extractBullets(sectionText) {
  if (!sectionText) return [];
  const bullets = [];
  for (const raw of sectionText.split("\n")) {
    const line = raw.trim();
    const m = line.match(/^[-*]\s+(?:\[[ xX]\]\s+)?(.+)$/);
    if (m && m[1].trim()) bullets.push(m[1].trim());
  }
  return bullets;
}

export async function enrichFromAdrs(adrPaths) {
  const guardrailsSet = new Set();
  const enforcementSet = new Set();
  const sources = [];

  for (const path of adrPaths) {
    let content;
    try {
      content = readFileSync(path, "utf-8");
    } catch {
      continue;
    }
    const guards = extractSection(content, "Guardrails");
    const enforce = extractSection(content, "Enforcement");
    for (const b of extractBullets(guards)) guardrailsSet.add(b);
    for (const b of extractBullets(enforce)) enforcementSet.add(b);
    sources.push(path);
  }

  return {
    guardrails: Array.from(guardrailsSet),
    enforcement: Array.from(enforcementSet),
    sources,
  };
}
