#!/usr/bin/env node
// scripts/devflow-migrate.mjs
// Migração de layout v1 → v2: move subsistemas para engineering/ e cria camadas DDC.
// Idempotente: se .layout-version == 2, sai sem fazer nada.
// Usa `git mv` para preservar histórico; fallback renameSync se fora de repositório git.
import { existsSync, mkdirSync, renameSync, writeFileSync, readFileSync, readdirSync, rmdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import { contextPaths, LAYOUT_VERSION } from "./lib/context-paths.mjs";

// ---------------------------------------------------------------------------
// Parse argv
// ---------------------------------------------------------------------------
const argv = process.argv.slice(2);
let projectRoot = process.cwd();
// --yes accepted (non-interactive; no prompt to build here)
for (const arg of argv) {
  if (arg.startsWith("--project=")) projectRoot = arg.slice("--project=".length);
}

// ---------------------------------------------------------------------------
// Idempotency guard
// ---------------------------------------------------------------------------
const paths = contextPaths(projectRoot);
if (existsSync(paths.layoutVersionFile)) {
  const ver = readFileSync(paths.layoutVersionFile, "utf-8").trim();
  if (ver === String(LAYOUT_VERSION)) {
    console.log("already migrated (layout v2)");
    process.exit(0);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Move a single entry (file or directory) from src to dst using git mv,
// falling back to renameSync. Returns the method used or throws.
function moveEntry(src, dst, cwd) {
  try {
    execFileSync("git", ["mv", src, dst], { cwd, stdio: "pipe" });
    return "git mv";
  } catch {
    renameSync(src, dst);
    return "renameSync";
  }
}

// Merge all entries from sourceDir into destDir.
// - No-collision entries: moved via git mv / renameSync.
// - Collision entries (same name already in dest): left in source, recorded in conflicts[].
// Returns { movedEntries, conflicts, method }.
function mergeDir(sourceDir, destDir, cwd) {
  mkdirSync(destDir, { recursive: true });
  const entries = readdirSync(sourceDir);
  const movedEntries = [];
  const conflicts = [];
  let method = "renameSync";
  for (const entry of entries) {
    const src = join(sourceDir, entry);
    const dst = join(destDir, entry);
    if (existsSync(dst)) {
      conflicts.push(entry);
    } else {
      try {
        method = moveEntry(src, dst, cwd);
        movedEntries.push(entry);
      } catch (err) {
        conflicts.push(`${entry} (error: ${err.message})`);
      }
    }
  }
  return { movedEntries, conflicts, method };
}

// ---------------------------------------------------------------------------
// Subsystem migration
// ---------------------------------------------------------------------------
const SUBSYSTEMS = ["adrs", "standards", "stacks", "templates"];
const report = { moved: [], skipped: [], conflicts: [], errors: [] };

for (const key of SUBSYSTEMS) {
  const dest = paths[key]; // canonical engineering/ location

  // Determine source: for "adrs", also check .context/docs/adrs (v0.x legacy location)
  // when the primary v1 source (.context/adrs) is absent.
  let source = join(projectRoot, ".context", key); // v1 top-level location
  if (!existsSync(source) && key === "adrs") {
    const legacyDocsAdrs = join(projectRoot, ".context", "docs", "adrs");
    if (existsSync(legacyDocsAdrs)) {
      source = legacyDocsAdrs;
    }
  }

  if (!existsSync(source)) {
    report.skipped.push(`${key} (source absent)`);
    continue;
  }

  // Ensure engineering/ parent exists
  mkdirSync(dirname(dest), { recursive: true });

  if (!existsSync(dest)) {
    // ── No-dest case: move whole directory (original behaviour) ──────────
    try {
      execFileSync("git", ["mv", source, dest], { cwd: projectRoot, stdio: "pipe" });
      report.moved.push(`${key} (git mv)`);
    } catch {
      try {
        renameSync(source, dest);
        report.moved.push(`${key} (renameSync)`);
      } catch (err) {
        report.errors.push(`${key}: ${err.message}`);
      }
    }
  } else {
    // ── Dest exists: MERGE semantics ─────────────────────────────────────
    // Move each entry individually; skip (leave in source) on name collision.
    const { movedEntries, conflicts, method } = mergeDir(source, dest, projectRoot);

    if (movedEntries.length > 0) {
      report.moved.push(`${key} merged (${method}): ${movedEntries.join(", ")}`);
    }

    if (conflicts.length > 0) {
      report.conflicts.push(`${key}: collisions kept in source — ${conflicts.join(", ")}`);
    }

    // Remove source dir only when fully drained (no remaining entries)
    const remaining = readdirSync(source);
    if (remaining.length === 0) {
      try {
        // Attempt git rm of the now-empty directory; fallback to rmdirSync
        execFileSync("git", ["rm", "-rf", source], { cwd: projectRoot, stdio: "pipe" });
      } catch {
        try { rmdirSync(source); } catch { /* already gone */ }
      }
    } else if (movedEntries.length === 0 && conflicts.length > 0) {
      report.skipped.push(`${key} (all entries collide — source left intact)`);
    }
  }
}

// ---------------------------------------------------------------------------
// Narrative knowledge layers
// ---------------------------------------------------------------------------
const LAYERS = ["business", "product", "operations", "engineering"];
const created = [];
for (const layer of LAYERS) {
  const layerPath = paths[layer] ?? join(projectRoot, ".context", layer);
  if (!existsSync(layerPath)) {
    mkdirSync(layerPath, { recursive: true });
    created.push(layer);
  }
}

// ---------------------------------------------------------------------------
// Write layout version marker
// ---------------------------------------------------------------------------
writeFileSync(paths.layoutVersionFile, String(LAYOUT_VERSION) + "\n");

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
if (report.moved.length)     console.log("moved:     " + report.moved.join(", "));
if (report.skipped.length)   console.log("skipped:   " + report.skipped.join(", "));
if (report.conflicts.length) console.log("conflicts: " + report.conflicts.join("; "));
if (created.length)          console.log("created:   " + created.join(", "));
if (report.errors.length) {
  console.error("errors:    " + report.errors.join("; "));
  process.exit(1);
}
console.log(`layout-version written: ${LAYOUT_VERSION}`);
