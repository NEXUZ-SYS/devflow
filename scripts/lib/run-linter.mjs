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

import { resolve, isAbsolute } from "node:path";
import { existsSync, realpathSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { loadStandards, findApplicableStandards } from "./standards-loader.mjs";

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

function resolveAndCheckSandbox(linterRel, projectRoot) {
  // Linter path is relative to .context/. So linter "standards/machine/foo.js"
  // resolves to <projectRoot>/.context/standards/machine/foo.js.
  const machineRoot = resolve(projectRoot, ".context", "standards", "machine");
  const candidate = resolve(projectRoot, ".context", linterRel);

  if (!candidate.startsWith(machineRoot + "/") && candidate !== machineRoot) {
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
  if (!real.startsWith(machineRoot + "/") && real !== machineRoot) {
    return { ok: false, reason: `linter symlink escapes machine/: ${real}` };
  }
  return { ok: true, real };
}

export async function runLintersFor(event, projectRoot) {
  const result = { violations: [], rejected: [] };

  // Only Edit/Write tools trigger linter execution
  if (!event || (event.tool !== "Edit" && event.tool !== "Write")) {
    return result;
  }
  if (!event.path) return result;

  const standards = loadStandards(projectRoot);
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

    const sandbox = resolveAndCheckSandbox(linter, projectRoot);
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
        result.violations.push({ id: std.id, msg: stdout.trim() });
      }
    } catch (err) {
      // Linter exited non-zero — capture stdout if it has VIOLATION
      const stdout = err.stdout?.toString() || "";
      if (stdout.includes("VIOLATION:")) {
        result.violations.push({ id: std.id, msg: stdout.trim() });
      } else if (err.code === "ETIMEDOUT") {
        result.rejected.push({ id: std.id, reason: `linter timed out (>5s)` });
      }
      // Other errors silently dropped (linter may have non-zero exit without VIOLATION)
    }
  }
  return result;
}
