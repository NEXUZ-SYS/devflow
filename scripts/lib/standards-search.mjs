// scripts/lib/standards-search.mjs
//
// Reverse lookups between ADRs and standards:
//   - searchByGuardrail(adrSlug, { projectRoot })
//       → list of std files whose frontmatter.relatedAdrs contains adrSlug
//       (skips deprecated stds)
//   - searchByConcern(concernId, { projectRoot, distributedPath })
//       → list of ADRs whose stack/category matches the concern's
//         inverseHints/relatedAdrCategories
//
// Used by:
//   - cli `devflow standards search --by-guardrail|--by-concern`
//   - skills/adr-builder Step 5e (reverse hook after ADR creation)
//   - skills/standards-builder Step 2 (find existing ADRs for a concern)

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseFrontmatter } from "./frontmatter.mjs";
import { loadTaxonomy } from "./taxonomy-loader.mjs";

function listStdFiles(projectRoot) {
  const dir = join(projectRoot, ".context/standards");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(f =>
      f.startsWith("std-") &&
      f.endsWith(".md") &&
      !f.endsWith(".deprecated.md")
    )
    .map(f => join(dir, f));
}

function listAdrFiles(projectRoot) {
  const dir = join(projectRoot, ".context/adrs");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(f => f.endsWith(".md") && /^\d+-/.test(f))
    .map(f => join(dir, f));
}

export async function searchByGuardrail(adrSlug, { projectRoot }) {
  const files = listStdFiles(projectRoot);
  const matches = [];
  for (const file of files) {
    let data;
    try {
      ({ data } = parseFrontmatter(readFileSync(file, "utf-8")));
    } catch {
      continue;
    }
    if (!data || data.deprecated) continue;
    const rel = Array.isArray(data.relatedAdrs) ? data.relatedAdrs : [];
    if (rel.includes(adrSlug)) {
      matches.push({ id: data.id, file, data });
    }
  }
  return matches;
}

export async function searchByConcern(concernId, { projectRoot, distributedPath }) {
  const tax = await loadTaxonomy({ distributedPath, projectRoot });
  const entry = tax.entries.find(e => e.id === concernId);
  if (!entry) return [];

  const inverseHints = new Set((entry.inverseHints || []).map(h => h.toLowerCase()));
  const relatedCategories = new Set(entry.relatedAdrCategories || []);

  const adrFiles = listAdrFiles(projectRoot);
  const matches = [];
  for (const file of adrFiles) {
    let data;
    try {
      ({ data } = parseFrontmatter(readFileSync(file, "utf-8")));
    } catch {
      continue;
    }
    if (!data) continue;
    const stack = (data.stack || "").toLowerCase();
    const libName = stack.split(/\s+/)[0];
    const cat = data.category || "";
    if (
      (libName && inverseHints.has(libName)) ||
      (cat && relatedCategories.has(cat))
    ) {
      matches.push({ slug: data.name, file, data });
    }
  }
  return matches;
}
