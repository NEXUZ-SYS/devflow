// scripts/lib/manifest-stacks.mjs — load + validate .context/stacks/manifest.yaml.
//
// Pure node:* — uses scripts/lib/{frontmatter,glob}.mjs (frontmatter parses
// the YAML body since it's plain top-level YAML; glob validates applyTo
// patterns against SI-5 subset).

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";
import { parseFrontmatter } from "./frontmatter.mjs";
import { validateSubset } from "./glob.mjs";

const STACKS_DIR = ".context/stacks";
const MANIFEST_FILE = "manifest.yaml";

// IMPORTANT: do NOT export a shared frozen EMPTY constant. Object.freeze is
// shallow — `EMPTY.frameworks` (the inner `{}`) is mutable, and shallow spread
// `{...EMPTY}` shares that reference across calls. Callers that mutate the
// returned manifest (addFrameworksToManifest) would corrupt all subsequent
// loadManifest() calls. Use a fresh-empty factory instead.
function freshEmpty() {
  return {
    spec: "devflow-stack/v0",
    runtime: {},
    frameworks: {},
  };
}

// Manifest is YAML (no frontmatter delimiters). parseFrontmatter expects
// `---\n...\n---\n<body>` shape. Wrap the manifest content as a frontmatter
// block to reuse the parser.
function parseYamlAsManifest(yamlContent) {
  const wrapped = `---\n${yamlContent}\n---\n`;
  const { data } = parseFrontmatter(wrapped);
  return data || {};
}

export function loadManifest(projectRoot) {
  const path = join(projectRoot, STACKS_DIR, MANIFEST_FILE);
  if (!existsSync(path)) return freshEmpty();
  let parsed;
  try {
    parsed = parseYamlAsManifest(readFileSync(path, "utf-8"));
  } catch (err) {
    console.error(`[manifest-stacks] parse error: ${err.message}`);
    return freshEmpty();
  }
  return {
    spec: parsed.spec || "devflow-stack/v0",
    runtime: parsed.runtime || {},
    frameworks: parsed.frameworks || {},
  };
}

export function validateManifest(manifest) {
  const errors = [];

  if (!manifest || typeof manifest !== "object") {
    return ["manifest is not an object"];
  }
  if (manifest.spec !== "devflow-stack/v0") {
    errors.push(`spec must be 'devflow-stack/v0', got '${manifest.spec}'`);
  }

  const fws = manifest.frameworks || {};
  if (typeof fws !== "object") {
    return [...errors, "frameworks must be a map"];
  }

  for (const [name, fw] of Object.entries(fws)) {
    if (!fw || typeof fw !== "object") {
      errors.push(`framework ${name}: not an object`);
      continue;
    }
    if (!fw.version) {
      errors.push(`framework ${name}: version is required`);
    }
    // SECURITY (Semana 2 audit HIGH): reject path traversal in artisanalRef
    // (would otherwise let a malicious manifest read arbitrary local files).
    if (fw.artisanalRef) {
      const ref = fw.artisanalRef;
      if (typeof ref !== "string"
          || ref.includes("..")
          || ref.startsWith("/")
          || ref.startsWith("\\")
          || !ref.startsWith("refs/")
          || !/^refs\/[A-Za-z0-9._@/+-]+\.md$/.test(ref)) {
        errors.push(
          `framework ${name}: artisanalRef '${ref}' rejected — must match 'refs/<lib>@<version>.md' (no traversal, no abs paths)`
        );
      }
    }
    // Either skipDocs:true OR artisanalRef must be present
    if (!fw.skipDocs && !fw.artisanalRef) {
      errors.push(
        `framework ${name}: either artisanalRef must be set or skipDocs:true must be declared`
      );
    }
    // Validate applyTo against SI-5 subset
    const applyTo = Array.isArray(fw.applyTo) ? fw.applyTo : [];
    for (const pattern of applyTo) {
      try {
        validateSubset(pattern);
      } catch (err) {
        errors.push(`framework ${name}: applyTo '${pattern}' rejected — ${err.message}`);
      }
    }
  }

  return errors;
}

export function hashRef(projectRoot, refRelative) {
  const path = join(projectRoot, STACKS_DIR, refRelative);
  if (!existsSync(path)) return null;
  const content = readFileSync(path);
  return createHash("sha256").update(content).digest("hex");
}

