// scripts/lib/edit-nudge.mjs — Camada 2 (Read/Edit/Write nudge channel).
// On a tool event, returns a textual nudge listing standards applicable to the
// edited path + stack refs derived from those standards' related ADRs. Caches
// per-session to avoid spamming the LLM with the same nudge on every tool call.
//
// Public API:
//   buildNudge({ tool, path, projectRoot }) → string | null
//   loadCache(projectRoot) → { ts, injected: string[] }
//   recordInjection(projectRoot, stdId)     → mutates cache
//   isFresh(cacheObj)                       → boolean (TTL 6h)
//
// Cache lives at .context/cache/session-injected.json. TTL is 6h — long
// enough for a typical session, short enough to avoid stale state across
// days. On stale, cache is reset transparently.

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { loadStandards, findApplicableStandards } from "./standards-loader.mjs";
import { loadManifest } from "./manifest-stacks.mjs";
import { parseFrontmatter } from "./frontmatter.mjs";
import { parseStackFrontmatter } from "./adr-chain.mjs";

const CACHE_REL = ".context/cache/session-injected.json";
const TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const RELEVANT_TOOLS = new Set(["Read", "Edit", "Write"]);

export function buildNudge({ tool, path, projectRoot }) {
  if (!RELEVANT_TOOLS.has(tool)) return null;
  if (!path || typeof path !== "string") return null;

  const standards = loadStandards(projectRoot);
  const applicable = findApplicableStandards(path, standards);
  if (applicable.length === 0) return null;

  const cache = loadCache(projectRoot);
  const fresh = applicable.filter(s => !cache.injected.includes(s.id));
  if (fresh.length === 0) return null;

  const derivedRefs = deriveRefsForStandards(fresh, projectRoot);

  return {
    tool,
    path,
    matchedStandards: fresh.map(s => s.id),
    derivedRefs,
  };
}

// Derives stack refs from a set of standards by following:
//   std.relatedAdrs[] → ADR file → fm.stack → parseStackFrontmatter →
//   manifest.frameworks[lib] → artisanalRef + on-disk status.
//
// Dedup by lib — a single ref serves multiple stds (e.g., std-typescript +
// std-zod might both reference TypeScript-the-language docs).
function deriveRefsForStandards(stds, projectRoot) {
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
      if (!fw || fw.skipDocs || !fw.artisanalRef) continue;

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

// Resolves an ADR slug to its on-disk path. ADR files live under
// .context/adrs/ with names like `001-adr-typescript-frontend-v1.0.0.md`.
// Match by suffix-with-version OR plain name match (no numeric prefix).
function findAdrFile(slug, projectRoot) {
  const adrDir = join(projectRoot, ".context", "adrs");
  if (!existsSync(adrDir)) return null;
  const files = readdirSync(adrDir).filter(f => f.endsWith(".md") && f !== "README.md");
  for (const f of files) {
    if (f.includes(slug)) return join(adrDir, f);
  }
  return null;
}

// ─── Cache management ─────────────────────────────────────────────────────

export function loadCache(projectRoot) {
  const path = join(projectRoot, CACHE_REL);
  if (!existsSync(path)) return { ts: new Date().toISOString(), injected: [] };
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return { ts: new Date().toISOString(), injected: [] };
  }
  if (!isFresh(parsed)) {
    // Stale — reset (don't error)
    return { ts: new Date().toISOString(), injected: [] };
  }
  return {
    ts: parsed.ts,
    injected: Array.isArray(parsed.injected) ? parsed.injected : [],
  };
}

export function recordInjection(projectRoot, stdId) {
  const cache = loadCache(projectRoot);
  if (!cache.injected.includes(stdId)) cache.injected.push(stdId);
  cache.ts = new Date().toISOString();
  const path = join(projectRoot, CACHE_REL);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(cache, null, 2));
  return cache;
}

// Removes the cache file so next session starts clean. Called by
// hooks/session-start — the time-based TTL alone could silence nudges across
// distinct conversations within the same 6h window.
export function clearCache(projectRoot) {
  const path = join(projectRoot, CACHE_REL);
  if (existsSync(path)) rmSync(path, { force: true });
}

export function isFresh(cache) {
  if (!cache || !cache.ts) return false;
  const t = Date.parse(cache.ts);
  if (isNaN(t)) return false;
  return Date.now() - t < TTL_MS;
}

// ─── Render ────────────────────────────────────────────────────────────────

export function renderNudgeText(nudge) {
  if (!nudge) return "";
  const lines = [];
  lines.push(`DevFlow: ${nudge.tool} em ${nudge.path}`);
  lines.push(`Standards aplicáveis: ${nudge.matchedStandards.join(", ")}`);
  if (nudge.derivedRefs.length > 0) {
    const scraped = nudge.derivedRefs
      .filter(r => r.status === "scraped")
      .map(r => `.context/stacks/${r.refPath}`);
    const pending = nudge.derivedRefs
      .filter(r => r.status === "pending-scrape")
      .map(r => `${r.lib}@${r.version}`);
    if (scraped.length > 0) {
      lines.push(`Refs disponíveis: ${scraped.join(", ")}`);
    }
    if (pending.length > 0) {
      lines.push(`Refs declarados sem scrape: ${pending.join(", ")}`);
    }
  }
  return lines.join("\n");
}
