// scripts/lib/standards-loader.mjs — load and filter standards from the
// canonical .context/engineering/standards/ path (DDC layout v2), with
// transparent fallback to the legacy .context/standards/ during transition.
//
// Used by:
//   - hooks/post-tool-use (Task 1.3) to find applicable standards for an Edit/Write event
//   - scripts/devflow-standards.mjs verify (Task 1.4) for static validation
//
// Pure node:* — uses scripts/lib/{glob,frontmatter,context-paths}.mjs primitives. No npm deps.

import { readdirSync, readFileSync, statSync, lstatSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseFrontmatter } from "./frontmatter.mjs";
import { matchGlob, validateSubset } from "./glob.mjs";
import { resolveReadPaths, contextPaths } from "./context-paths.mjs";

export function loadStandards(projectRoot) {
  // Use canonical path first; fall back to legacy locations still present on disk.
  const readPaths = resolveReadPaths(projectRoot, "standards");
  // Use the first path that actually exists on disk; default to canonical.
  const dir = readPaths.find(p => existsSync(p)) ?? readPaths[0];
  if (!existsSync(dir)) return [];

  const standards = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "README.md") continue;
    if (entry === "machine") continue;
    if (!entry.endsWith(".md")) continue;

    const filePath = join(dir, entry);
    const stat = statSync(filePath);
    if (!stat.isFile()) continue;

    let parsed;
    try {
      parsed = parseFrontmatter(readFileSync(filePath, "utf-8"));
    } catch (err) {
      // Malformed frontmatter — skip with stderr warning
      console.error(`[standards-loader] skipping ${entry}: ${err.message}`);
      continue;
    }
    const fm = parsed.data || {};

    // Required: id (silently drop if missing)
    if (!fm.id) continue;

    // Deprecated standards (superseded by a concern std via `new --migrate`)
    // are inert: never loaded, never linted, never counted by `verify`.
    if (fm.deprecated === true) continue;

    // applyTo must be an array of valid glob-subset patterns
    const applyTo = Array.isArray(fm.applyTo) ? fm.applyTo : [];
    let validApplyTo = true;
    for (const pattern of applyTo) {
      try {
        validateSubset(pattern);
      } catch (err) {
        console.error(`[standards-loader] ${fm.id}: invalid glob '${pattern}': ${err.message}`);
        validApplyTo = false;
        break;
      }
    }
    if (!validApplyTo) continue;

    // weak = no linter AND user did not opt-out via weakStandardWarning:true
    const hasLinter = !!(fm.enforcement && fm.enforcement.linter);
    const optedOut = fm.weakStandardWarning === true;
    const weak = !hasLinter && !optedOut;

    standards.push({
      id: fm.id,
      file: entry,
      filePath,
      description: fm.description || "",
      version: fm.version || "0.0.0",
      applyTo,
      relatedAdrs: fm.relatedAdrs || [],
      enforcement: fm.enforcement || {},
      weak,
      body: parsed.body || "",
    });
  }
  return standards;
}

export function findApplicableStandards(filePath, standards) {
  if (!Array.isArray(standards)) return [];
  return standards.filter(std => {
    if (!Array.isArray(std.applyTo) || std.applyTo.length === 0) return false;
    return std.applyTo.some(pattern => {
      try {
        return matchGlob(pattern, filePath);
      } catch {
        return false;
      }
    });
  });
}

// ---------------------------------------------------------------------------
// loadStandardsMerged — merges plugin-bundled defaults + project standards
// ---------------------------------------------------------------------------

/**
 * Parse a bare YAML standards.local.yaml (NO frontmatter fences) and return
 * the list of ids under the `disable:` key.
 *
 * Supports:
 *   disable: [a, b]          (inline array)
 *   disable:                 (block form)
 *     - a
 *     - b
 */
function parseDisableList(content) {
  // Inline form: disable: [a, b, ...]
  const inlineMatch = content.match(/^disable\s*:\s*\[([^\]]*)\]/m);
  if (inlineMatch) {
    const inner = inlineMatch[1].trim();
    if (!inner) return [];
    return inner.split(",").map(s => s.trim()).filter(Boolean);
  }

  // Block form: disable:\n  - a\n  - b
  const blockMatch = content.match(/^disable\s*:\s*\n((?:[ \t]*-[ \t]+[^\n]+\n?)*)/m);
  if (blockMatch) {
    return blockMatch[1]
      .split("\n")
      .map(line => line.match(/^\s*-\s+(.+)$/))
      .filter(Boolean)
      .map(m => m[1].trim())
      .filter(Boolean);
  }

  return [];
}

