// scripts/lib/standards-loader.mjs — load and filter standards from .context/standards/.
//
// Used by:
//   - hooks/post-tool-use (Task 1.3) to find applicable standards for an Edit/Write event
//   - scripts/devflow-standards.mjs verify (Task 1.4) for static validation
//
// Pure node:* — uses scripts/lib/{glob,frontmatter}.mjs primitives. No npm deps.

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseFrontmatter } from "./frontmatter.mjs";
import { matchGlob, validateSubset } from "./glob.mjs";

export function loadStandards(projectRoot) {
  const dir = join(projectRoot, ".context", "standards");
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
