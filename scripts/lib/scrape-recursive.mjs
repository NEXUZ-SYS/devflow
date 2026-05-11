// scripts/lib/scrape-recursive.mjs — populate the docs-mcp-server global
// store via recursive scrape. No SQLite extraction, no .md file output.
//
// The legacy version (pre-Fase B) extracted scraped content from the SQLite
// store into a single markdown file under .context/stacks/refs/. That has
// been removed: the store IS the output. Consumers (Camadas 1-4, search,
// agent queries) read directly from the docs-mcp-server MCP server via
// tool calls (`mcp__docs-mcp-server__*`), or via this lib's `listLibraries`.
//
// SECURITY:
//   - SI-2: external command via execFile, NEVER shell.
//   - SI-3: caller pre-validates URL via url-validator (defense in depth
//     in pipeline.mjs::resolve).
//
// Limits enforced by docs-mcp-server scrape flags:
//   --max-pages    cap total pages (default 50)
//   --max-depth    cap link recursion depth (default 3)
//   --scope        same-origin policy (default 'hostname')
//   --scrape-mode  'auto' lets the tool pick fetch vs playwright
//   --quiet        silence informational output (only errors to stderr)

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

const DOCS_MCP_PKG = "@arabold/docs-mcp-server@2.2.1";
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000; // 10 min for full multi-page crawl
const DEFAULT_MAX_BUFFER = 50 * 1024 * 1024;

/**
 * Runs `docs-mcp-server scrape` against a URL. The library is indexed into
 * the user's global docs-mcp-server store (~/.local/share/docs-mcp-server/
 * by default — `envPaths('docs-mcp-server')`). Subsequent MCP queries via
 * `search_docs`, `list_libraries`, etc. read from this store.
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
 * @returns {Promise<{ library: string, version: string, url: string }>}
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

  // SI-2: execFile, never shell. NO --store-path — let the tool use its
  // default global store (~/.local/share/docs-mcp-server/) so all projects
  // share the indexed libraries (dedup), and MCP server reads from the
  // same place.
  const args = [
    "-y", DOCS_MCP_PKG,
    "scrape", library, url,
    "--version", String(version),
    "--max-pages", String(maxPages),
    "--max-depth", String(maxDepth),
    "--scope", scope,
    "--scrape-mode", "auto",
    "--quiet",
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
  return { library, version, url };
}

/**
 * Lists libraries indexed in the docs-mcp-server global store via the CLI's
 * `list` subcommand. Used by Camada 1 (context-index) and audit to know
 * which libs are available without invoking MCP tools.
 *
 * Returns [] when the CLI fails or the store is empty.
 *
 * @returns {Promise<Array<{ library: string, version: string }>>}
 */
export async function listIndexedLibraries() {
  const args = ["-y", DOCS_MCP_PKG, "list", "--output", "json"];
  try {
    const { stdout } = await execFileP("npx", args, {
      timeout: 60 * 1000,
      maxBuffer: 10 * 1024 * 1024,
    });
    const parsed = JSON.parse(stdout);
    if (!Array.isArray(parsed)) return [];
    // Normalize: list output shape is `[{library, versions: [{version, ...}]}]`
    // Flatten into [{library, version}] entries.
    const out = [];
    for (const lib of parsed) {
      const name = lib?.library || lib?.name;
      if (!name) continue;
      const versions = Array.isArray(lib?.versions) ? lib.versions : [];
      for (const v of versions) {
        const ver = typeof v === "string" ? v : (v?.version || v?.name);
        if (ver) out.push({ library: name, version: ver });
      }
    }
    return out;
  } catch {
    return [];
  }
}
