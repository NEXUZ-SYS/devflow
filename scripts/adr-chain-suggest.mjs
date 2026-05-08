#!/usr/bin/env node
// scripts/adr-chain-suggest.mjs — emits chain-action suggestions for an ADR.
//
// Used by skills/adr-builder/SKILL.md Step 5d (post-CREATE chain offer).
// Outputs JSON with standards-link/create candidates and stack-link/refresh/scrape
// candidates so the LLM can present grouped options to the user without
// re-implementing the matching logic in prose.
//
// Usage: node scripts/adr-chain-suggest.mjs <adr-file> [--format=json|text]

import { readFile } from "node:fs/promises";
import { resolve, dirname, basename } from "node:path";
import { existsSync } from "node:fs";
import { parse } from "./lib/adr-frontmatter.mjs";
import { resolveAdrPath } from "./lib/path-resolver.mjs";
import {
  findRelatedStandards,
  extractStackMentions,
  findStackMatches,
  adrHasGuardrails,
} from "./lib/adr-chain.mjs";

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith("--"));
const format = args.find(a => a.startsWith("--format="))?.slice(9) || "json";

if (!file) {
  console.error("Usage: adr-chain-suggest.mjs <adr-file> [--format=json|text]");
  process.exit(2);
}

function findProjectRoot(filePath) {
  let dir = dirname(resolve(filePath));
  for (let i = 0; i < 10 && dir !== "/" && dir !== "."; i++) {
    if (existsSync(`${dir}/.context`)) return dir;
    dir = dirname(dir);
  }
  return process.cwd();
}

try {
  const content = await readFile(file, "utf-8");
  const { frontmatter, body } = parse(content);

  // Build ADR object expected by adr-chain helpers
  const adr = {
    name: frontmatter.name,
    description: frontmatter.description,
    category: frontmatter.category,
    stack: frontmatter.stack,
    body,
    guardrailsText: extractGuardrailsSection(body),
  };

  const projectRoot = findProjectRoot(file);
  const standards = findRelatedStandards(adr, projectRoot);
  // Pass projectRoot to enable Tier-2 prose extraction (manifest-gated).
  const mentions = extractStackMentions(adr, { projectRoot });
  const stacks = findStackMatches(mentions, projectRoot);

  const suggestions = {
    adrSlug: adr.name,
    adrFile: basename(file),
    standards,
    stacks,
    hasGuardrails: adrHasGuardrails(body),
  };

  if (format === "text") {
    printText(suggestions);
  } else {
    console.log(JSON.stringify(suggestions, null, 2));
  }
  process.exit(0);
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}

function extractGuardrailsSection(body) {
  if (typeof body !== "string") return "";
  const lines = body.split("\n");
  const start = lines.findIndex(l => /^##\s+Guardrails\b/.test(l));
  if (start === -1) return "";
  let end = lines.findIndex((l, i) => i > start && /^##\s/.test(l));
  if (end === -1) end = lines.length;
  return lines.slice(start + 1, end).join("\n");
}

function printText(s) {
  console.log(`Chain suggestions for ${s.adrFile}:\n`);

  console.log("STANDARDS:");
  if (s.standards.matches.length > 0) {
    console.log("  Existing standards relevantes (link via relatedAdrs):");
    for (const m of s.standards.matches) {
      console.log(`    - ${m.id} (score=${m.score}, applyTo=${JSON.stringify(m.applyTo)})`);
    }
  }
  if (s.standards.wouldCreate) {
    console.log(`  Sugestão para criar novo: ${s.standards.wouldCreate}`);
  }
  if (s.standards.matches.length === 0 && !s.standards.wouldCreate) {
    console.log("  (sem sugestões)");
  }

  console.log("\nSTACKS:");
  if (s.stacks.length === 0) {
    console.log("  (sem libs <lib>@<version> mencionadas em ADR de arquitetura)");
  } else {
    for (const st of s.stacks) {
      switch (st.status) {
        case "linked":
          console.log(`  - ${st.lib}@${st.version}: linked (existing ref ${st.existingRef})`);
          break;
        case "drift":
          console.log(`  - ${st.lib}@${st.version}: drift (manifest currently at ${st.currentVersion})`);
          break;
        case "new":
          console.log(`  - ${st.lib}@${st.version}: new (would scrape)`);
          break;
        case "skipped":
          console.log(`  - ${st.lib}@${st.version}: skipped (${st.reason})`);
          break;
      }
    }
  }
}
