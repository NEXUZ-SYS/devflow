// scripts/lib/context-index.mjs — Camada 1 (DevFlow context channel).
// Builds a session-start index that lists declared standards + stack refs so
// the LLM knows what's available without reading every file. Pure node:* —
// reuses loadStandards + loadManifest. No network, no LLM.
//
// Output shape (consumed by context-index-cli.mjs):
//   {
//     standards: [{ id, description, applyTo, hasLinter, version }],
//     refs:      [{ lib, version, refPath, status, lines }],
//     totals:    { standards, refs, refsScraped }
//   }
//
// `status` for refs:
//   - "scraped"        — refPath exists on disk, lines counted
//   - "pending-scrape" — declared in manifest but file missing
//
// skipDocs:true frameworks are excluded — they're services/platforms (e.g.,
// GitHub Actions) without a scrapeable canonical doc.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { loadStandards } from "./standards-loader.mjs";
import { loadManifest } from "./manifest-stacks.mjs";

export function buildContextIndex(projectRoot) {
  const standards = collectStandards(projectRoot);
  const refs = collectRefs(projectRoot);
  return {
    standards,
    refs,
    totals: {
      standards: standards.length,
      refs: refs.length,
      refsScraped: refs.filter(r => r.status === "scraped").length,
    },
  };
}

function collectStandards(projectRoot) {
  const stds = loadStandards(projectRoot);
  return stds.map(s => ({
    id: s.id,
    description: s.description,
    version: s.version,
    applyTo: s.applyTo,
    hasLinter: !!(s.enforcement && s.enforcement.linter),
  }));
}

function collectRefs(projectRoot) {
  const m = loadManifest(projectRoot);
  const out = [];
  for (const [lib, fw] of Object.entries(m.frameworks || {})) {
    if (fw.skipDocs) continue;
    if (!fw.artisanalRef) continue;

    const fullPath = join(projectRoot, ".context", "stacks", fw.artisanalRef);
    if (existsSync(fullPath)) {
      const content = readFileSync(fullPath, "utf-8");
      const lines = content.split("\n").length;
      out.push({
        lib,
        version: fw.version || "0.0.0",
        refPath: fw.artisanalRef,
        status: "scraped",
        lines,
      });
    } else {
      out.push({
        lib,
        version: fw.version || "0.0.0",
        refPath: fw.artisanalRef,
        status: "pending-scrape",
        lines: 0,
      });
    }
  }
  return out;
}

// Renders the index as a textual block suitable for hook injection. The LLM
// sees this as narrative context — stable headers ("Standards declarados",
// "Stack refs") let downstream skills/tests anchor reliably.
export function renderContextIndexText(idx) {
  const lines = [];
  lines.push(`Standards declarados (${idx.totals.standards}):`);
  if (idx.standards.length === 0) {
    lines.push("  (nenhum)");
  } else {
    for (const s of idx.standards) {
      const linter = s.hasLinter ? "linter:✓" : "linter:✗";
      const apply = s.applyTo || [];
      // Empty applyTo (task #70): service/SDK stds without a reliable file
      // footprint don't auto-trigger Camada 2. The marker tells the LLM the
      // std exists but won't fire on Read/Edit/Write.
      const applyToText = apply.length === 0
        ? "(manual — sem auto-trigger)"
        : apply.join(", ");
      lines.push(`  - ${s.id} — ${applyToText} (${linter})`);
    }
  }
  lines.push("");
  lines.push(`Stack refs (${idx.totals.refsScraped}/${idx.totals.refs} scraped):`);
  if (idx.refs.length === 0) {
    lines.push("  (nenhum)");
  } else {
    for (const r of idx.refs) {
      if (r.status === "scraped") {
        lines.push(`  - ${r.lib}@${r.version} — ${r.refPath} (${r.lines} linhas)`);
      } else {
        lines.push(`  - ${r.lib}@${r.version} — pending-scrape`);
      }
    }
  }
  lines.push("");
  lines.push("Para detalhes: read .context/stacks/refs/<lib>@<ver>.md ou .context/standards/<id>.md");
  return lines.join("\n");
}
