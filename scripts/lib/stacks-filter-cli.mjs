#!/usr/bin/env node
// scripts/lib/stacks-filter-cli.mjs — emite o bloco <STACKS filtered> para o
// skill devflow:stack-filter (Planning on-demand) e para inspeção manual.
//
//   node scripts/lib/stacks-filter-cli.mjs [--project=<path>] [--plugin=<path>] [--task="..."]
//
// Combina loadStacksMerged + filterStacks (detecção por deps) com um keyword-match
// leve que libera stacks NEVER_AUTO (harness-engineering, gemini) quando a task
// menciona termos relevantes. Pure node:*.

import { resolve } from "node:path";
import { loadStacksMerged } from "./stacks-loader.mjs";
import { filterStacks } from "./stacks-filter.mjs";

// Termos que liberam stacks normalmente não auto-incluídos (decisão Fase 7).
const KEYWORD_RELEASE = {
  "harness-engineering": /\b(harness|agent|agentic|orchestrat|tool[- ]?call)/i,
  gemini: /\bgemini\b/i,
};

export function buildStacksContext(projectRoot, pluginRoot, task = "") {
  const merged = loadStacksMerged(projectRoot, pluginRoot);
  const { matched } = filterStacks(merged, projectRoot);
  const have = new Set(matched.map((x) => x.lib));
  // Keyword release: adiciona stacks NEVER_AUTO se a task casar e existirem no merge.
  for (const [lib, re] of Object.entries(KEYWORD_RELEASE)) {
    if (have.has(lib)) continue;
    const fw = merged.frameworks?.[lib];
    if (fw && task && re.test(task)) {
      matched.push({ lib, ...fw });
      have.add(lib);
    }
  }
  return { matched, task };
}

export function renderStacksText(ctx) {
  const lines = [];
  lines.push('<STACKS filtered="true">');
  if (!ctx.matched.length) {
    lines.push("  (nenhum stack relevante ao framework detectado)");
  } else {
    for (const fw of ctx.matched) {
      if (fw.mcpIndexed === true) {
        lines.push(
          `  - ${fw.lib}@${fw.version} — docs no MCP (mcp__docs-mcp-server__search_docs("${fw.lib}", "<query>"))`,
        );
      } else if (fw.skipDocs) {
        lines.push(`  - ${fw.lib}@${fw.version} — sem doc indexada; ler narrativa: ${fw.mdPath || "(n/d)"}`);
      } else {
        lines.push(`  - ${fw.lib}@${fw.version}`);
      }
    }
  }
  lines.push("</STACKS>");
  return lines.join("\n");
}

function main() {
  const opts = { project: null, plugin: null, task: "" };
  for (const a of process.argv.slice(2)) {
    if (a.startsWith("--project=")) opts.project = a.slice("--project=".length);
    else if (a.startsWith("--plugin=")) opts.plugin = a.slice("--plugin=".length);
    else if (a.startsWith("--task=")) opts.task = a.slice("--task=".length);
  }
  const projectRoot = opts.project ? resolve(opts.project) : process.cwd();
  const pluginRoot = opts.plugin ? resolve(opts.plugin) : process.env.CLAUDE_PLUGIN_ROOT;
  process.stdout.write(renderStacksText(buildStacksContext(projectRoot, pluginRoot, opts.task)) + "\n");
}

if (import.meta.url === `file://${process.argv[1]}`) main();
