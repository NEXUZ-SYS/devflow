/**
 * detect-framework — data-driven framework detection for DevFlow.
 *
 * Reads framework profiles from <pluginRoot>/profiles/*.yaml and decides which
 * ones apply to a given project, by inspecting the project tree and manifests.
 * No external dependency: profiles are parsed with the homegrown parseYaml.
 *
 * A project matches a profile when EITHER:
 *   - any detect.files entry is present in the project tree (up to MAX_DEPTH), OR
 *   - any detect.manifestDeps[].deps substring appears in the named manifest file.
 *
 * Library API:
 *   loadProfiles(pluginRoot)            -> Profile[]
 *   detectFrameworks(projectRoot, pluginRoot?) -> Profile[]  (active profiles)
 *
 * CLI:
 *   node scripts/lib/detect-framework.mjs <projectRoot> [pluginRoot]
 *   -> prints JSON: { frameworks: [...], agents: [...], skills: [...] }
 */

import { readdirSync, existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseYaml } from "./frontmatter.mjs";

const MAX_DEPTH = 3;
const SKIP_DIRS = new Set([
  "node_modules", ".git", ".context", "dist", "build", "__pycache__",
  ".venv", "venv", ".history", "coverage",
]);

/** Default plugin root = two levels up from this file (scripts/lib -> repo). */
function defaultPluginRoot() {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
}

/** Load and normalize every profile under <pluginRoot>/profiles/. */
export function loadProfiles(pluginRoot = defaultPluginRoot()) {
  const dir = join(pluginRoot, "profiles");
  if (!existsSync(dir)) return [];
  const profiles = [];
  for (const file of readdirSync(dir)) {
    if (!/\.ya?ml$/.test(file)) continue;
    let data;
    try {
      data = parseYaml(readFileSync(join(dir, file), "utf-8"));
    } catch (err) {
      console.error(`[detect-framework] parse error in ${file}: ${err.message}`);
      continue;
    }
    if (!data || !data.framework) continue;
    profiles.push({
      framework: data.framework,
      displayName: data.displayName || data.framework,
      detect: data.detect || {},
      agents: Array.isArray(data.agents) ? data.agents : [],
      skills: Array.isArray(data.skills) ? data.skills : [],
      standards: Array.isArray(data.standards) ? data.standards : [],
      stacks: Array.isArray(data.stacks) ? data.stacks : [],
      dispatchKeywords: data.dispatchKeywords || {},
      _file: file,
    });
  }
  return profiles;
}

/** True if any of `names` appears as a file anywhere in the tree (bounded depth). */
function treeHasFile(root, names, depth = 0) {
  if (depth > MAX_DEPTH) return false;
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return false;
  }
  for (const e of entries) {
    if (e.isFile() && names.includes(e.name)) return true;
  }
  for (const e of entries) {
    if (e.isDirectory() && !SKIP_DIRS.has(e.name) && !e.name.startsWith(".")) {
      if (treeHasFile(join(root, e.name), names, depth + 1)) return true;
    }
  }
  return false;
}

/** True if any dep substring appears in the given manifest file at projectRoot. */
function manifestHasDep(projectRoot, manifestFile, deps) {
  const p = join(projectRoot, manifestFile);
  if (!existsSync(p)) return false;
  let content;
  try {
    content = readFileSync(p, "utf-8").toLowerCase();
  } catch {
    return false;
  }
  return deps.some((d) => content.includes(String(d).toLowerCase()));
}

/** Evaluate a single profile's detect rules against the project. */
function profileMatches(projectRoot, profile) {
  const det = profile.detect || {};
  const files = Array.isArray(det.files) ? det.files : [];
  if (files.length && treeHasFile(projectRoot, files)) return true;

  const manifestDeps = Array.isArray(det.manifestDeps) ? det.manifestDeps : [];
  for (const entry of manifestDeps) {
    if (!entry || !entry.file) continue;
    const deps = Array.isArray(entry.deps) ? entry.deps : [];
    if (deps.length && manifestHasDep(projectRoot, entry.file, deps)) return true;
  }
  return false;
}

/** Return the list of profiles that apply to the project. */
export function detectFrameworks(projectRoot, pluginRoot = defaultPluginRoot()) {
  const profiles = loadProfiles(pluginRoot);
  return profiles.filter((p) => profileMatches(projectRoot, p));
}

/** Aggregate the agents/skills/keywords contributed by all active profiles. */
export function frameworkContributions(projectRoot, pluginRoot = defaultPluginRoot()) {
  const active = detectFrameworks(projectRoot, pluginRoot);
  const agents = new Set();
  const skills = new Set();
  const standards = new Set();
  const stacksByLib = new Map();
  const dispatchKeywords = {};
  for (const p of active) {
    p.agents.forEach((a) => agents.add(a));
    p.skills.forEach((s) => skills.add(s));
    (p.standards || []).forEach((s) => standards.add(s));
    for (const stack of p.stacks || []) {
      // dedupe by lib key; first profile wins (profiles are framework-scoped).
      if (stack && stack.lib && !stacksByLib.has(stack.lib)) {
        stacksByLib.set(stack.lib, stack);
      }
    }
    for (const [agent, kws] of Object.entries(p.dispatchKeywords || {})) {
      dispatchKeywords[agent] = [...(dispatchKeywords[agent] || []), ...(kws || [])];
    }
  }
  return {
    frameworks: active.map((p) => p.framework),
    agents: [...agents],
    skills: [...skills],
    standards: [...standards],
    stacks: [...stacksByLib.values()],
    dispatchKeywords,
  };
}

// CLI entrypoint
if (import.meta.url === `file://${process.argv[1]}`) {
  const projectRoot = resolve(process.argv[2] || process.cwd());
  const pluginRoot = process.argv[3] ? resolve(process.argv[3]) : defaultPluginRoot();
  if (!existsSync(projectRoot) || !statSync(projectRoot).isDirectory()) {
    console.error(`[detect-framework] not a directory: ${projectRoot}`);
    process.exit(1);
  }
  console.log(JSON.stringify(frameworkContributions(projectRoot, pluginRoot), null, 2));
}
