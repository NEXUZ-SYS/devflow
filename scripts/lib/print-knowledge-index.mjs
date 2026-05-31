#!/usr/bin/env node
// scripts/lib/print-knowledge-index.mjs
// CLI helper: prints a <KNOWLEDGE_INDEX> block listing all knowledge-layer docs.
// Usage: node print-knowledge-index.mjs [projectRoot]
// SI-1: invoked as a standalone file with projectRoot as an argument — never via `node -e`.
import { loadKnowledgeIndex } from "./knowledge-loader.mjs";

const projectRoot = process.argv[2] || process.cwd();

let index;
try {
  index = loadKnowledgeIndex(projectRoot);
} catch {
  // Loader failed (missing deps, malformed files, etc.) — exit silently.
  process.exit(0);
}

if (!index || index.length === 0) {
  process.exit(0);
}

const lines = index.map(
  (doc) => `[${doc.layer}] ${doc.name} — ${doc.description} (${doc.activation})`
);

process.stdout.write("<KNOWLEDGE_INDEX>\n" + lines.join("\n") + "\n</KNOWLEDGE_INDEX>\n");
