#!/usr/bin/env node
// scripts/lib/devflow-config-guard-cli.mjs — stdin wrapper for the .devflow.yaml
// config guard (ADV-8/B9). Reads the PreToolUse event, resolves the CURRENT git
// config (from git HEAD — trusted baseline — falling back to disk), the PROPOSED
// content (Write: content; Edit: applied replacement), and whether the current
// branch is protected. Emits {decision, reason}. Fail-open (allow) on any error.
//
// Per SI-1: invoked as a file via stdin, never node -e.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { evaluateConfigChange, parseGitSection } from "./devflow-config-guard.mjs";
import { resolveBranch } from "./git-op-guard.mjs";

const CONFIG_REL = ".context/.devflow.yaml";
const allow = (reason) => { console.log(JSON.stringify({ decision: "allow", reason })); process.exit(0); };

const MAX = 1024 * 1024;
let raw = "";
process.stdin.setEncoding("utf-8");
process.stdin.on("data", c => { if (raw.length + c.length > MAX) process.exit(0); raw += c; });
process.stdin.on("end", () => {
  let event;
  try { event = JSON.parse(raw); } catch { process.exit(0); }
  try {
    const projectRoot = event?.cwd || process.cwd();
    const ti = event?.tool_input || {};
    const diskPath = join(projectRoot, CONFIG_REL);

    // CURRENT: prefer git HEAD (trusted), fall back to working-tree.
    let currentText = "";
    try {
      currentText = execFileSync("git", ["-C", projectRoot, "show", `HEAD:${CONFIG_REL}`], {
        encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"],
      });
    } catch {
      if (existsSync(diskPath)) currentText = readFileSync(diskPath, "utf-8");
    }
    if (!currentText) allow("sem config atual — nada a proteger");

    // PROPOSED: Write → content; Edit → apply replacement over the on-disk file.
    let proposedText;
    if (typeof ti.content === "string") {
      proposedText = ti.content;
    } else if (typeof ti.new_string === "string") {
      const onDisk = existsSync(diskPath) ? readFileSync(diskPath, "utf-8") : currentText;
      proposedText = ti.old_string ? onDisk.replace(ti.old_string, ti.new_string) : onDisk;
    } else {
      allow("evento sem conteúdo proposto");
    }

    // Gate: só protege quando a branch ATUAL é protegida (baseline confiável).
    const protectedBranches = parseGitSection(currentText).protectedBranches;
    const branch = resolveBranch(projectRoot);
    if (!branch || !protectedBranches.includes(branch)) {
      allow(`branch '${branch}' não é protegida`);
    }

    console.log(JSON.stringify(evaluateConfigChange(currentText, proposedText)));
    process.exit(0);
  } catch {
    process.exit(0);
  }
});
