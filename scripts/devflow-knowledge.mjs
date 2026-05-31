#!/usr/bin/env node
// scripts/devflow-knowledge.mjs
// CLI dispatcher: `devflow-knowledge new|audit` — dependency-free (node:* only).

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { scaffoldKnowledge } from "./lib/knowledge-from-type.mjs";
import { auditKnowledge } from "./lib/knowledge-audit.mjs";
import { contextPaths } from "./lib/context-paths.mjs";
import { parseFrontmatter } from "./lib/frontmatter.mjs";

// ── Taxonomy loader (minimal — knowledge YAML has no block scalars) ──────────

const __dir = dirname(fileURLToPath(import.meta.url));
const TAXONOMY_PATH = join(
  __dir,
  "..",
  "skills",
  "knowledge",
  "references",
  "taxonomy-of-knowledge.yaml",
);

function loadKnowledgeTaxonomy() {
  const raw = readFileSync(TAXONOMY_PATH, "utf-8");
  // Synthesize a frontmatter document so parseFrontmatter can parse the YAML.
  const { data } = parseFrontmatter(`---\n${raw}\n---\n`);
  const entries = Array.isArray(data?.entries) ? data.entries : [];
  if (entries.length === 0) {
    throw new Error("taxonomy-of-knowledge.yaml parsed to empty entries list");
  }
  return entries;
}

// ── Input validation guards ──────────────────────────────────────────────────

/**
 * Reject path components that could escape the target directory.
 * - No forward slashes, backslashes, or ".." segments.
 * - No newline/carriage-return characters (prevents YAML frontmatter injection).
 */
function validateName(name) {
  if (typeof name !== "string" || name.length === 0) {
    process.stderr.write("Error: --name must be a non-empty string\n");
    process.exit(1);
  }
  if (/[/\\]/.test(name) || name.split(/[/\\]/).some((seg) => seg === "..")) {
    process.stderr.write(
      `Error: invalid --name '${name}' — path traversal characters (/, \\, ..) are not allowed\n`,
    );
    process.exit(1);
  }
  if (/[\n\r]/.test(name)) {
    process.stderr.write(
      `Error: invalid --name '${name}' — newline characters are not allowed (YAML injection prevention)\n`,
    );
    process.exit(1);
  }
}

/**
 * Validate the final resolved path stays within the expected parent directory.
 * Secondary containment: catches edge cases that validateName might miss on unusual OSes.
 */
function assertWithinDir(filePath, parentDir) {
  const rel = resolve(filePath);
  const par = resolve(parentDir);
  if (!rel.startsWith(par + "/") && rel !== par) {
    process.stderr.write(
      `Error: path traversal detected — resolved path escapes the layer directory\n` +
        `  resolved: ${rel}\n  layer dir: ${par}\n`,
    );
    process.exit(1);
  }
}

/**
 * Reject description values containing newlines (YAML frontmatter injection).
 */
function validateDescription(desc) {
  if (desc !== undefined && /[\n\r]/.test(desc)) {
    process.stderr.write(
      `Error: invalid --description — newline characters are not allowed (YAML injection prevention)\n`,
    );
    process.exit(1);
  }
}

// ── argv parsing ─────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = argv.slice(2);
  const subcommand = args[0];
  const flags = {};
  for (const a of args.slice(1)) {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    if (m) flags[m[1]] = m[2] ?? true;
  }
  return { subcommand, flags };
}

// ── Subcommands ──────────────────────────────────────────────────────────────

function cmdNew({ flags }) {
  const type = flags.type;
  const name = flags.name;
  const project = flags.project ?? process.cwd();
  const version = flags.version ?? "1.0.0";
  const description = flags.description;
  const force = Boolean(flags.force);

  if (!type) { process.stderr.write("Error: --type is required\n"); process.exit(1); }
  if (!name) { process.stderr.write("Error: --name is required\n"); process.exit(1); }

  // Security: reject path traversal and newline injection attempts
  validateName(name);
  validateDescription(description);

  const entries = loadKnowledgeTaxonomy();
  const entry = entries.find((e) => e.id === type);
  if (!entry) {
    const valid = entries.map((e) => e.id).join(", ");
    process.stderr.write(`Error: unknown type '${type}'. Valid ids:\n  ${valid}\n`);
    process.exit(1);
  }

  const paths = contextPaths(project);
  const layerDir = paths[entry.layer];
  if (!layerDir) {
    process.stderr.write(`Error: unknown layer '${entry.layer}' in taxonomy entry\n`);
    process.exit(1);
  }

  const destFile = join(layerDir, `${name}.md`);
  // Secondary containment: verify resolved path stays within layer dir
  assertWithinDir(destFile, layerDir);
  if (existsSync(destFile) && !force) {
    process.stderr.write(`Error: file already exists: ${destFile}\n  Use --force to overwrite.\n`);
    process.exit(1);
  }

  mkdirSync(layerDir, { recursive: true });

  const content = scaffoldKnowledge(entry, { name, version, description });
  writeFileSync(destFile, content, "utf-8");
  process.stdout.write(`${destFile}\n`);
}

function cmdAudit({ flags }) {
  const name = flags.name;
  const project = flags.project ?? process.cwd();

  if (!name) { process.stderr.write("Error: --name is required\n"); process.exit(1); }

  // Security: reject path traversal in audit --name
  validateName(name);

  const paths = contextPaths(project);
  const layerKeys = ["business", "product", "operations", "engineering"];

  let found = null;
  for (const key of layerKeys) {
    const candidate = join(paths[key], `${name}.md`);
    if (existsSync(candidate)) {
      // Verify it's a knowledge doc by checking frontmatter type
      try {
        const src = readFileSync(candidate, "utf-8");
        const { data } = parseFrontmatter(src);
        if (data?.type === "knowledge") {
          found = candidate;
          break;
        }
      } catch {
        // not a valid frontmatter doc — skip
      }
    }
  }

  if (!found) {
    process.stderr.write(`Error: no knowledge doc named '${name}.md' found in layer dirs\n`);
    process.exit(1);
  }

  const src = readFileSync(found, "utf-8");
  const { ok, failures } = auditKnowledge(src);

  if (!ok) {
    process.stdout.write(failures.join("\n") + "\n");
    process.exit(1);
  } else {
    const docName = flags.name;
    process.stdout.write(`OK: ${docName} passa K1-K5\n`);
    process.exit(0);
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────

const { subcommand, flags } = parseArgs(process.argv);

if (subcommand === "new") {
  cmdNew({ flags });
} else if (subcommand === "audit") {
  cmdAudit({ flags });
} else {
  process.stderr.write(
    `Usage: devflow-knowledge <new|audit> [flags]\n\n` +
      `  new   --type=<id> --name=<name> [--project=<dir>] [--version=<v>] [--description=<d>] [--force]\n` +
      `  audit --name=<name> [--project=<dir>]\n`,
  );
  process.exit(1);
}
