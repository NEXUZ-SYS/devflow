#!/usr/bin/env node
// scripts/lib/print-knowledge-bodies.mjs
// Stage-2 knowledge injector for the pre-tool-use hook.
//
// Usage: node print-knowledge-bodies.mjs <projectRoot> <editedFilePath>
//
// Loads on-demand knowledge docs from the project's .context/ layers,
// applies a relevance heuristic against the edited file path, caps at 3 docs,
// and prints a <KNOWLEDGE_ONDEMAND> block to stdout.
// Prints nothing and exits 0 when no relevant docs are found.
//
// SI-1 compliant: invoked with arguments, no shell-interpolated `node -e`.

import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { loadKnowledgeIndex } from "./knowledge-loader.mjs";
import { parseFrontmatter } from "./frontmatter.mjs";

const [, , projectRoot, editedFilePath] = process.argv;

if (!projectRoot || !editedFilePath) {
  process.exit(0);
}

// --- Relevance heuristic ---
// An on-demand knowledge doc is relevant when ANY of:
//   1. The edited path contains the doc's `layer` or `name` token.
//   2. The doc is an engineering-layer doc whose name starts with
//      "engineering-architecture-overview" or "engineering-methodology" (or
//      simply layer=engineering AND name contains "architecture" or "methodology")
//      AND the edited file is source code (src/** or common source extensions).

const SOURCE_EXTS = /\.(ts|tsx|js|mjs|py|go)$/i;
const isSourceFile = SOURCE_EXTS.test(editedFilePath) || /[\\/]src[\\/]/.test(editedFilePath);

function isRelevant(entry) {
  const editedNorm = editedFilePath.replace(/\\/g, "/").toLowerCase();
  const layer = (entry.layer ?? "").toLowerCase();
  const name = (entry.name ?? "").toLowerCase();

  // Rule 1: edited path contains the doc's layer or name token
  if (layer && editedNorm.includes(layer)) return true;
  if (name && editedNorm.includes(name)) return true;

  // Rule 2: engineering docs about architecture/methodology when editing source
  if (
    entry.layer === "engineering" &&
    isSourceFile &&
    (name.includes("architecture") || name.includes("methodology"))
  ) {
    return true;
  }

  return false;
}

// --- Load index and filter ---

let index;
try {
  index = loadKnowledgeIndex(projectRoot);
} catch {
  process.exit(0);
}

const onDemand = index.filter((e) => e.activation === "on-demand");
const relevant = onDemand.filter(isRelevant).slice(0, 3);

if (relevant.length === 0) {
  process.exit(0);
}

// --- Read bodies and emit block ---

const parts = [];
for (const entry of relevant) {
  try {
    const raw = readFileSync(entry.file, "utf-8");
    const { body } = parseFrontmatter(raw);
    const trimmedBody = body.trim();
    if (trimmedBody) {
      parts.push(`### ${entry.name}\n${trimmedBody}`);
    }
  } catch {
    // skip unreadable doc
  }
}

if (parts.length === 0) {
  process.exit(0);
}

process.stdout.write(`<KNOWLEDGE_ONDEMAND>\n${parts.join("\n\n")}\n</KNOWLEDGE_ONDEMAND>\n`);
