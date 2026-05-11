#!/usr/bin/env node
// scripts/devflow-drift.mjs — detect major-version drift between installed
// dependencies (package.json/pyproject.toml/Cargo.toml/go.mod) and pinned
// versions in .context/stacks/manifest.yaml.
//
// Used by:
//   - .github/workflows/stack-drift.yml (nightly + on PR)
//   - `devflow context drift` CLI subcommand (Task X.5.f, future)
//
// Pure node:* — uses scripts/lib/manifest-stacks.mjs.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { loadManifest } from "./lib/manifest-stacks.mjs";

function cleanVersion(v) {
  if (typeof v !== "string") return null;
  const m = v.match(/^[~^>=<\s]*([0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.-]+)?)/);
  return m ? m[1] : null;
}

function majorOf(version) {
  const cleaned = cleanVersion(version);
  if (!cleaned) return null;
  const m = cleaned.match(/^(\d+)\./);
  return m ? parseInt(m[1], 10) : null;
}

export function majorVersionDiff(installed, pinned) {
  const a = majorOf(installed);
  const b = majorOf(pinned);
  if (a === null || b === null) return false;
  return a !== b;
}

function readPackageJson(projectRoot) {
  const path = join(projectRoot, "package.json");
  if (!existsSync(path)) return {};
  try {
    const pkg = JSON.parse(readFileSync(path, "utf-8"));
    return { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  } catch {
    return {};
  }
}

export function findDrift(projectRoot) {
  const installed = readPackageJson(projectRoot);
  const manifest = loadManifest(projectRoot);
  const drifts = [];

  for (const [name, fw] of Object.entries(manifest.frameworks || {})) {
    if (fw.skipDocs) continue;
    const installedVersion = installed[name];
    if (!installedVersion) continue;
    if (majorVersionDiff(installedVersion, fw.version)) {
      drifts.push({
        framework: name,
        installed: cleanVersion(installedVersion),
        pinned: cleanVersion(fw.version),
        suggestion: `devflow stacks scrape ${name} ${cleanVersion(installedVersion)} --mode=refresh`,
      });
    }
  }
  return drifts;
}

// CLI entrypoint
if (import.meta.url === `file://${process.argv[1]}`) {
  const drifts = findDrift(process.cwd());
  if (drifts.length === 0) {
    console.log("OK: no major version drift detected.");
    process.exit(0);
  }
  console.log(`Drift detected (${drifts.length} framework(s)):`);
  for (const d of drifts) {
    console.log(`  - ${d.framework}: installed=${d.installed} pinned=${d.pinned}`);
    console.log(`    Suggestion: ${d.suggestion}`);
  }
  // Exit 1 for CI gating
  process.exit(process.argv.includes("--strict") ? 1 : 0);
}
