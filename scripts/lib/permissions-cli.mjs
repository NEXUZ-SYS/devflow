#!/usr/bin/env node
// scripts/lib/permissions-cli.mjs — stdin wrapper for permissions-evaluator.
//
// Reads JSON event from stdin: { tool, path?, command? }
// Loads .context/permissions.yaml from process.cwd().
// Emits decision JSON to stdout: { decision, reason }
//
// Per SI-1: never invoked via 'node -e' with interpolation; always invoked
// as a separate file with stdin JSON.

import { evaluatePermissions, loadPermissions } from "./permissions-evaluator.mjs";

const MAX_STDIN_BYTES = 1024 * 1024;
let raw = "";
process.stdin.setEncoding("utf-8");
process.stdin.on("data", chunk => {
  if (raw.length + chunk.length > MAX_STDIN_BYTES) {
    process.exit(0);
  }
  raw += chunk;
});
process.stdin.on("end", async () => {
  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    process.exit(0);  // bad input — silent (hook continues)
  }
  try {
    const cfg = loadPermissions(process.cwd());
    const result = await evaluatePermissions(event, cfg);
    console.log(JSON.stringify(result));
    process.exit(0);
  } catch {
    process.exit(0);
  }
});
