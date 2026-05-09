// scripts/lib/scrape-recursive.mjs — multi-page scrape via docs-mcp-server.
//
// Replaces the single-page `fetch-url` invocation with the recursive
// `scrape` subcommand of @arabold/docs-mcp-server. The tool stores
// indexed pages in a SQLite DB (`documents.db`); this lib invokes the
// scrape, then reads the DB to consolidate all pages into a single
// markdown string consumable by the existing pipeline (sanitize +
// fence canary + write ref).
//
// SECURITY:
//   - SI-2: external command via execFile, NEVER shell.
//   - SI-3: caller pre-validates URL via url-validator (defense in depth
//     in pipeline.mjs::resolve).
//   - Tmp store path is mkdtemp under os.tmpdir() — auto-cleanup at end
//     even on error.
//
// Limits enforced by docs-mcp-server scrape flags:
//   --max-pages    cap total pages (default 50)
//   --max-depth    cap link recursion depth (default 3)
//   --scope        same-origin policy (default 'hostname')
//   --scrape-mode  'auto' lets the tool pick fetch vs playwright
//   --quiet        silence informational output (only errors to stderr)

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";

const execFileP = promisify(execFile);

const DOCS_MCP_PKG = "@arabold/docs-mcp-server@2.2.1";
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000; // 10 min for full multi-page crawl
const DEFAULT_MAX_BUFFER = 50 * 1024 * 1024;

/**
 * Reads pages + chunks from a docs-mcp-server SQLite store and consolidates
 * into a single markdown string. Each page is prefixed with a header
 * (URL + title) for traceability; chunks within a page concat in id order.
 *
 * @param {string} dbPath — path to documents.db
 * @returns {{ markdown: string, pageCount: number, chunkCount: number }}
 */
export function extractFromStore(dbPath) {
  if (!existsSync(dbPath)) {
    throw new Error(`scrape-recursive: store not found at ${dbPath} (ENOENT)`);
  }
  const db = new DatabaseSync(dbPath);
  try {
    // Pages with at least 1 chunk (orphan pages dropped). Order by depth so
    // index/intro pages come first, then sub-pages, then deeper.
    const rows = db.prepare(`
      SELECT p.url, p.title, p.depth, d.id AS chunk_id, d.content
      FROM pages p
      INNER JOIN documents d ON d.page_id = p.id
      ORDER BY p.depth ASC, p.id ASC, d.id ASC
    `).all();

    const sections = [];
    const seenPages = new Set();
    let chunkCount = 0;
    let currentPageKey = null;

    for (const row of rows) {
      const pageKey = `${row.depth}|${row.url}`;
      if (pageKey !== currentPageKey) {
        // New page — emit a section header
        const title = row.title || row.url;
        sections.push(`## ${title}\n\n**URL:** ${row.url}  \n**Depth:** ${row.depth}\n`);
        currentPageKey = pageKey;
        seenPages.add(pageKey);
      }
      sections.push(String(row.content || "").trim());
      chunkCount++;
    }

    return {
      markdown: sections.join("\n\n"),
      pageCount: seenPages.size,
      chunkCount,
    };
  } finally {
    db.close();
  }
}

/**
 * Runs `docs-mcp-server scrape` against a URL, then extracts the result.
 * Cleans up the tmp store regardless of success/failure.
 *
 * @param {{
 *   library: string,
 *   version: string,
 *   url: string,
 *   maxPages?: number,
 *   maxDepth?: number,
 *   scope?: 'subpages'|'hostname'|'domain',
 *   timeoutMs?: number,
 * }} opts
 * @returns {Promise<{ markdown: string, pageCount: number, chunkCount: number, urls: string[] }>}
 */
export async function recursiveScrape(opts) {
  const {
    library, version, url,
    maxPages = 50,
    maxDepth = 3,
    scope = "hostname",
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = opts;

  if (!library || !version || !url) {
    throw new Error("recursiveScrape: library, version, and url are required");
  }

  const safeLib = String(library).replace(/[/@]/g, "_");
  const storeDir = mkdtempSync(join(tmpdir(), `devflow-scrape-recursive-${safeLib}-`));
  const dbPath = join(storeDir, "documents.db");

  try {
    // SI-2: execFile, never shell
    const args = [
      "-y", DOCS_MCP_PKG,
      "scrape", library, url,
      "--version", String(version),
      "--max-pages", String(maxPages),
      "--max-depth", String(maxDepth),
      "--scope", scope,
      "--scrape-mode", "auto",
      "--quiet",
      "--store-path", storeDir,
    ];
    try {
      await execFileP("npx", args, {
        timeout: timeoutMs,
        maxBuffer: DEFAULT_MAX_BUFFER,
      });
    } catch (err) {
      if (err.code === "ETIMEDOUT") {
        throw new Error(`SCRAPE: docs-mcp-server scrape timed out after ${timeoutMs}ms for ${url}`);
      }
      throw new Error(`SCRAPE: ${err.message}`);
    }

    if (!existsSync(dbPath)) {
      throw new Error(`SCRAPE: docs-mcp-server produced no store at ${dbPath} (silent failure)`);
    }

    const extracted = extractFromStore(dbPath);
    if (extracted.pageCount === 0) {
      throw new Error(`SCRAPE: 0 pages extracted from ${url} (URL likely empty or blocked)`);
    }

    // Distinct URLs visited (for caller diagnostics)
    const db = new DatabaseSync(dbPath);
    const urlRows = db.prepare("SELECT DISTINCT url FROM pages ORDER BY id").all();
    db.close();
    const urls = urlRows.map(r => r.url);

    return { ...extracted, urls };
  } finally {
    // Always cleanup tmp store
    try {
      rmSync(storeDir, { recursive: true, force: true });
    } catch { /* best-effort */ }
  }
}
