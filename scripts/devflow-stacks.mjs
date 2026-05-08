#!/usr/bin/env node
// scripts/devflow-stacks.mjs — CLI dispatcher for `devflow stacks <subcmd>`.
//
// Subcommands:
//   scrape-batch [<lib@ver> ...] [--from-package|--from-manifest] [--dry-run]
//   scrape <lib> <version> --source=<type> --from=<url> [--mode=create|refresh|validate]
//   validate [<lib>] [--strict]
//
// Per Dependency Policy: pure node:* — uses skill scripts (input-resolver,
// discovery, pipeline) and lib helpers (manifest-stacks, url-validator).

import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";
import {
  loadManifest,
  validateManifest,
  findMissingRefs,
} from "./lib/manifest-stacks.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(__dirname, "..");
const SKILL_DIR = join(PLUGIN_ROOT, "skills", "scrape-stack-batch", "scripts");

async function loadSkillScript(name) {
  const path = join(SKILL_DIR, name);
  return import(path);
}

// ─── validate ──────────────────────────────────────────────────────────────

async function cmdValidate(targetLib, strict, projectRoot) {
  const m = loadManifest(projectRoot);
  const errors = validateManifest(m);
  if (errors.length > 0) {
    console.error("Manifest validation errors:");
    for (const err of errors) console.error(`  - ${err}`);
    return 1;
  }

  const fws = m.frameworks || {};
  if (Object.keys(fws).length === 0) {
    console.log("OK: no frameworks declared (empty manifest)");
    return 0;
  }

  const missing = findMissingRefs(projectRoot);
  if (targetLib) {
    const filtered = missing.filter(x => x.framework === targetLib);
    if (filtered.length > 0) {
      console.error(`MISSING: ${targetLib} declares artisanalRef but file is absent`);
      return 1;
    }
  } else if (missing.length > 0) {
    console.error("MISSING refs:");
    for (const m of missing) console.error(`  - ${m.framework}@${m.version}: expected ${m.expected}`);
    return 1;
  }

  // SI-6 fence + sanity (≥5 code blocks per md2llm convention)
  let weakRefs = 0;
  for (const [name, fw] of Object.entries(fws)) {
    if (fw.skipDocs || !fw.artisanalRef) continue;
    if (targetLib && name !== targetLib) continue;
    const refPath = join(projectRoot, ".context", "stacks", fw.artisanalRef);
    if (!existsSync(refPath)) continue;  // already reported above
    const content = readFileSync(refPath, "utf-8");
    const hasFence = /<<<DEVFLOW_STACK_REF_START_/.test(content) && /<<<DEVFLOW_STACK_REF_END>>>/.test(content);
    const codeBlocks = (content.match(/```/g) || []).length / 2;
    if (!hasFence) {
      console.error(`WARN ${name}: missing SI-6 fence (file may be tampered or pre-v1.0)`);
      weakRefs++;
    }
    if (codeBlocks < 5) {
      console.error(`WARN ${name}: only ${codeBlocks} code blocks (md2llm sanity expects ≥5)`);
      weakRefs++;
    }
  }

  if (weakRefs === 0) {
    console.log(`OK: ${Object.keys(fws).length} frameworks valid (${Object.keys(fws).join(", ")})`);
  } else {
    console.log(`Summary: ${Object.keys(fws).length} frameworks, ${weakRefs} weak refs`);
  }
  if (strict && weakRefs > 0) {
    console.log("--strict: failing on weak refs");
    return 1;
  }
  return 0;
}

// ─── scrape (single-lib) ───────────────────────────────────────────────────

async function cmdScrape(library, version, opts, projectRoot) {
  if (!library || !version) {
    console.error("Usage: devflow stacks scrape <library> <version> --source=<type> --from=<url>");
    return 2;
  }
  if (!opts.source || !opts.from) {
    console.error("Error: --source and --from are required");
    return 2;
  }
  const { runPipeline } = await loadSkillScript("pipeline.mjs");
  if (opts.dryRun) {
    console.log(`Would scrape ${library}@${version} from ${opts.source}://${opts.from}`);
    return 0;
  }
  try {
    const result = await runPipeline({
      library, version,
      url: opts.from,
      type: opts.source,
    }, projectRoot);
    console.log(`OK: ${result.refPath} (hash ${result.hash}, ${result.snippetCount} snippets, ${result.sanitizationHits} sanitizations)`);
    return 0;
  } catch (err) {
    console.error(`SCRAPE FAILED: ${err.message}`);
    return 1;
  }
}

// ─── scrape-batch ──────────────────────────────────────────────────────────

async function cmdScrapeBatch(opts, projectRoot) {
  const { resolveAll } = await loadSkillScript("input-resolver.mjs");
  const stacks = resolveAll(projectRoot, {
    fromPackage: opts.fromPackage,
    fromManifest: opts.fromManifest,
    args: opts.args || [],
  });

  if (stacks.length === 0) {
    console.log("No stacks resolved from input. Provide args, --from-package, or --from-manifest.");
    return 0;
  }

  console.log(`Plan: scrape ${stacks.length} stack(s):`);
  for (const s of stacks) {
    console.log(`  - ${s.library}@${s.version}`);
  }

  if (opts.dryRun) {
    console.log("dry-run: would scrape but not executing.");
    return 0;
  }

  // Real execution requires discovery → confirmation → pipeline. For v1.0,
  // this is the human-gated path; auto-execution would need additional
  // confirmation handling beyond the scope of this CLI.
  console.log("");
  console.log("Note: full scrape-batch execution is gated by human confirmation.");
  console.log("Re-run with --dry-run to confirm plan, then invoke the");
  console.log("`devflow:scrape-stack-batch` skill (via /skills) for interactive flow.");
  return 0;
}

// ─── Main ──────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const opts = { args: [] };
  for (const arg of argv) {
    if (arg === "--dry-run") opts.dryRun = true;
    else if (arg === "--from-package") opts.fromPackage = true;
    else if (arg === "--from-manifest") opts.fromManifest = true;
    else if (arg === "--strict") opts.strict = true;
    else if (arg.startsWith("--source=")) opts.source = arg.slice(9);
    else if (arg.startsWith("--from=")) opts.from = arg.slice(7);
    else if (arg.startsWith("--mode=")) opts.mode = arg.slice(7);
    else if (arg.startsWith("--project=")) opts.project = arg.slice(10);
    else if (!arg.startsWith("--")) opts.args.push(arg);
  }
  return opts;
}

async function main() {
  const [sub, ...rest] = process.argv.slice(2);
  const opts = parseArgs(rest);
  const projectRoot = opts.project ? resolve(opts.project) : process.cwd();

  if (!sub) {
    console.error("Usage: devflow stacks <scrape-batch|scrape|validate|audit> [args]");
    process.exit(2);
  }

  switch (sub) {
    case "validate": {
      const code = await cmdValidate(opts.args[0], opts.strict, projectRoot);
      process.exit(code);
    }
    case "scrape": {
      const [library, version] = opts.args;
      const code = await cmdScrape(library, version, opts, projectRoot);
      process.exit(code);
    }
    case "scrape-batch": {
      const code = await cmdScrapeBatch(opts, projectRoot);
      process.exit(code);
    }
    case "audit": {
      const [arg] = opts.args;
      const code = await cmdAudit(arg, projectRoot);
      process.exit(code);
    }
    case "discover-source": {
      const [lib] = opts.args;
      const code = await cmdDiscoverSource(lib, projectRoot);
      process.exit(code);
    }
    default:
      console.error(`Unknown subcommand: ${sub}`);
      console.error("Usage: devflow stacks <scrape-batch|scrape|validate|audit|discover-source> [args]");
      console.error("  audit <lib>@<version>          Deep audit of refs/<lib>@<version>.md (5 checks)");
      console.error("  discover-source <lib>          List candidate URLs to scrape (curated + heuristic)");
      process.exit(2);
  }
}

async function cmdDiscoverSource(lib, projectRoot) {
  if (!lib) {
    console.error("Usage: devflow stacks discover-source <lib> [--project=<path>]");
    return 2;
  }
  const m = loadManifest(projectRoot);
  const fw = m.frameworks?.[lib];
  if (!fw) {
    console.error(`Error: '${lib}' not found in manifest.yaml`);
    console.error(`Hint: run \`node scripts/adr-extract-stacks.mjs <adr> --add-to-manifest --project=${projectRoot}\` first.`);
    return 1;
  }

  const version = fw.version;
  console.log(`Source candidates for ${lib}@${version}:`);
  console.log("");

  const curated = Array.isArray(fw.discoveryHints) ? fw.discoveryHints : [];
  if (curated.length > 0) {
    console.log("Curated (from ADR ## Evidências — official sources, human-vetted):");
    curated.forEach((url, i) => console.log(`  ${i + 1}. ${url}`));
    console.log("");
  } else {
    console.log("(no curated hints in manifest — re-run adr-extract-stacks --add-to-manifest");
    console.log(" to hydrate from ADR ## Evidências URLs)");
    console.log("");
  }

  // Heuristic fallbacks (deterministic — no network call required).
  // Order: registry README mirror (npmjs.com works well with md2llm),
  // then registry homepage / project pages.
  console.log("Heuristic candidates (try if curated URLs scrape poorly):");
  console.log(`  - https://www.npmjs.com/package/${lib}    (npm — README mirror, scrape-friendly)`);
  console.log(`  - https://pypi.org/project/${lib}/         (PyPI — if Python lib)`);
  console.log(`  - https://crates.io/crates/${lib}          (crates.io — if Rust lib)`);
  console.log("");
  console.log("Run scrape with chosen URL:");
  console.log(`  node scripts/devflow-stacks.mjs scrape ${lib} ${version} --source=<type> --from=<URL> --project=${projectRoot}`);
  console.log("");
  console.log("Note: SPA-rendered docs (typescriptlang.org/docs, react.dev) often");
  console.log("scrape poorly because md2llm needs static markdown/HTML. Prefer");
  console.log("registry pages (npmjs.com) or raw GitHub README URLs.");
  return 0;
}

async function cmdAudit(arg, projectRoot) {
  const { auditStack } = await import("./lib/stack-audit.mjs");
  if (!arg || !arg.includes("@")) {
    console.error("Usage: devflow stacks audit <lib>@<version>");
    return 2;
  }
  const [lib, version] = arg.split("@");
  const r = auditStack(lib, version, projectRoot);
  console.log(`=== Audit: ${lib}@${version} ===`);
  console.log(`Resumo: ${r.summary.pass} PASS · ${r.summary.fail} FAIL · ${r.summary.warn} WARN\n`);
  for (const c of r.checks) {
    const icon = c.status === "PASS" ? "✅" : c.status === "WARN" ? "⚠️ " : "❌";
    console.log(`  ${icon} ${c.id} ${c.name.padEnd(34)} ${c.status.padEnd(4)} ${c.diagnosis}`);
  }
  console.log(`\nGate: ${r.gate}`);
  return r.gate === "PASSED" ? 0 : 1;
}

main().catch(err => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
