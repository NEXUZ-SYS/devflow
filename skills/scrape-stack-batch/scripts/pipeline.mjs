// skills/scrape-stack-batch/scripts/pipeline.mjs — RESOLVE → SCRAPE.
//
// Fase B (commit dropping consolidate): the pipeline now populates the
// docs-mcp-server global store directly. There is no `.context/stacks/refs/`
// .md output anymore. Consumers (Camadas 1-4, agents) query the indexed
// libraries via MCP tools (`mcp__docs-mcp-server__*`).
//
// Stages:
//   RESOLVE — validate lib/version/url
//   SCRAPE  — invoke `docs-mcp-server scrape` (recursive, global store)
//
// Removed in Fase B (was ~180 LoC, now obsolete):
//   - REFINE stage (no-op pass-through; md2llm dropped)
//   - CONSOLIDATE stage (no .md file to write; SI-6 fence canary irrelevant)
//   - sanitizeSnippet (only applied to .md output)
//   - workDir mkdtemp + cleanup (no consolidated output file)
//
// Security invariants still enforced:
//   SI-2: external commands via execFile, never shell (in scrape-recursive.mjs)
//   SI-3: URL pre-validated by caller; resolve() re-validates as defense in depth

import { validateUrl } from "../../../scripts/lib/url-validator.mjs";
import { recursiveScrape } from "../../../scripts/lib/scrape-recursive.mjs";

// SECURITY (Semana 2 audit CRITICAL): npm-spec compliant pattern — optional
// scope prefix `@scope/`, then a single segment. No '..', no leading dot,
// no slashes outside the scope prefix.
const SLUG_RE = /^(@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i;
const VERSION_RE = /^[0-9][a-zA-Z0-9.+-]*$/;

// ─── Stage 1: RESOLVE ──────────────────────────────────────────────────────

export async function resolve({ library, version, url, type }) {
  if (!library || !SLUG_RE.test(library) || library.includes("..")) {
    throw new Error(`RESOLVE: invalid library name '${library}' (npm-spec required, no traversal)`);
  }
  if (!version || !VERSION_RE.test(version)) {
    throw new Error(`RESOLVE: invalid version '${version}'`);
  }
  if (!url) throw new Error(`RESOLVE: url required for ${library}@${version}`);
  // SI-3 defense in depth — re-validate even though caller should have
  await validateUrl(url);

  return { library, version, url, type };
}

// ─── Stage 2: SCRAPE ──────────────────────────────────────────────────────
// Populates the docs-mcp-server global store. No file output.

export async function scrape(resolved) {
  await recursiveScrape({
    library: resolved.library,
    version: resolved.version,
    url: resolved.url,
    maxPages: resolved.maxPages ?? 50,
    maxDepth: resolved.maxDepth ?? 3,
    scope: resolved.scope ?? "hostname",
  });
  return {
    library: resolved.library,
    version: resolved.version,
    url: resolved.url,
    indexed: true,
  };
}

// ─── Orchestrator ──────────────────────────────────────────────────────────
// Two stages only: validate, then index into the global store. Caller can
// verify success via `listIndexedLibraries()` or MCP `list_libraries` tool.

export async function runPipeline(input) {
  const r = await resolve(input);
  return scrape(r);
}
