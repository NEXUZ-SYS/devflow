// skills/scrape-stack-batch/scripts/pipeline.mjs — Fase D (the 4 stages).
//
// RESOLVE → SCRAPE → REFINE → CONSOLIDATE — produces
// .context/stacks/refs/<lib>@<version>.md from a docs source URL.
//
// Security invariants enforced:
//   SI-2: all external commands via execFile, never shell
//   SI-3: URL passed in MUST be pre-validated by caller (input-resolver +
//         discovery already do this); pipeline re-validates as defense in depth
//   SI-6: refined snippets pass through sanitizeSnippet() before consolidate

import { mkdir, readFile, writeFile, readdir, rm } from "node:fs/promises";
import { existsSync, mkdtempSync } from "node:fs";
import { join, basename } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { validateUrl } from "../../../scripts/lib/url-validator.mjs";
import { sanitizeSnippet } from "../../../scripts/lib/sanitize-snippet.mjs";
import { recursiveScrape } from "../../../scripts/lib/scrape-recursive.mjs";

const execFileP = promisify(execFile);

// Legacy single-page pipeline (kept for reference, no longer invoked):
//   const DOCS_MCP_PKG = "@arabold/docs-mcp-server@2.2.1";  fetch-url single page
//   const MD2LLM_PKG = "md2llm@1.1.0";                      HTML→MD refinement
// The recursive scrape uses docs-mcp-server's `scrape` subcommand directly,
// which produces consolidated markdown via SQLite store. md2llm is no longer
// needed because the upstream output is already markdown.
// SECURITY (Semana 2 audit CRITICAL): npm-spec compliant pattern — optional
// scope prefix `@scope/`, then a single segment. No '..', no leading dot,
// no slashes outside the scope prefix. Prevents path traversal in
// consolidate() output path.
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

  const safeLib = library.replace(/[/@]/g, "_");
  return {
    library,
    version,
    url,
    type,
    refRelative: `refs/${library}@${version}.md`,
    workDir: mkdtempSync(join(tmpdir(), `devflow-scrape-${safeLib}-${version}-`)),
  };
}

// ─── Stage 2+3: SCRAPE+REFINE (recursivo) ──────────────────────────────────
// Substitui o pipeline antigo (fetch-url single page → md2llm) por
// docs-mcp-server `scrape` (multi-page) + extração direta do SQLite store.
// O output já vem markdown — md2llm não é mais necessário.

export async function scrape(resolved) {
  const result = await recursiveScrape({
    library: resolved.library,
    version: resolved.version,
    url: resolved.url,
    maxPages: resolved.maxPages ?? 50,
    maxDepth: resolved.maxDepth ?? 3,
    scope: resolved.scope ?? "hostname",
  });
  // Surface page-level diagnostics for the caller (CLI prints them).
  return {
    ...resolved,
    consolidatedMarkdown: result.markdown,
    pageCount: result.pageCount,
    chunkCount: result.chunkCount,
    crawledUrls: result.urls,
  };
}

// `refine` is now a no-op pass-through — kept for backwards compat with
// runPipeline orchestrator; the markdown is already consolidated by scrape().
export async function refine(scraped) {
  return scraped;
}

// ─── Stage 4: CONSOLIDATE ──────────────────────────────────────────────────

export async function consolidate(refined, projectRoot) {
  // Defense-in-depth: re-validate library/version even though resolve()
  // already did. Prevents bypass if a caller skips resolve() or mutates
  // the refined object between stages.
  if (!SLUG_RE.test(refined.library) || refined.library.includes("..")) {
    throw new Error(`CONSOLIDATE: invalid library '${refined.library}' (path traversal)`);
  }
  if (!VERSION_RE.test(refined.version)) {
    throw new Error(`CONSOLIDATE: invalid version '${refined.version}'`);
  }
  const refsDir = join(projectRoot, ".context", "stacks", "refs");
  await mkdir(refsDir, { recursive: true });

  // Recursive scrape already consolidates pages into a single markdown
  // string with per-page section headers. Prepend a top-level heading so
  // the ref is self-describing.
  const header = [
    `# ${refined.library}@${refined.version}`,
    ``,
    `**Source:** ${refined.url}`,
    `**Pages crawled:** ${refined.pageCount} (${refined.chunkCount} chunks)`,
    `**Crawled URLs:**`,
    ...(refined.crawledUrls || []).map(u => `- ${u}`),
    ``,
    `---`,
    ``,
  ].join("\n");

  const consolidated = (header + (refined.consolidatedMarkdown || "")).trim();

  // SI-6: sanitize before writing. Hash is computed AFTER sanitization (the
  // canary references the cleaned content).
  const hash = createHash("sha256").update(consolidated).digest("hex").slice(0, 16);
  const { text: fenced, hits } = sanitizeSnippet(consolidated, hash);

  const outPath = join(refsDir, `${refined.library}@${refined.version}.md`);
  await writeFile(outPath, fenced);

  // Cleanup tmp work dir
  await rm(refined.workDir, { recursive: true, force: true });

  return {
    library: refined.library,
    version: refined.version,
    refPath: outPath,
    refRelative: refined.refRelative,
    hash,
    sanitizationHits: hits,
    snippetCount: refined.pageCount,
  };
}

// ─── Orchestrator ──────────────────────────────────────────────────────────

export async function runPipeline(input, projectRoot) {
  const r = await resolve(input);
  const s = await scrape(r);
  const f = await refine(s);
  return consolidate(f, projectRoot);
}
