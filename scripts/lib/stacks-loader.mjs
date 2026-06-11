// scripts/lib/stacks-loader.mjs — live-load dual-source dos stacks default.
//
// Espelha scripts/lib/standards-loader.mjs:loadStandardsMerged:
//   - defaults do plugin  → origin "default"  (<pluginRoot>/assets/stacks/)
//   - stacks do projeto   → origin "project"  (contextPaths(projectRoot).stacks + legacy)
//   - mesma lib (por nome) no projeto VENCE o default; uma entrada por nome
//   - libs em <projectRoot>/.context/stacks.local.yaml `disable:` são removidas
//   - pluginRoot default = process.env.CLAUDE_PLUGIN_ROOT (R9 env fallback)
//
// Per Dependency Policy: pure node:* — usa lib/{frontmatter,context-paths}.mjs.

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { parseFrontmatter } from "./frontmatter.mjs";
import { contextPaths, resolveReadPaths } from "./context-paths.mjs";

const CONCERNS = [
  "ai", "backend", "database", "frontend", "language",
  "runtime", "state", "testing", "validation",
];

/**
 * Parse a bare YAML stacks.local.yaml (NO frontmatter fences) and return the
 * list of lib names under the `disable:` key. Mirrors standards.local.yaml.
 *   disable: [a, b]          (inline array)
 *   disable:\n  - a\n  - b   (block form)
 */
export function parseStacksLocalDisable(content) {
  const inline = content.match(/^disable\s*:\s*\[([^\]]*)\]/m);
  if (inline) {
    return inline[1].split(",").map((s) => s.trim().replace(/['"]/g, "")).filter(Boolean);
  }
  const block = content.match(/^disable\s*:\s*\n((?:[ \t]*-[ \t]+[^\n]+\n?)*)/m);
  if (block) {
    return block[1]
      .split("\n")
      .map((l) => l.replace(/^[ \t]*-[ \t]+/, "").trim().replace(/['"]/g, ""))
      .filter(Boolean);
  }
  return [];
}

// Map lib → { concern, mdPath } scanning the concern dirs under a stacks root.
function scanMdByLib(stacksDir) {
  const mdByLib = {};
  for (const concern of CONCERNS) {
    const dir = join(stacksDir, concern);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".md")) continue;
      const lib = basename(f, ".md").replace(/@.*$/, ""); // next@16.md → next
      mdByLib[lib] = { concern, mdPath: join(dir, f) };
    }
  }
  return mdByLib;
}

// Read manifest.yaml from a stacks root and annotate each framework with
// origin + concern + mdPath (concern/md derived from the on-disk .md files).
function readStacksFromRoot(stacksDir, origin) {
  const manifestPath = join(stacksDir, "manifest.yaml");
  if (!existsSync(manifestPath)) return {};
  let frameworks = {};
  try {
    const wrapped = `---\n${readFileSync(manifestPath, "utf-8")}\n---\n`;
    frameworks = parseFrontmatter(wrapped).data?.frameworks || {};
  } catch {
    return {};
  }
  const mdByLib = scanMdByLib(stacksDir);
  const out = {};
  for (const [lib, fw] of Object.entries(frameworks)) {
    out[lib] = {
      ...fw,
      origin,
      concern: mdByLib[lib]?.concern || null,
      mdPath: mdByLib[lib]?.mdPath || null,
    };
  }
  return out;
}

export function loadStacksMerged(projectRoot, pluginRoot = process.env.CLAUDE_PLUGIN_ROOT) {
  // Plugin defaults (origin "default").
  const defaults = pluginRoot
    ? readStacksFromRoot(join(pluginRoot, "assets", "stacks"), "default")
    : {};

  // Project stacks (origin "project") — canonical + legacy, first wins.
  const projFw = {};
  for (const dir of resolveReadPaths(projectRoot, "stacks")) {
    for (const [lib, fw] of Object.entries(readStacksFromRoot(dir, "project"))) {
      if (!projFw[lib]) projFw[lib] = fw;
    }
  }

  // Merge: project wins by name.
  const merged = { ...defaults, ...projFw };

  // Disable list from .context/stacks.local.yaml.
  const localPath = join(projectRoot, ".context", "stacks.local.yaml");
  let disable = new Set();
  if (existsSync(localPath)) {
    disable = new Set(parseStacksLocalDisable(readFileSync(localPath, "utf-8")));
  }

  const frameworks = {};
  for (const [lib, fw] of Object.entries(merged)) {
    if (!disable.has(lib)) frameworks[lib] = fw;
  }
  return { spec: "devflow-stack/v0", frameworks };
}
