// scripts/lib/run-linter.mjs — SI-4 sandboxed linter execution for PostToolUse hook.
//
// Used by hooks/post-tool-use to run computational sensors (linters) declared in
// applicable standards. SI-4 enforces 5 verifications:
//   1. Path normalization (reject .., abs, whitespace, shell metacharacters)
//   2. Allowlist (resolved path must be inside .context/standards/machine/**)
//   3. Symlink check (realpath stays in allowlist)
//   4. Invocation via execFile (NEVER shell, NEVER exec)
//   5. Timeout 5s + maxBuffer 1MB
//
// Linters that fail any check are silently skipped (with stderr log) — never executed.

import { resolve, isAbsolute, relative } from "node:path";
import { existsSync, realpathSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { loadStandardsMerged, findApplicableStandards } from "./standards-loader.mjs";
import { deriveFirstRefForStandard } from "./standard-refs.mjs";
import { contextPaths, resolveReadPaths } from "./context-paths.mjs";

const execFileP = promisify(execFile);

// SI-4 — only relative paths ending in .js, no traversal/abs/metachars/whitespace
const SAFE_LINTER_RE = /^[A-Za-z0-9_\-./]+\.js$/;
const FORBIDDEN_RE = /\.\.|^\/|[\s;|&$`<>"'\\]/;

export function validateLinterPath(linter, projectRoot) {
  if (typeof linter !== "string" || linter.length === 0) {
    return { ok: false, reason: "linter path empty or non-string" };
  }
  if (!SAFE_LINTER_RE.test(linter)) {
    return { ok: false, reason: `unsafe linter path: '${linter}' (must match ${SAFE_LINTER_RE.source})` };
  }
  if (FORBIDDEN_RE.test(linter)) {
    return { ok: false, reason: `forbidden chars in linter path: '${linter}' (no .., abs, whitespace, shell metacharacters)` };
  }
  if (isAbsolute(linter)) {
    return { ok: false, reason: `absolute path forbidden: '${linter}'` };
  }
  return { ok: true };
}

export function resolveAndCheckSandbox(linterRel, opts = {}) {
  // SI-4 (origin-aware): Allowlist confinement keyed off the LOADER-STAMPED
  // origin (never frontmatter). Two disjoint, trusted roots:
  //   - origin "project" (and undefined, for back-compat): base <projectRoot>/.context,
  //     allowlist .context/engineering/standards/machine/ (+ legacy .context/standards/machine).
  //     Linter path is relative to .context/ (e.g. "engineering/standards/machine/foo.js").
  //   - origin "default": base <pluginRoot>/assets/standards, allowlist
  //     <pluginRoot>/assets/standards/machine/. Linter path is relative to
  //     assets/standards/ (e.g. "machine/std-foo.js"). Bundled-only, plugin TCB.
  const { projectRoot, pluginRoot, origin = "project" } = opts;

  // S1 — fail-closed: only loader-stamped origins are accepted.
  if (origin !== "project" && origin !== "default") {
    return { ok: false, reason: `unknown origin '${origin}' (must be project|default)` };
  }

  let base;
  let allowedRoots;
  if (origin === "default") {
    // S7 — default-origin requires a (verified) pluginRoot; never fall back to .context.
    if (!pluginRoot) {
      return { ok: false, reason: "default-origin linter requires pluginRoot (fail-closed)" };
    }
    base = resolve(pluginRoot, "assets", "standards");
    allowedRoots = [resolve(pluginRoot, "assets", "standards", "machine")];
  } else {
    base = resolve(projectRoot, ".context");
    const canonicalMachineRoot = resolve(contextPaths(projectRoot).standardsMachine);
    // Legacy machine root: first resolved read-path for "standards" + "/machine".
    const standardsReadPaths = resolveReadPaths(projectRoot, "standards");
    allowedRoots = [canonicalMachineRoot];
    // T1 hardening: only add a legacy root when a real legacy standards dir
    // exists — never fabricate a cwd-relative `resolve("", "machine")` root.
    const legacyStandards = standardsReadPaths.find(p => p !== contextPaths(projectRoot).standards);
    if (legacyStandards) {
      const legacyMachineRoot = resolve(legacyStandards, "machine");
      if (legacyMachineRoot !== canonicalMachineRoot) allowedRoots.push(legacyMachineRoot);
    }
  }

  const candidate = resolve(base, linterRel);

  const withinAllowlist = allowedRoots.some(
    root => candidate.startsWith(root + "/") || candidate === root
  );
  if (!withinAllowlist) {
    return { ok: false, reason: `linter escapes machine/ allowlist: ${candidate}` };
  }
  if (!existsSync(candidate)) {
    return { ok: false, reason: `linter not found: ${candidate}` };
  }
  let real;
  try {
    real = realpathSync(candidate);
  } catch (err) {
    return { ok: false, reason: `realpath failed: ${err.message}` };
  }
  const realWithinAllowlist = allowedRoots.some(
    root => real.startsWith(root + "/") || real === root
  );
  if (!realWithinAllowlist) {
    return { ok: false, reason: `linter symlink escapes machine/: ${real}` };
  }
  return { ok: true, real };
}

export async function runLintersFor(event, projectRoot, pluginRoot) {
  const result = { violations: [], rejected: [] };

  // Only Edit/Write tools trigger linter execution
  if (!event || (event.tool !== "Edit" && event.tool !== "Write")) {
    return result;
  }
  if (!event.path) return result;

  // Merged: project standards + plugin defaults (origin-stamped). Defaults with a
  // bundled linter are now enforced even without eject; project overrides by id.
  const standards = loadStandardsMerged(projectRoot, pluginRoot);
  const applicable = findApplicableStandards(event.path, standards);

  for (const std of applicable) {
    const linter = std.enforcement?.linter;
    if (!linter) continue;

    const formatCheck = validateLinterPath(linter, projectRoot);
    if (!formatCheck.ok) {
      result.rejected.push({ id: std.id, reason: formatCheck.reason });
      console.error(`[SI-4] Standard ${std.id}: ${formatCheck.reason}`);
      continue;
    }

    // origin is the LOADER-STAMPED provenance (project|default); never fm.origin.
    const sandbox = resolveAndCheckSandbox(linter, {
      projectRoot,
      pluginRoot,
      origin: std.origin === "default" ? "default" : "project",
    });
    if (!sandbox.ok) {
      result.rejected.push({ id: std.id, reason: sandbox.reason });
      console.error(`[SI-4] Standard ${std.id}: ${sandbox.reason}`);
      continue;
    }

    // SI-4 #4: invoke via execFile, NEVER shell. SI-4 #5: timeout + maxBuffer.
    try {
      const { stdout } = await execFileP("node", [sandbox.real, event.path], {
        timeout: 5000,
        maxBuffer: 1024 * 1024,
        cwd: projectRoot,
      });
      if (stdout && stdout.includes("VIOLATION:")) {
        result.violations.push(buildViolation(std, stdout, projectRoot));
      }
    } catch (err) {
      // Linter exited non-zero — capture stdout if it has VIOLATION
      const stdout = err.stdout?.toString() || "";
      if (stdout.includes("VIOLATION:")) {
        result.violations.push(buildViolation(std, stdout, projectRoot));
      } else if (err.code === "ETIMEDOUT") {
        result.rejected.push({ id: std.id, reason: `linter timed out (>5s)` });
      }
      // Other errors silently dropped (linter may have non-zero exit without VIOLATION)
    }
  }
  return result;
}

// Camada 4: enrich each violation with paths/queries the LLM can use.
// stdPath:   where to read the standard's full body (Princípios + Anti-patterns).
// refPath:   for legacy "scraped" refs, the .context/stacks/refs/<lib>@<ver>.md path;
//            for "mcp-indexed" refs, a synthetic hint like "mcp:<lib>@<ver>"
//            telling the agent to use the MCP search tool.
// refStatus: "mcp-indexed" | "scraped" | "pending-scrape" | null
//
// Returns null fields when the std has no derivable ref.
function buildViolation(std, stdout, projectRoot) {
  const stdPathAbs = std.filePath || "";
  const stdPathRel = stdPathAbs && stdPathAbs.startsWith(projectRoot)
    ? relative(projectRoot, stdPathAbs)
    : stdPathAbs;
  const ref = deriveFirstRefForStandard(std, projectRoot);
  let refPath = null;
  let refStatus = null;
  if (ref) {
    refStatus = ref.status;
    if (ref.status === "mcp-indexed") {
      // Synthetic locator: caller (run-linter-cli + post-tool-use hook)
      // formats this as a `mcp__docs-mcp-server__search_docs` instruction.
      refPath = `mcp:${ref.lib}@${ref.version}`;
    } else if (ref.refPath) {
      refPath = `.context/stacks/${ref.refPath}`;
    }
  }
  return {
    id: std.id,
    msg: stdout.trim(),
    stdPath: stdPathRel || null,
    refPath,
    refStatus,
  };
}
