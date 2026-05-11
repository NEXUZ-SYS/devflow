#!/usr/bin/env node
// scripts/lib/context-index-cli.mjs — CLI wrapper for buildContextIndex.
// Used by hooks/session-start to emit the index as either JSON or
// human-readable text (for additionalContext injection).
//
// Usage:
//   node scripts/lib/context-index-cli.mjs [--project=<path>] [--format=json|text]

import { resolve } from "node:path";
import { buildContextIndex, renderContextIndexText } from "./context-index.mjs";

function parseArgs(argv) {
  const opts = { project: null, format: "json" };
  for (const a of argv) {
    if (a.startsWith("--project=")) opts.project = a.slice("--project=".length);
    else if (a.startsWith("--format=")) opts.format = a.slice("--format=".length);
  }
  return opts;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const projectRoot = opts.project ? resolve(opts.project) : process.cwd();
  const idx = buildContextIndex(projectRoot);

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
