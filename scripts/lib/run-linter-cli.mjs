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
    // Format for human reader. Camada 4: append stdPath + refPath so the
    // LLM knows where to read the rule body and the API ref docs.
    //
    // Fase B: mcp-indexed refs render as a MCP query instruction instead of
    // a file path, since there's no .md to read.
    const lines = violations.map(v => {
      const parts = [`Standard ${v.id} violated: ${v.msg}`];
      if (v.stdPath) parts.push(`  std: ${v.stdPath}`);
      if (v.refPath) {
        if (v.refStatus === "mcp-indexed") {
          // refPath shape: "mcp:<lib>@<ver>"
          const libVer = v.refPath.replace(/^mcp:/, "");
          const [lib] = libVer.split("@");
          parts.push(`  ref: query mcp__docs-mcp-server__search_docs("${lib}", "<question>") (MCP-indexed)`);
        } else {
          const tag = v.refStatus === "pending-scrape" ? " (pending-scrape)" : "";
          parts.push(`  ref: ${v.refPath}${tag}`);
        }
      }
      return parts.join("\n");
    });
    console.log(lines.join("\n\n"));
    process.exit(0);
  } catch (err) {
    // Don't fail the hook — silent exit on internal errors
    process.exit(0);
  }
});
