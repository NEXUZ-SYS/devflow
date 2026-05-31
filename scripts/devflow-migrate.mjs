#!/usr/bin/env node
// scripts/devflow-migrate.mjs
// Migração de layout v1 → v2: move subsistemas para engineering/ e cria camadas DDC.
// Idempotente: se .layout-version == 2, sai sem fazer nada.
// Usa `git mv` para preservar histórico; fallback renameSync se fora de repositório git.
import { existsSync, mkdirSync, renameSync, writeFileSync, readFileSync } from "node:fs";
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
// Subsystem migration
// ---------------------------------------------------------------------------
const SUBSYSTEMS = ["adrs", "standards", "stacks", "templates"];
const report = { moved: [], skipped: [], errors: [] };

for (const key of SUBSYSTEMS) {
  const dest = paths[key]; // canonical engineering/ location

  if (existsSync(dest)) {
    report.skipped.push(`${key} (dest already exists)`);
    continue;
  }

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

  // Ensure engineering/ directory exists before moving the first subsystem
  mkdirSync(dirname(dest), { recursive: true });

  // Prefer git mv to preserve history; fall back to renameSync
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
if (report.moved.length)   console.log("moved:   " + report.moved.join(", "));
if (report.skipped.length) console.log("skipped: " + report.skipped.join(", "));
if (created.length)        console.log("created: " + created.join(", "));
if (report.errors.length) {
  console.error("errors:  " + report.errors.join("; "));
  process.exit(1);
}
console.log(`layout-version written: ${LAYOUT_VERSION}`);