/**
 * Read *.md files from a directory, tagging each with the given origin.
 * Applies R7 symlink containment: symlinks are skipped (lstatSync check).
 * Silently drops files without a valid `id` in frontmatter.
 */
function readStandardsFromDir(dir, origin) {
  if (!existsSync(dir)) return [];
  const standards = [];

  for (const entry of readdirSync(dir)) {
    if (!entry.endsWith(".md")) continue;
    if (entry === "README.md") continue;
    if (entry === "machine") continue;

    const filePath = join(dir, entry);

    // R7 — symlink guard: use lstatSync and skip symlinks
    let lst;
    try {
      lst = lstatSync(filePath);
    } catch {
      continue;
    }
    if (lst.isSymbolicLink()) continue;
    if (!lst.isFile()) continue;

    let parsed;
    try {
      parsed = parseFrontmatter(readFileSync(filePath, "utf-8"));
    } catch (err) {
      console.error(`[standards-loader] skipping ${entry}: ${err.message}`);
      continue;
    }
    const fm = parsed.data || {};
    if (!fm.id) continue;
    if (fm.deprecated === true) continue;

    // R11 — validate applyTo globs (SI-5 subset) just like loadStandards, so the
    // merged loader and the linter runner can't be fed an invalid/unsafe glob.
    const applyTo = Array.isArray(fm.applyTo) ? fm.applyTo : [];
    let validApplyTo = true;
    for (const pattern of applyTo) {
      try {
        validateSubset(pattern);
      } catch (err) {
        console.error(`[standards-loader] ${fm.id}: invalid glob '${pattern}': ${err.message}`);
        validApplyTo = false;
        break;
      }
    }
    if (!validApplyTo) continue;

    standards.push({
      id: fm.id,
      file: entry,
      filePath,
      description: fm.description || "",
      version: fm.version || "0.0.0",
      applyTo,
      relatedAdrs: fm.relatedAdrs || [],
      enforcement: fm.enforcement || {},
      body: parsed.body || "",
      origin,
    });
  }
  return standards;
}

/**
 * Merge plugin-bundled defaults with project standards.
 *
 * - Plugin defaults  → origin: "default"  (from <pluginRoot>/assets/standards/)
 * - Project stds     → origin: "project"  (from contextPaths(projectRoot).standards)
 * - Same id → project wins (drop default); one entry per id.
 * - Any id in <projectRoot>/.context/standards.local.yaml `disable:` list is removed.
 * - pluginRoot defaults to process.env.CLAUDE_PLUGIN_ROOT (R9 env fallback).
 */
export function loadStandardsMerged(
  projectRoot,
  pluginRoot = process.env.CLAUDE_PLUGIN_ROOT,
) {
  const pluginDefaultsDir = pluginRoot
    ? join(pluginRoot, "assets", "standards")
    : null;

  // Use resolveReadPaths to include the legacy .context/standards/ fallback
  // (same as loadStandards), so projects not yet migrated to DDC v2 are covered.
  const projectStandardsDirs = resolveReadPaths(projectRoot, "standards");

  const defaults = pluginDefaultsDir
    ? readStandardsFromDir(pluginDefaultsDir, "default")
    : [];

  // Read from all resolved paths (canonical first, then legacy).
  // De-duplicate by id: first occurrence wins (canonical takes precedence).
  const projectStdsById = new Map();
  for (const dir of projectStandardsDirs) {
    for (const std of readStandardsFromDir(dir, "project")) {
      if (!projectStdsById.has(std.id)) {
        projectStdsById.set(std.id, std);
      }
    }
  }
  const projectStds = Array.from(projectStdsById.values());

  // Merge: project overrides default by id
  const merged = new Map();
  for (const std of defaults) {
    merged.set(std.id, std);
  }
  for (const std of projectStds) {
    // project always wins — override any default with same id
    merged.set(std.id, std);
  }

  // R1 — disable list from standards.local.yaml
  const localYamlPath = contextPaths(projectRoot).standardsLocalYaml;
  let disableSet = new Set();
  if (existsSync(localYamlPath)) {
    try {
      const content = readFileSync(localYamlPath, "utf-8");
      const ids = parseDisableList(content);
      disableSet = new Set(ids);
    } catch {
      // Malformed or unreadable — ignore, don't crash
    }
  }

  return Array.from(merged.values()).filter(std => !disableSet.has(std.id));
}
