// scripts/lib/run-linter.mjs — SI-4 sandboxed linter execution for PostToolUse hook.
//
// Used by hooks/post-tool-use to run computational sensors (linters) declared in
// applicable standards. SI-4 enforces 6 verifications:
//   1. Path normalization (reject .., abs, whitespace, shell metacharacters)
//   2. Allowlist (resolved path must be inside .context/standards/machine/**)
//   3. Symlink check (realpath stays in allowlist)
//   4. Invocation via execFile (NEVER shell, NEVER exec)
//   5. Timeout 5s + maxBuffer 1MB
//   6. Minimal environment (allowlist; no credentials, NODE_OPTIONS or CLAUDE_* from the process)
//
// Linters that fail any check are silently skipped (with stderr log) — never executed.

import { resolve, isAbsolute, relative, join } from "node:path";
import { existsSync, realpathSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { loadStandardsMerged, findApplicableStandards } from "./standards-loader.mjs";
import { deriveFirstRefForStandard } from "./standard-refs.mjs";
import { contextPaths, resolveReadPaths } from "./context-paths.mjs";
import { readFrameworkVersionsFromPath } from "./devflow-config.mjs";
import { hasViolation } from "./linter-protocol.mjs";

const execFileP = promisify(execFile);

/**
 * S3 trust-anchor: a pluginRoot is trusted only if it carries the plugin marker
 * (.claude-plugin/plugin.json). The hook derives pluginRoot from BASH_SOURCE (its
 * own on-disk path); the env CLAUDE_PLUGIN_ROOT is poisonable, so default-origin
 * linters are NEVER executed from an unverified dir. Unverified → project-only.
 */
export function verifyPluginRoot(pluginRoot) {
  if (!pluginRoot || typeof pluginRoot !== "string") return false;
  try {
    return existsSync(join(pluginRoot, ".claude-plugin", "plugin.json"));
  } catch {
    return false;
  }
}

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

const LINTER_TIMEOUT_CAP_MS = 5000;
const LINTER_MAX_BUFFER = 1024 * 1024;

// Teto efetivo do timeout: nunca acima de 5s. DEVFLOW_LINTER_TIMEOUT_MS e o timeoutMs do
// chamador só REDUZEM (Math.min); valor inválido ou ≤ 0 é ignorado.
function effectiveTimeout(timeoutMs) {
  const pos = (v) => (Number.isFinite(v) && v > 0 ? v : LINTER_TIMEOUT_CAP_MS);
  return Math.min(LINTER_TIMEOUT_CAP_MS, pos(Number(timeoutMs)), pos(Number(process.env.DEVFLOW_LINTER_TIMEOUT_MS)));
}

// SI-4 #6 — ambiente mínimo, por allowlist. O linter é código do projeto: no gate do CI roda
// inclusive o que o próprio PR trouxe, e o gate tem a credencial do override no ambiente. O
// linter recebe só o que um `node` precisa para rodar; nenhuma outra variável do processo chega
// a ele — nem credencial (GH_TOKEN, GITHUB_TOKEN, ACTIONS_*, CI_JOB_TOKEN, NODE_AUTH_TOKEN,
// NPM_TOKEN), nem NODE_OPTIONS (que carregaria código no linter), nem CLAUDE_*.
// `DEVFLOW_LINTER_TIMEOUT_MS` é lido por ESTE processo (effectiveTimeout), não pelo linter.
const LINTER_ENV = new Set(["PATH", "HOME", "TMPDIR", "TMP", "TEMP", "LANG"]);
const LINTER_ENV_WINDOWS = new Set(["SYSTEMROOT", "COMSPEC", "PATHEXT", "USERPROFILE"]);

/**
 * O ambiente que o linter recebe: de `env`, só `PATH`, `HOME`, `TMPDIR`/`TMP`/`TEMP`, `LANG` e
 * `LC_*`; no Windows, também `SystemRoot`, `ComSpec`, `PATHEXT` e `USERPROFILE` — e lá o nome
 * da variável não distingue caixa (`Path`).
 */
export function linterEnv(env = process.env, platform = process.platform) {
  const windows = platform === "win32";
  const out = {};
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) continue;
    const name = windows ? key.toUpperCase() : key;
    if (LINTER_ENV.has(name) || name.startsWith("LC_") || (windows && LINTER_ENV_WINDOWS.has(name))) out[key] = value;
  }
  return out;
}

/**
 * Roda UM linter de standard sobre UM arquivo, com todas as verificações SI-4.
 *
 * Contrato de saída (ADR-015 D4): exit 0 sem VIOLATION = limpo; exit 0/1 com VIOLATION =
 * achados; qualquer outra coisa (exit 1 sem VIOLATION, outro exit, sinal, timeout, estouro
 * de maxBuffer, abort, exceção) = erro. Um linter quebrado NUNCA conta como limpo.
 *
 * @returns {Promise<{ok: true, stdout: string} | {ok: false, reason: string}>}
 */
