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

const execFileP = promisify(execFile);

const DOCS_MCP_PKG = "@arabold/docs-mcp-server@2.2.1";
const MD2LLM_PKG = "md2llm@1.1.0";
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

// ─── Stage 2: SCRAPE ───────────────────────────────────────────────────────

export async function scrape(resolved) {
  const rawDir = join(resolved.workDir, "raw");
  await mkdir(rawDir, { recursive: true });

  // SI-2: execFile, NEVER shell
  const args = ["-y", DOCS_MCP_PKG, "fetch-url", resolved.url];
  const env = { ...process.env, OUTPUT_DIR: rawDir };
  try {
    const { stdout } = await execFileP("npx", args, {
      timeout: 5 * 60 * 1000,        // 5 min per page (libs vary)
      maxBuffer: 50 * 1024 * 1024,   // 50MB output
      env,
    });
    // docs-mcp-server fetch-url writes markdown to stdout. Capture it.
    const safeName = resolved.url
      .replace(/[^a-zA-Z0-9]/g, "_")
      .slice(0, 200);
    await writeFile(join(rawDir, `${safeName}.md`), stdout || "");
  } catch (err) {
    if (err.code === "ETIMEDOUT") {
      throw new Error(`SCRAPE: docs-mcp-server timed out for ${resolved.url}`);
    }
    throw new Error(`SCRAPE: ${err.message}`);
  }
  return { ...resolved, rawDir };
}

// ─── Stage 3: REFINE ───────────────────────────────────────────────────────

export async function refine(scraped) {
  const refinedDir = join(scraped.workDir, "refined");
  await mkdir(refinedDir, { recursive: true });

  try {
    await execFileP("npx", [
      "-y", MD2LLM_PKG,
      refinedDir,
      scraped.rawDir,
      "--source-url", scraped.url,
      "--exclude", "images,build",
    ], {
      timeout: 60 * 1000,
      maxBuffer: 50 * 1024 * 1024,
    });
  } catch (err) {
    // md2llm sometimes exits non-zero with no output but still produces files.
    // Tolerate if refined dir has content.
  }

  // Collect refined files
  const files = (await readdir(refinedDir)).filter(f => f.endsWith(".md")).sort();
  if (files.length === 0) {
    throw new Error(`REFINE: md2llm produced no output for ${scraped.library}@${scraped.version}`);
  }
  return { ...scraped, refinedDir, refinedFiles: files };
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

  // Concatenate refined snippets in order
  const parts = [];
  for (const f of refined.refinedFiles) {
    const content = await readFile(join(refined.refinedDir, f), "utf-8");
    parts.push(content);
  }
  // md2llm writes `SOURCE: <local-tmp-path>` because it processes raw files
  // off disk. Replace with the actual upstream URL so committed refs are
  // self-contained and traceable (no /tmp leakage). Single --from URL per
  // scrape means all snippets share the same source.
  let consolidated = parts.join("\n\n").replace(
    /^SOURCE: \/tmp\/devflow-scrape-[^\n]*$/gm,
    `SOURCE: ${refined.url}`
  );
  // md2llm sometimes appends a trailing `@<encoded-filename>` line that
  // mirrors the local raw filename — pure leakage with no semantic value.
  // Pattern: starts with `@`, followed by underscore-encoded URL chars only.
  consolidated = consolidated.replace(/^@[a-zA-Z0-9_]+\s*$/gm, "").trim();
  // Collapse any consecutive blank lines created by the strip
  consolidated = consolidated.replace(/\n{3,}/g, "\n\n");

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
    snippetCount: refined.refinedFiles.length,
  };
}

// ─── Orchestrator ──────────────────────────────────────────────────────────

export async function runPipeline(input, projectRoot) {
  const r = await resolve(input);
  const s = await scrape(r);
  const f = await refine(s);
  return consolidate(f, projectRoot);
}
