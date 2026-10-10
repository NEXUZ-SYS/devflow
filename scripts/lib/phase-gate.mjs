// scripts/lib/phase-gate.mjs — coletor do gate de evidência por fase do PREVC (D5, spec 2026-10-10 §4;
// ADR-018). Junta os fatos da fase que o advance fecha e devolve o que o hook imprime: UM JSON numa linha
// (deny ou aviso) ou "". A decisão é da lib pura ./phase-evidence.mjs.
// Leitura do repositório só por readInRoot (ADR-014); git por execFileSync com argv e config endurecida.
// Erro interno → aviso, nunca deny (spec §4.4); falta de evidência que o próprio repo pode forjar
// (log que falha, frontmatter ilegível) conta como falta, não como erro.
import { execFileSync } from "node:child_process";
import { readInRoot } from "./safe-read.mjs";
import { parseFrontmatter } from "./frontmatter.mjs";
import { readEvidenceGate, readVerify } from "./devflow-config.mjs";
import { evaluateGate } from "./verify-gate.mjs";
import { isAdvanceEvent, leavingPhase, normalizeVerdict, evaluateTransition, renderDecision, renderInternalError } from "./phase-evidence.mjs";

const PREVC = ".context/runtime/workflows/prevc.json";
const PLANS = [".context/runtime/workflows/plans.json", ".context/workflow/plans.json"];
const STORIES = ".context/workflow/stories.yaml";
const CONFIG = ".context/.devflow.yaml";
const MAX = 256 * 1024;
const SLUG = /^[\w.-]{1,120}$/;
const BRANCH = /^(?!-)(?!.*\.\.)[\w.\/-]{1,100}$/;
const MODES = new Set(["block", "warn", "off"]);
const GIT_ENV = { GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0" };
const HARDEN = ["-c", "core.fsmonitor=false", "-c", "log.showSignature=false"];

const REPO_ENV = ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_COMMON_DIR", "GIT_OBJECT_DIRECTORY"];
// Ambiente do git sem variáveis de repositório herdadas: elas desviariam o git para outro repo.
function gitEnv() {
  const e = { ...process.env, ...GIT_ENV };
  for (const k of REPO_ENV) delete e[k];
  return e;
}
const git = (root, args) => execFileSync("git", [...HARDEN, ...args], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 5000, env: gitEnv() }).trim();
const read = (root, rel) => readInRoot(root, rel, MAX);
const isoOrNull = (s) => { const t = Date.parse(String(s ?? "")); return Number.isFinite(t) ? new Date(t).toISOString() : null; };

function gitConfig(root) {
  let g = {};
  try { g = parseFrontmatter(`---\n${read(root, CONFIG) ?? ""}\n---\n`).data?.git ?? {}; } catch { g = {}; }
  const list = Array.isArray(g.protectedBranches) ? g.protectedBranches.map(String).filter((b) => BRANCH.test(b)) : [];
  const enforced = g.branchProtection !== false && g.strategy !== "trunk-based";
  return { protectedBranches: list, enforced, bases: list.length ? list : ["main", "master"] };
}

export function planSlug(root, prevc) {
  const fromPrevc = prevc?.status?.project?.plan;
  if (typeof fromPrevc === "string" && SLUG.test(fromPrevc)) return fromPrevc;
  for (const rel of PLANS) {
    const t = read(root, rel);
    if (t === null) continue; // o primeiro que EXISTE decide: um legado velho não finge vínculo
    let j;
    try { j = JSON.parse(t); } catch { return null; }
    const all = [...(Array.isArray(j?.active) ? j.active : []), ...(Array.isArray(j?.completed) ? j.completed : [])];
    const slug = all.find((a) => a?.slug === j.primary)?.slug ?? all.at(-1)?.slug;
    return typeof slug === "string" && SLUG.test(slug) ? slug : null;
  }
  return null;
}

export function planFacts(root, prevc) {
  const none = { linked: false, bodyChars: 0, review: null, requiredSignals: [] };
  const slug = planSlug(root, prevc);
  const src = slug ? read(root, `.context/plans/${slug}.md`) : null;
  if (src === null) return none;
  const body = src.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
  let data = {};
  try { data = parseFrontmatter(src).data ?? {}; } catch { data = {}; } // ilegível → sem review (nega na R)
  const verdict = data.review && typeof data.review === "object" ? normalizeVerdict(data.review.verdict) : null;
  return {
    linked: true,
    bodyChars: body.replace(/\s/g, "").length,
    review: verdict ? { verdict } : null,
    requiredSignals: Array.isArray(data.requiredSignals) ? data.requiredSignals.map(String).filter((s) => /^[a-z][\w-]{0,31}$/.test(s)) : [],
  };
}

