#!/usr/bin/env node
// scripts/lib/git-op-guard-cli.mjs — stdin wrapper for git-op-guard (ADV-6).
// Reads the PreToolUse event JSON from stdin, resolves the current branch +
// .context/.devflow.yaml git config, and emits {decision, reason} JSON.
// Fail-open (allow) on any error — never blocks non-git Bash.
//
// Per SI-1: invoked as a separate file with stdin JSON, never via node -e.
import { evaluateGitOp, loadGitConfig, resolveBranch } from "./git-op-guard.mjs";

const MAX = 1024 * 1024;
let raw = "";
process.stdin.setEncoding("utf-8");
process.stdin.on("data", c => {
  if (raw.length + c.length > MAX) process.exit(0);
  raw += c;
});
process.stdin.on("end", () => {
  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    process.exit(0);
  }
  try {
    const command = event?.tool_input?.command || "";
    const projectRoot = event?.cwd || process.cwd();
    if (!command) {
      console.log(JSON.stringify({ decision: "allow", reason: "sem comando" }));
      process.exit(0);
    }
    const branch = resolveBranch(projectRoot);
    const cfg = loadGitConfig(projectRoot);
    console.log(JSON.stringify(evaluateGitOp({ command, branch, ...cfg })));
    process.exit(0);
  } catch {
    process.exit(0);
  }
});