// ─── Manifest mutation ─────────────────────────────────────────────────────

/**
 * Idempotent merge of detected stack mentions into manifest.yaml.
 *
 * @param {string} projectRoot
 * @param {Array<{lib: string, version: string, applyTo?: string[]}>} entries
 * @returns {{added: string[], skipped: string[], drift: Array<{lib, existingVersion, newVersion}>}}
 *
 * Behavior:
 *   - lib NOT present in manifest → added with `artisanalRef: refs/<lib>@<ver>.md`
 *   - lib present with SAME version → skipped (no-op)
 *   - lib present with DIFFERENT version → drift reported, NOT overwritten
 *
 * Pure node:* — uses minimal YAML serializer (manifest is a known shape;
 * not preserving arbitrary external comments by design).
 */
export function addFrameworksToManifest(projectRoot, entries) {
  const manifest = loadManifest(projectRoot);
  const result = { added: [], skipped: [], drift: [] };

  for (const entry of entries) {
    const { lib, version } = entry;
    if (!lib || !version) continue;
    const existing = manifest.frameworks[lib];
    if (existing) {
      if (existing.version === version) {
        result.skipped.push(`${lib}@${version}`);
      } else {
        result.drift.push({
          lib,
          existingVersion: existing.version,
          newVersion: version,
        });
      }
      continue;
    }
    manifest.frameworks[lib] = {
      version,
      artisanalRef: `refs/${lib}@${version}.md`,
    };
    if (Array.isArray(entry.applyTo) && entry.applyTo.length > 0) {
      manifest.frameworks[lib].applyTo = entry.applyTo;
    }
    if (Array.isArray(entry.discoveryHints) && entry.discoveryHints.length > 0) {
      // Curated official URLs (typically from ADR ## Evidências section).
      // Used by `devflow stacks discover-source <lib>` to surface scrape
      // candidates without requiring network/registry calls.
      manifest.frameworks[lib].discoveryHints = entry.discoveryHints;
    }
    result.added.push(`${lib}@${version}`);
  }

  if (result.added.length > 0) {
    writeManifest(projectRoot, manifest);
  }
  return result;
}

/**
 * Serialize manifest to YAML. Intentionally minimal — manifest is a known
 * shape (spec + frameworks map); we don't preserve external comments.
 */
function serializeManifest(manifest) {
  const lines = [`spec: ${manifest.spec || "devflow-stack/v0"}`];
  if (manifest.runtime && Object.keys(manifest.runtime).length > 0) {
    lines.push("runtime:");
    for (const [k, v] of Object.entries(manifest.runtime)) {
      lines.push(`  ${k}: ${typeof v === "string" ? `"${v}"` : v}`);
    }
  }
  const fws = manifest.frameworks || {};
  lines.push("frameworks:");
  if (Object.keys(fws).length === 0) {
    lines[lines.length - 1] = "frameworks: {}";
  } else {
    for (const [name, fw] of Object.entries(fws)) {
      lines.push(`  ${name}:`);
      for (const [k, v] of Object.entries(fw)) {
        if (Array.isArray(v)) {
          lines.push(`    ${k}: [${v.map(x => `"${x}"`).join(", ")}]`);
        } else if (typeof v === "string") {
          lines.push(`    ${k}: "${v}"`);
        } else {
          lines.push(`    ${k}: ${v}`);
        }
      }
    }
  }
  return lines.join("\n") + "\n";
}

function writeManifest(projectRoot, manifest) {
  const path = join(projectRoot, STACKS_DIR, MANIFEST_FILE);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, serializeManifest(manifest));
}

export function findMissingRefs(projectRoot) {
  const m = loadManifest(projectRoot);
  const missing = [];
  for (const [name, fw] of Object.entries(m.frameworks || {})) {
    if (fw.skipDocs) continue;
    if (!fw.artisanalRef) continue;
    const refPath = join(projectRoot, STACKS_DIR, fw.artisanalRef);
    if (!existsSync(refPath)) {
      missing.push({ framework: name, version: fw.version, expected: fw.artisanalRef });
    }
  }
  return missing;
}