export async function runOneLinter(std, filePath, {
  projectRoot, cwd = projectRoot, trustedPlugin, timeoutMs = LINTER_TIMEOUT_CAP_MS, signal,
} = {}) {
  const linter = std?.enforcement?.linter;
  if (!linter) return { ok: false, reason: "standard sem linter" };
  const formatCheck = validateLinterPath(linter, projectRoot);
  if (!formatCheck.ok) return { ok: false, reason: formatCheck.reason };
  // origin é a proveniência carimbada pelo LOADER (project|default); nunca fm.origin.
  const sandbox = resolveAndCheckSandbox(linter, {
    projectRoot, pluginRoot: trustedPlugin, origin: std.origin === "default" ? "default" : "project",
  });
  if (!sandbox.ok) return { ok: false, reason: sandbox.reason };
  if (signal?.aborted) return { ok: false, reason: "linter abortado (orçamento)" };
  const timeout = effectiveTimeout(timeoutMs);
  // SI-4 #4: execFile, NUNCA shell. SI-4 #5: timeout ≤ 5s + maxBuffer 1MB.
  // process.execPath: o mesmo node que roda o plugin, nunca o "node" do PATH (envenenável).
  // killSignal SIGKILL: um linter que captura SIGTERM não escapa do timeout.
  // O abort é tratado aqui, e não pelo `signal` do execFile: o execFile mata com SIGTERM no
  // abort (ignora o killSignal), e um linter que captura SIGTERM sobreviveria ao orçamento.
  // SI-4 #6: `env` explícito — sem ele o filho herdaria o ambiente inteiro do processo.
  const pending = execFileP(process.execPath, [sandbox.real, filePath], {
    timeout, maxBuffer: LINTER_MAX_BUFFER, cwd, killSignal: "SIGKILL", env: linterEnv(),
  });
  let aborted = false;
  // Destruir stdout/stderr: um neto que herdou os pipes seguraria o execFile (que espera o
  // "close" dos streams) até o teto de 5s, mesmo com o filho já morto.
  const onAbort = () => {
    aborted = true;
    try { pending.child.kill("SIGKILL"); } catch { /* já saiu */ }
    pending.child.stdout?.destroy();
    pending.child.stderr?.destroy();
  };
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const { stdout } = await pending;
    if (aborted) return { ok: false, reason: "linter abortado (orçamento)" };
    return { ok: true, stdout: stdout || "" };
  } catch (err) {
    if (aborted) return { ok: false, reason: "linter abortado (orçamento)" };
    if (err?.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") return { ok: false, reason: "saída do linter acima de 1MB" };
    if (err?.killed || err?.signal) {
      return { ok: false, reason: `linter excedeu o tempo ou foi morto (>${timeout}ms, ${err.signal || "killed"})` };
    }
    const stdout = err?.stdout?.toString() || "";
    if (err?.code === 1 && hasViolation(stdout)) return { ok: true, stdout };
    if (typeof err?.code === "number") return { ok: false, reason: `linter saiu com exit ${err.code} sem VIOLATION válida` };
    return { ok: false, reason: `falha ao executar o linter: ${err?.message || err}` };
  } finally {
    signal?.removeEventListener("abort", onAbort);
  }
}

export async function runLintersFor(event, projectRoot, pluginRoot) {
  const result = { violations: [], rejected: [] };

  // Only Edit/Write tools trigger linter execution
  if (!event || (event.tool !== "Edit" && event.tool !== "Write")) {
    return result;
  }
  if (!event.path) return result;

  // S3 trust-anchor: only a marker-verified pluginRoot enables default linters;
  // otherwise degrade to project-only (never run default linters from an
  // unverified/poisoned dir).
  const trustedPlugin = verifyPluginRoot(pluginRoot) ? pluginRoot : undefined;
  // Merged: project standards + plugin defaults (origin-stamped). Defaults with a
  // bundled linter are now enforced even without eject; project overrides by id.
  // `?? null`, nunca `undefined`: undefined reativaria o default CLAUDE_PLUGIN_ROOT (D5).
  const standards = loadStandardsMerged(projectRoot, trustedPlugin ?? null);
  // Escopo de versao: o predicado pula standard de perfil fora da faixa da serie
  // do projeto (fail-closed — versao desconhecida NAO aplica standard com faixa).
  const ctx = {
    versions: readFrameworkVersionsFromPath(join(projectRoot, ".context", ".devflow.yaml")),
    onSkip: ({ id, reason }) => console.error(`[version-scope] ${id}: ${reason}`),
  };
  const applicable = findApplicableStandards(event.path, standards, ctx);

  for (const std of applicable) {
    if (!std.enforcement?.linter) continue;
    // R2: a validação SI-4 (formato + sandbox + execFile + timeout/maxBuffer) vive SÓ em
    // runOneLinter. Qualquer resultado que não seja limpo/achados (D4) vira `rejected`.
    const run = await runOneLinter(std, event.path, { projectRoot, trustedPlugin });
    if (!run.ok) {
      result.rejected.push({ id: std.id, reason: run.reason });
      console.error(`[SI-4] Standard ${std.id}: ${run.reason}`);
      continue;
    }
    if (hasViolation(run.stdout)) result.violations.push(buildViolation(std, run.stdout, projectRoot));
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
