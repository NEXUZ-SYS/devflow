// scripts/lib/standard-refs.mjs — derive stack refs from a standard.
//
// A standard declares relatedAdrs[]. Each ADR's frontmatter carries `stack: <Name> X.Y`.
// That parses to a lib id, which the manifest maps to an artisanalRef path.
// This file is the shared resolver for that chain — used by both:
//   - edit-nudge.mjs (Camada 2: nudge on Read/Edit/Write)
//   - run-linter.mjs (Camada 4: enrich violations with std + ref paths)
//
// Pure node:* — no network, no LLM.

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { loadManifest } from "./manifest-stacks.mjs";
import { parseFrontmatter } from "./frontmatter.mjs";
import { parseStackFrontmatter } from "./adr-chain.mjs";

// Returns a list of refs derived from the given standards. Each ref:
//   { lib, version, refPath, status: "mcp-indexed" | "scraped" | "pending-scrape" }
// Dedup by lib — multiple stds may map to the same ref.
//
// Status values (Fase B onwards):
//   - "mcp-indexed":    fw.mcpIndexed=true. refPath is null; consumers query
//                       via mcp__docs-mcp-server__search_docs.
//   - "scraped":        legacy fw.artisanalRef + file present on disk.
//   - "pending-scrape": legacy fw.artisanalRef declared but file missing.
export function deriveRefsForStandards(stds, projectRoot) {
  const manifest = loadManifest(projectRoot);
  const seen = new Set();
  const refs = [];

  for (const std of stds) {
    const adrSlugs = std.relatedAdrs || [];
    for (const slug of adrSlugs) {
      const adrPath = findAdrFile(slug, projectRoot);
      if (!adrPath) continue;
      let parsed;
      try {
        parsed = parseFrontmatter(readFileSync(adrPath, "utf-8"));
      } catch {
        continue;
      }
      const stackMeta = parseStackFrontmatter(parsed.data?.stack);
      if (!stackMeta) continue;
      if (seen.has(stackMeta.lib)) continue;
      seen.add(stackMeta.lib);

      const fw = manifest.frameworks?.[stackMeta.lib];
      if (!fw || fw.skipDocs) continue;

      // Fase B: prefer mcpIndexed over legacy artisanalRef
      if (fw.mcpIndexed === true) {
        refs.push({
          lib: stackMeta.lib,
          version: fw.version || stackMeta.version,
          refPath: null,
          status: "mcp-indexed",
        });
        continue;
      }

      // Legacy path
      if (!fw.artisanalRef) continue;
      const refOnDisk = join(projectRoot, ".context", "stacks", fw.artisanalRef);
      refs.push({
        lib: stackMeta.lib,
        version: fw.version || stackMeta.version,
        refPath: fw.artisanalRef,
        status: existsSync(refOnDisk) ? "scraped" : "pending-scrape",
      });
    }
  }
  return refs;
}

// Returns the first ref derived for a single standard, or null if none. Used
// by run-linter where each violation belongs to exactly one std.
export function deriveFirstRefForStandard(std, projectRoot) {
  const refs = deriveRefsForStandards([std], projectRoot);
  return refs.length > 0 ? refs[0] : null;
}

// Resolves an ADR slug to its on-disk path. ADR files live under
// .context/adrs/ with names like `001-adr-typescript-frontend-v1.0.0.md`.
// Match by suffix-with-version OR plain name match (no numeric prefix).
export function findAdrFile(slug, projectRoot) {
  const adrDir = join(projectRoot, ".context", "adrs");
  if (!existsSync(adrDir)) return null;
  const files = readdirSync(adrDir).filter(f => f.endsWith(".md") && f !== "README.md");
  for (const f of files) {
    if (f.includes(slug)) return join(adrDir, f);
  }
  return null;
}