// Stories só deste workflow: `created` ≥ início do workflow. Leitura por linha (arquivo gerado pela skill).
function storyFacts(root, prevc) {
  const t = read(root, STORIES);
  if (t === null) return null;
  const created = Date.parse((t.match(/^created:\s*["']?([^"'\n#]+)/m)?.[1] ?? "").trim());
  const started = Date.parse(prevc?.status?.project?.started ?? "");
  if (!Number.isFinite(created) || (Number.isFinite(started) && created < started)) return null;
  return { open: (t.match(/^\s+status:\s*["']?(pending|in_progress)\b/gm) ?? []).length };
}

const sinceOf = (prevc) => isoOrNull(prevc?.status?.phases?.E?.started_at ?? prevc?.status?.project?.started);
const branchOf = (root) => { try { return git(root, ["branch", "--show-current"]); } catch { return ""; } };

function eFacts(root, prevc) {
  const cfg = gitConfig(root);
  const branch = branchOf(root);
  const since = sinceOf(prevc);
  let n = 0;
  try { n = since ? git(root, ["log", "--no-show-signature", `--since=${since}`, "--format=%H", "HEAD", "--"]).split("\n").filter(Boolean).length : 0; } catch { n = 0; }
  return { branch, protected: cfg.enforced && !!branch && cfg.protectedBranches.includes(branch), commitsSincePhaseStart: n };
}

const remoteRefs = (root, name) => git(root, ["for-each-ref", "--format=%(refname)", `refs/remotes/*/${name}`]).split("\n").filter(Boolean);
const refExists = (root, ref) => { try { git(root, ["rev-parse", "--verify", "--quiet", ref]); return true; } catch { return false; } };

// Entregue (spec §4.2): a feature está contida numa base (merge/ff), ou publicada no remoto, ou — fallback
// declarado para squash merge — alguma base tem commit posterior ao início de E.
function cFacts(root, prevc) {
  const { bases } = gitConfig(root);
  const branch = branchOf(root);
  const refs = bases.flatMap((b) => [`refs/heads/${b}`, ...remoteRefs(root, b)]).filter((r) => refExists(root, r));
  const onBase = bases.includes(branch);
  if (!onBase && branch) {
    for (const r of refs) {
      try { git(root, ["merge-base", "--is-ancestor", "HEAD", r]); return { branch, delivered: true }; } catch { /* não contida */ }
    }
    if (remoteRefs(root, branch).length) return { branch, delivered: true };
  }
  const since = sinceOf(prevc);
  if (since) {
    for (const r of refs) {
      try { if (git(root, ["log", "--no-show-signature", "-1", `--since=${since}`, "--format=%H", r, "--"])) return { branch, delivered: true }; } catch { /* segue */ }
    }
  }
  return { branch, delivered: false };
}

function verifyFacts(root, plan) {
  let required = plan.requiredSignals;
  if (!required.length) {
    try { required = Object.keys(readVerify(read(root, CONFIG) ?? "").signals ?? {}); } catch { required = []; }
  }
  return evaluateGate({ root, requiredSignals: required });
}

export function collectFacts(root, phase, prevc) {
  // Falha de EXECUÇÃO do git (binário ausente) sobe sem tratamento → aviso em decide (spec §4.4);
  // falha de DADO (ref ausente, log vazio) segue contando como falta de evidência.
  if (phase !== "P" && phase !== "R") git(root, ["--version"]);
  if (phase === "P" || phase === "R") return { plan: planFacts(root, prevc) };
  if (phase === "E") return { git: eFacts(root, prevc), stories: storyFacts(root, prevc) };
  if (phase === "V") return { verify: verifyFacts(root, planFacts(root, prevc)) };
  return { git: cFacts(root, prevc) };
}

function rootOf(dir) {
  try { return git(dir, ["rev-parse", "--show-toplevel"]) || dir; } catch { return dir; }
}

function decideAt(root, envMode) {
  const fileMode = readEvidenceGate(read(root, CONFIG) ?? "");
  const mode = MODES.has(envMode) ? envMode : fileMode;
  if (mode === "off") return "";
  let prevc;
  try { prevc = JSON.parse(read(root, PREVC) ?? ""); } catch { return ""; } // sem workflow: nada a conferir
  const leaving = leavingPhase(prevc);
  if (!leaving) return "";
  return renderDecision(mode, leaving.phase, evaluateTransition(leaving.phase, collectFacts(root, leaving.phase, prevc)));
}

export function decide(event, env = process.env) {
  if (!isAdvanceEvent(event)) return "";
  try {
    const dirs = [env.CLAUDE_PROJECT_DIR, typeof event.cwd === "string" && event.cwd ? event.cwd : process.cwd()].filter(Boolean);
    const roots = [...new Set(dirs.map(rootOf))];
    const outs = [];
    let failure = null;
    for (const r of roots) {
      try { outs.push(decideAt(r, env.DEVFLOW_EVIDENCE_GATE)); } catch (e) { failure ??= e; } // um erro não anula o deny da outra raiz
    }
    const found = outs.filter(Boolean);
    const deny = found.find((o) => o.includes('"permissionDecision":"deny"'));
    if (deny) return deny;
    if (failure) return renderInternalError(String(failure?.message ?? failure).split("\n")[0]);
    return found[0] ?? "";
  } catch (e) {
    return renderInternalError(String(e?.message ?? e).split("\n")[0]);
  }
}
