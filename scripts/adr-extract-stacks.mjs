#!/usr/bin/env node
// scripts/adr-extract-stacks.mjs — extract stack mentions (lib@version)
// from an ADR file and optionally add them to .context/stacks/manifest.yaml.
//
// Usage:
//   node scripts/adr-extract-stacks.mjs <adr-file-or-slug> [--add-to-manifest] [--project=<path>]
//
// Examples:
//   # Read-only: list detected mentions
//   node scripts/adr-extract-stacks.mjs .context/adrs/001-adr-typescript-frontend-v1.0.0.md
//   node scripts/adr-extract-stacks.mjs 001 --project=tests/2026-05-07
//
//   # Mutating: add to manifest with status pending-scrape (idempotent)
//   node scripts/adr-extract-stacks.mjs 001 --add-to-manifest --project=.
//
// Pure node:* — uses scripts/lib/{adr-chain,manifest-stacks,frontmatter,
// standard-from-adr}.mjs. No network, no LLM.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseFrontmatter } from "./lib/frontmatter.mjs";
import { extractStackMentions } from "./lib/adr-chain.mjs";
import { addFrameworksToManifest } from "./lib/manifest-stacks.mjs";
import { resolveAdrSlug } from "./lib/standard-from-adr.mjs";

function parseArgs(argv) {
  const opts = { args: [], addToManifest: false, project: null };
  for (const a of argv) {
    if (a === "--add-to-manifest") opts.addToManifest = true;
    else if (a.startsWith("--project=")) opts.project = a.slice("--project=".length);
    else if (!a.startsWith("--")) opts.args.push(a);
  }
  return opts;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.args.length === 0) {
    console.error("Usage: adr-extract-stacks.mjs <adr-file-or-slug> [--add-to-manifest] [--project=<path>]");
    process.exit(2);
  }

  const projectRoot = opts.project ? resolve(opts.project) : process.cwd();
  const slugOrPath = opts.args[0];

  // Resolve slug → file path (delegates to standard-from-adr lib resolver)
  let adrPath;
  try {
    adrPath = resolveAdrSlug(slugOrPath, projectRoot);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }

  // Read + parse ADR
  const content = readFileSync(adrPath, "utf-8");
  const { data: fm, body } = parseFrontmatter(content);
  const adr = {
    name: fm.name,
    description: fm.description,
    stack: fm.stack,
    body,
  };

  // Extract mentions (tier-1 strict + tier-2 prose if manifest exists)
  const mentions = extractStackMentions(adr, { projectRoot });

  console.log(`ADR: ${fm.name || "(unnamed)"}`);
  console.log(`File: ${adrPath}`);
  if (mentions.length === 0) {
    console.log("Detected stacks: (none)");
    console.log("");
    console.log("Note: tier-2 prose extraction requires that lib display names");
    console.log("collapse (case-insensitive, alphanumeric-only) to a key already");
    console.log("declared in manifest.yaml. Use the strict <lib>@<version> form");
    console.log("in the ADR body to bootstrap a new lib without manifest.");
    process.exit(0);
  }

  console.log(`Detected stacks (${mentions.length}):`);
  for (const m of mentions) {
    console.log(`  - ${m.lib}@${m.version}`);
  }

  if (!opts.addToManifest) {
    console.log("");
    console.log("Re-run with --add-to-manifest to declare in .context/stacks/manifest.yaml");
    console.log("(idempotent; flags drift if existing entry has different version).");
    process.exit(0);
  }

  // Mutating mode — add to manifest
  const r = addFrameworksToManifest(projectRoot, mentions);
  console.log("");
  if (r.added.length > 0) {
    console.log(`Added ${r.added.length} entries to manifest.yaml:`);
    for (const e of r.added) console.log(`  + ${e} (pending-scrape)`);
  }
  if (r.skipped.length > 0) {
    console.log(`Already in manifest (skipped, no changes): ${r.skipped.join(", ")}`);
  }
  if (r.drift.length > 0) {
    console.error("");
    console.error("⚠ Version drift detected — NOT overwriting:");
    for (const d of r.drift) {
      console.error(`  - ${d.lib}: manifest=${d.existingVersion}, ADR=${d.newVersion}`);
    }
    console.error("Resolve manually: edit manifest.yaml, then re-scrape if version changed.");
    process.exit(1);
  }

  if (r.added.length > 0) {
    console.log("");
    console.log(`Next: scrape with \`node scripts/devflow-stacks.mjs scrape <lib> <ver> --source=<type> --from=<url> --project=${opts.project || "."}\``);
  }
  process.exit(0);
}

main();
