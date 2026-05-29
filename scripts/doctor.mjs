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
import { execFileSync } from "node:child_process";
import { runChecks } from "./lib/doctor.mjs";

// Injection-safe PATH resolution (no shell): scan $PATH dirs for an executable.
function which(bin) {
  if (!bin || /[/\\]/.test(bin)) return bin ? existsSync(bin) : false;
  const dirs = (process.env.PATH || "").split(delimiter).filter(Boolean);
  for (const d of dirs) {
    const p = join(d, bin);
    try {
      const st = statSync(p);
      if (st.isFile() && (st.mode & 0o111)) return true;
    } catch { /* not here */ }
  }
  return false;
}

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

const ICON = { OK: "✓", WARN: "⚠", FAIL: "✗" };

async function main() {
  const args = process.argv.slice(2);
  const json = args.includes("--json");
  const ci = args.indexOf("--check");
  const ids = ci >= 0 && args[ci + 1] ? [args[ci + 1]] : null;

  const ctx = { cwd: process.cwd(), which, exec, today: today() };
  const results = await runChecks(ctx, ids);

  const failCount = results.filter(r => r.status === "FAIL").length;

  if (json) {
    process.stdout.write(JSON.stringify({ results }, null, 2) + "\n");
    return process.exit(failCount > 0 ? 1 : 0);
  }

  const counts = { OK: 0, WARN: 0, FAIL: 0 };
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
  console.log(`  ${counts.FAIL} FAIL · ${counts.WARN} WARN · ${counts.OK} OK`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  // Exit non-zero only on FAIL so scripts/routines can detect problems.
  process.exit(counts.FAIL > 0 ? 1 : 0);
}

main();
