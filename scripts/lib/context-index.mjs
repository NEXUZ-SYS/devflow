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
// `status` for refs (Fase B onwards):
//   - "mcp-indexed"    — lib has mcpIndexed:true in manifest (query via MCP tool)
//   - "scraped"        — legacy: refPath exists on disk, lines counted
//   - "pending-scrape" — legacy: declared in manifest but file missing
//
// skipDocs:true frameworks are excluded — they're services/platforms (e.g.,
// GitHub Actions) without a scrapeable canonical doc.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { loadStandardsMerged } from "./standards-loader.mjs";
import { loadStacksMerged } from "./stacks-loader.mjs";
import { filterStacks } from "./stacks-filter.mjs";

/**
 * Build the context index for Camada 1.
 *
 * @param {string} projectRoot  — absolute path to the project root
 * @param {string} [pluginRoot] — optional plugin root; defaults to
 *   process.env.CLAUDE_PLUGIN_ROOT (R9 env fallback in loadStandardsMerged)
 */
export function buildContextIndex(projectRoot, pluginRoot) {
  const standards = collectStandards(projectRoot, pluginRoot);
  const refs = collectRefs(projectRoot, pluginRoot);
  return {
    standards,
    refs,
    totals: {
      standards: standards.length,
      refs: refs.length,
      // "available" = ref is queryable, either via MCP or by reading the .md
      refsScraped: refs.filter(r => r.status === "scraped" || r.status === "mcp-indexed").length,
    },
  };
}

function collectStandards(projectRoot, pluginRoot) {
  // loadStandardsMerged handles env fallback (CLAUDE_PLUGIN_ROOT) internally
  // when pluginRoot is undefined.
  const stds = loadStandardsMerged(projectRoot, pluginRoot);
  return stds.map(s => ({
    id: s.id,
    description: s.description,
    version: s.version,
    applyTo: s.applyTo,
    hasLinter: !!(s.enforcement && s.enforcement.linter),
    // origin: "default" | "project" — exposed so renderer can tag [default]
    origin: s.origin || "project",
  }));
}

function collectRefs(projectRoot, pluginRoot) {
  // Fase 7: live-load dual-source (plugin defaults + projeto) e filtro por
  // framework detectado. Entradas declaradas pelo projeto (origin "project")
  // são SEMPRE incluídas (declaração explícita); defaults do plugin entram só
  // quando o filtro casa com as deps detectadas — assim o índice reflete o que
  // o projeto realmente usa, sem regredir refs legados declarados localmente.
  const merged = loadStacksMerged(projectRoot, pluginRoot);
  const { matched } = filterStacks(merged, projectRoot);
  const matchedLibs = new Set(matched.map((x) => x.lib));
  const out = [];
  for (const [lib, fw] of Object.entries(merged.frameworks || {})) {
    if (fw.skipDocs) continue;
    if (fw.origin !== "project" && !matchedLibs.has(lib)) continue;

    // Fase B (Migration to docs-mcp-server): mcpIndexed:true is the modern
    // declaration. Lib is indexed in the docs-mcp-server global store and
    // queryable via `mcp__docs-mcp-server__search_docs` / `list_libraries`.
    if (fw.mcpIndexed === true) {
      out.push({
        lib,
        version: fw.version || "0.0.0",
        refPath: null,
        status: "mcp-indexed",
        lines: 0,
      });
      continue;
    }

    // Legacy path: artisanalRef points to a generated .md file
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
      // Origin tag: [default] for plugin-bundled defaults, blank for project.
      const originTag = s.origin === "default" ? "[default] " : "";
      lines.push(`  - ${originTag}${s.id} — ${applyToText} (${linter})`);
    }
  }
  lines.push("");
  lines.push(`Stack refs (${idx.totals.refsScraped}/${idx.totals.refs} disponíveis):`);
  if (idx.refs.length === 0) {
    lines.push("  (nenhum)");
  } else {
    for (const r of idx.refs) {
      if (r.status === "mcp-indexed") {
        // Modern: query via MCP tools instead of reading a file
        lines.push(`  - ${r.lib}@${r.version} — MCP indexed (query: mcp__docs-mcp-server__search_docs)`);
      } else if (r.status === "scraped") {
        lines.push(`  - ${r.lib}@${r.version} — ${r.refPath} (${r.lines} linhas, legacy .md)`);
      } else {
        lines.push(`  - ${r.lib}@${r.version} — pending-scrape (legacy)`);
      }
    }
  }
  lines.push("");
  lines.push("Para detalhes:");
  lines.push("  - mcp-indexed: use mcp__docs-mcp-server__search_docs(<lib>, <query>) ou list_libraries");
  lines.push("  - legacy .md: read .context/stacks/refs/<lib>@<ver>.md");
  lines.push("  - standards: read .context/standards/<id>.md");
  return lines.join("\n");
}
