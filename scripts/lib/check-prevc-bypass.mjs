#!/usr/bin/env node
// scripts/lib/check-prevc-bypass.mjs — PREVC handoff bypass detector (T20, ADR-006)
//
// Usage: node check-prevc-bypass.mjs <projectRoot> <editedFilePath>
//
// Prints a <PREVC_HANDOFF_BYPASS>...</PREVC_HANDOFF_BYPASS> block to stdout when:
//   1. The edited file matches a plan glob (docs/superpowers/plans/*.md OR
//      .context/plans/*.md)
//   2. No active PREVC workflow is found at
//      <projectRoot>/.context/harness/workflows/prevc.json
//
// Exits 0 silently on any error or non-plan path.
// Per SI-1: invoked as a file with argv args, never via node -e interpolation.
// Only node:* builtins used.

import { readFileSync, existsSync } from "node:fs";
import { resolve, normalize } from "node:path";

const [, , projectRoot, editedFilePath] = process.argv;

function isPlanFile(filePath) {
  if (!filePath) return false;
  // Normalize backslashes for cross-platform safety
  const normalized = normalize(filePath).replace(/\\/g, "/");
  const endsWithMd = normalized.endsWith(".md");
  if (!endsWithMd) return false;
  const inSuperPowersPlans = normalized.includes("docs/superpowers/plans/");
  const inContextPlans = normalized.includes(".context/plans/");
  return inSuperPowersPlans || inContextPlans;
}

function isWorkflowActive(projectRoot) {
  if (!projectRoot) return false;
  const wfPath = resolve(projectRoot, ".context/harness/workflows/prevc.json");
  if (!existsSync(wfPath)) return false;

  let parsed;
  try {
    const raw = readFileSync(wfPath, "utf-8");
    parsed = JSON.parse(raw);
  } catch {
    // Unreadable or malformed → treat as not active
    return false;
  }

  if (!parsed || typeof parsed !== "object") return false;

  // Check completion signals (from spec + real prevc.json shape):
  //
  // Shape A (test/simple): top-level isComplete: true → finished
  if (parsed.isComplete === true) return false;
  //
  // Shape B (test/simple): top-level status as string "completed"/"complete"
  if (typeof parsed.status === "string" && /complete/i.test(parsed.status)) return false;
  //
  // Shape C (real prevc.json): status is an object; phases.C.status === "completed"
  if (
    parsed.status &&
    typeof parsed.status === "object" &&
    parsed.status.phases &&
    parsed.status.phases.C &&
    parsed.status.phases.C.status === "completed"
  ) {
    return false;
  }
  //
  // Shape D (test/simple): top-level phases.C.status === "completed"
  if (
    parsed.phases &&
    parsed.phases.C &&
    parsed.phases.C.status === "completed"
  ) {
    return false;
  }

  // Need a name/identity signal to confirm this is a real workflow record
  const hasName =
    Boolean(parsed.name) ||
    Boolean(parsed.binding && parsed.binding.workflowName) ||
    Boolean(parsed.status && typeof parsed.status === "object" && parsed.status.project && parsed.status.project.name);

  if (!hasName) return false;

  // If we get here: file exists, parsed OK, not finished → active
  return true;
}

function main() {
  // Guard: silently exit on missing args
  if (!editedFilePath) process.exit(0);

  try {
    if (!isPlanFile(editedFilePath)) process.exit(0);

    const active = isWorkflowActive(projectRoot);
    if (active) process.exit(0);

    // Plan file written without an active PREVC workflow → emit reminder
    const message = [
      "<PREVC_HANDOFF_BYPASS>",
      "Plano escrito sem workflow PREVC ativo.",
      "Se isto é trabalho sob DevFlow, registre o handoff dotcontext",
      "(scaffoldPlan + workflow-init + plan link) ou entre via /devflow —",
      "senão as fases R/V/C, o specialist matching e os gates serão pulados.",
      "Ref: ADR-006.",
      "</PREVC_HANDOFF_BYPASS>",
    ].join("\n");

    process.stdout.write(message + "\n");
    process.exit(0);
  } catch {
    // Never throw in a way that breaks the hook
    process.exit(0);
  }
}

main();
