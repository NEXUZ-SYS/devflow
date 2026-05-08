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

import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { loadStandards, findApplicableStandards } from "./standards-loader.mjs";
import { deriveRefsForStandards } from "./standard-refs.mjs";

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

  // Camada 3: on first touch (std not yet cached), extract Princípios +
  // Anti-patterns from the std body so the LLM sees the rules without
  // having to Read the std file separately.
  const rules = fresh
    .map(s => {
      const r = extractStandardRules(s.body || "");
      if (!r.principios && !r.antiPatterns) return null;
      return { stdId: s.id, principios: r.principios, antiPatterns: r.antiPatterns };
    })
    .filter(Boolean);

  return {
    tool,
    path,
    matchedStandards: fresh.map(s => s.id),
    derivedRefs,
    rules,
  };
}

// Extracts named sections from a standard's markdown body. Supports the
// canonical sections used by the standard-from-adr generator:
//   ## Princípios
//   ## Anti-patterns
// Returns empty strings when a section is missing — never undefined.
//
// Note: section names are pt-BR by convention (DevFlow standards are written
// in pt-BR). English-language standards using "## Principles" would not
// match — extend the regex if/when that becomes a project requirement.
export function extractStandardRules(body) {
  return {
    principios: extractSection(body, /Princ[íi]pios/i),
    antiPatterns: extractSection(body, /Anti-?patterns/i),
  };
}

function extractSection(body, headingRe) {
  if (!body) return "";
  const heading = new RegExp(`^##\\s+${headingRe.source}\\s*$`, "im");
  const m = body.match(heading);
  if (!m) return "";
  const start = m.index + m[0].length;
  const rest = body.slice(start);
  // Stop at next "## " or "# " heading (or EOF)
  const nextHeading = rest.match(/^#{1,2}\s/m);
  const slice = nextHeading ? rest.slice(0, nextHeading.index) : rest;
  return slice.trim();
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

  // Camada 3: include rule body on first-touch. The cache (recordInjection)
  // ensures these only ship once per std per session.
  if (nudge.rules && nudge.rules.length > 0) {
    for (const rule of nudge.rules) {
      lines.push("");
      lines.push(`### Regras de ${rule.stdId} (primeira aparição)`);
      if (rule.principios) {
        lines.push("#### Princípios");
        lines.push(rule.principios);
      }
      if (rule.antiPatterns) {
        lines.push("#### Anti-patterns");
        lines.push(rule.antiPatterns);
      }
    }
  }
  return lines.join("\n");
}
