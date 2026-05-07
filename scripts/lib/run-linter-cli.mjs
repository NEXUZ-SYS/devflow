#!/usr/bin/env node
// scripts/lib/run-linter-cli.mjs — stdin wrapper for run-linter.mjs.
// Reads JSON event from stdin, invokes runLintersFor, prints concatenated
// VIOLATION messages to stdout (consumed by hooks/post-tool-use).
//
// Per SI-1: never invoked via 'node -e' with interpolation; always invoked as
// a separate file with stdin JSON.

import { runLintersFor } from "./run-linter.mjs";

// SI-aligned: cap stdin at 1MB (matches run-linter execFile maxBuffer)
const MAX_STDIN_BYTES = 1024 * 1024;
let raw = "";
process.stdin.setEncoding("utf-8");
process.stdin.on("data", chunk => {
  if (raw.length + chunk.length > MAX_STDIN_BYTES) {
    process.exit(0);  // silent — hook continues normally
  }
  raw += chunk;
});
process.stdin.on("end", async () => {
  let event;
  try {
    event = JSON.parse(raw);
  } catch (err) {
    // Bad input — silent exit (hook continues normally)
    process.exit(0);
  }
  const projectRoot = process.cwd();
  try {
    const { violations, rejected } = await runLintersFor(event, projectRoot);
    if (violations.length === 0) {
      process.exit(0);
    }
    // Format for human reader
    const lines = violations.map(v => `Standard ${v.id} violated: ${v.msg}`);
    console.log(lines.join("\n"));
    process.exit(0);
  } catch (err) {
    // Don't fail the hook — silent exit on internal errors
    process.exit(0);
  }
});
