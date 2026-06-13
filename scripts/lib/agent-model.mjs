// scripts/lib/agent-model.mjs — validates the per-agent `model` frontmatter field.
//
// Mirrors the Claude Code sub-agent spec: an agent may declare which model it
// runs on via `model:` in its frontmatter. Accepted forms:
//   - aliases:   inherit | sonnet | opus | haiku
//   - full id:   claude-<...>            (e.g. claude-opus-4-7)
//   - omp roles: default | commit | pi/<role>   (e.g. pi/plan, pi/slow, pi/smol)
//
// The omp roles are accepted so the same key can coexist with omp's
// `omp/omp-roles.yaml` enrichment (see docs/omp-integration.md). They are
// inert in Claude Code, which only understands aliases / full ids / inherit.
//
// Precedence at runtime (highest first):
//   CLAUDE_CODE_SUBAGENT_MODEL (env)  >  `model:` frontmatter  >  inherit
//
// `model` is optional; when absent the agent inherits the session model.

export const DEFAULT_MODEL = "inherit";

/** Claude Code aliases + the implicit default. */
export const CC_ALIASES = Object.freeze(["inherit", "sonnet", "opus", "haiku"]);

/** omp model roles (inert in Claude Code, honored by the omp runtime). */
export const OMP_ROLES = Object.freeze(["default", "commit"]);

const FULL_ID_RE = /^claude-[a-z0-9](?:[a-z0-9.\-]*[a-z0-9])?$/;
const OMP_PI_RE = /^pi\/[a-z][a-z0-9-]*$/;

/**
 * @param {unknown} value
 * @returns {boolean} true when `value` is an accepted `model` field value.
 */
export function isValidModelValue(value) {
  if (typeof value !== "string") return false;
  const v = value.trim();
  if (v === "") return false;
  if (CC_ALIASES.includes(v)) return true;
  if (OMP_ROLES.includes(v)) return true;
  if (OMP_PI_RE.test(v)) return true;
  return FULL_ID_RE.test(v);
}

/**
 * Resolve the effective model for an agent, honoring precedence.
 * @param {{ model?: unknown }} frontmatter parsed agent frontmatter
 * @param {NodeJS.ProcessEnv} [env] defaults to process.env
 * @returns {string} the resolved model value (never empty)
 */
export function resolveAgentModel(frontmatter, env = process.env) {
  const override = env?.CLAUDE_CODE_SUBAGENT_MODEL;
  if (typeof override === "string" && override.trim() !== "") return override.trim();
  const fm = frontmatter?.model;
  if (typeof fm === "string" && fm.trim() !== "") return fm.trim();
  return DEFAULT_MODEL;
}
