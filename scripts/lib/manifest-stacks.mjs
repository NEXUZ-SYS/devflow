// scripts/lib/manifest-stacks.mjs — load + validate .context/stacks/manifest.yaml.
//
// Pure node:* — uses scripts/lib/{frontmatter,glob}.mjs (frontmatter parses
// the YAML body since it's plain top-level YAML; glob validates applyTo
// patterns against SI-5 subset).

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { parseFrontmatter } from "./frontmatter.mjs";
import { validateSubset } from "./glob.mjs";

const STACKS_DIR = ".context/stacks";
const MANIFEST_FILE = "manifest.yaml";

const EMPTY = Object.freeze({
  spec: "devflow-stack/v0",
  runtime: {},
  frameworks: {},
});

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
  if (!existsSync(path)) return { ...EMPTY };
  let parsed;
  try {
    parsed = parseYamlAsManifest(readFileSync(path, "utf-8"));
  } catch (err) {
    console.error(`[manifest-stacks] parse error: ${err.message}`);
    return { ...EMPTY };
  }
  return {
    spec: parsed.spec || EMPTY.spec,
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
