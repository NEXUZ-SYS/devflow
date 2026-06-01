#!/usr/bin/env node
// scripts/lib/context-index-cli.mjs — CLI wrapper for buildContextIndex.
// Used by hooks/session-start to emit the index as either JSON or
// human-readable text (for additionalContext injection).
//
// Usage:
//   node scripts/lib/context-index-cli.mjs [--project=<path>] [--format=json|text] [--plugin=<path>]
//
// --plugin=<path>  Override CLAUDE_PLUGIN_ROOT for plugin-bundled default
//                  standards. Falls back to process.env.CLAUDE_PLUGIN_ROOT
//                  when absent (R9 env fallback in loadStandardsMerged).

import { resolve } from "node:path";
import { buildContextIndex, renderContextIndexText } from "./context-index.mjs";

function parseArgs(argv) {
  const opts = { project: null, format: "json", plugin: null };
  for (const a of argv) {
    if (a.startsWith("--project=")) opts.project = a.slice("--project=".length);
    else if (a.startsWith("--format=")) opts.format = a.slice("--format=".length);
    else if (a.startsWith("--plugin=")) opts.plugin = a.slice("--plugin=".length);
  }
  return opts;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const projectRoot = opts.project ? resolve(opts.project) : process.cwd();
  // pluginRoot: explicit --plugin flag → resolved absolute path;
  //             absent → undefined (loadStandardsMerged reads env fallback).
  const pluginRoot = opts.plugin ? resolve(opts.plugin) : undefined;
  const idx = buildContextIndex(projectRoot, pluginRoot);

  if (opts.format === "text") {
    process.stdout.write(renderContextIndexText(idx));
    process.stdout.write("\n");
  } else {
    process.stdout.write(JSON.stringify(idx, null, 2));
    process.stdout.write("\n");
  }
  process.exit(0);
}

main();
