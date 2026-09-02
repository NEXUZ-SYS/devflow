#!/usr/bin/env node
// scripts/doctor.mjs — CLI for /devflow:devflow-doctor.
// Runs the context-health checks and prints a report (human or --json).
// Diagnose-only: NEVER applies repairs (the skill drives repairs with consent).
//
// Usage:
//   node scripts/doctor.mjs            # human report for cwd
//   node scripts/doctor.mjs --json     # machine-readable for the skill
//   node scripts/doctor.mjs --check <id>
import { existsSync, statSync } from "node:fs";
import { join, delimiter } from "node:path";
import { homedir } from "node:os";
import { execFileSync } from "node:child_process";
import { runChecks } from "./lib/doctor.mjs";
import { which } from "./lib/which.mjs";

// Injection-safe PATH resolution (no shell): scan $PATH dirs for an executable.
function exec(bin, args) {
  try {
    const stdout = execFileSync(bin, args, { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"], timeout: 15000 });
    return { status: 0, stdout, stderr: "" };
  } catch (e) {
    return { status: e.status ?? 1, stdout: e.stdout?.toString() || "", stderr: e.stderr?.toString() || "" };
  }
}

function today() {
  // Local date YYYY-MM-DD. (Doctor is interactive; determinism not required here.)
  return new Date().toISOString().slice(0, 10);
}

// SKIP = "não consigo verificar aqui", distinto de OK e de FAIL. Não entra no
// exit code: ambiente onde a verificação não se aplica não é reprovado.
const ICON = { OK: "✓", WARN: "⚠", FAIL: "✗", SKIP: "–" };

async function main() {
  const args = process.argv.slice(2);
  const json = args.includes("--json");
  const ci = args.indexOf("--check");
  const ids = ci >= 0 && args[ci + 1] ? [args[ci + 1]] : null;

  const ctx = { cwd: process.cwd(), home: homedir(), which, exec, today: today() };
  const results = await runChecks(ctx, ids);

  const failCount = results.filter(r => r.status === "FAIL").length;

  if (json) {
    process.stdout.write(JSON.stringify({ results }, null, 2) + "\n");
    return process.exit(failCount > 0 ? 1 : 0);
  }

  const counts = { OK: 0, WARN: 0, FAIL: 0, SKIP: 0 };
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  DevFlow Doctor — saúde do contexto");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  for (const r of results) {
    counts[r.status]++;
    console.log(`\n${ICON[r.status]} [${r.status}] ${r.title}`);
    console.log(`    ${r.diagnosis.replace(/\n/g, "\n    ")}`);
    if (r.repair) console.log(`    → Repair: ${r.repair}${r.destructive ? "  (DESTRUTIVO — confirmar)" : ""}`);
  }
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  const skipNote = counts.SKIP > 0 ? ` · ${counts.SKIP} SKIP` : "";
  console.log(`  ${counts.FAIL} FAIL · ${counts.WARN} WARN · ${counts.OK} OK${skipNote}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  // Exit non-zero only on FAIL so scripts/routines can detect problems.
  process.exit(counts.FAIL > 0 ? 1 : 0);
}

main();
