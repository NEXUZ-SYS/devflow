// scripts/lib/phase-evidence.mjs — gate de evidência por fase do PREVC (D5, spec 2026-10-10 §4; ADR-018).
// PURO: recebe fatos já coletados e decide. A coleta (fs, git, verify-gate) é do scripts/lib/phase-gate.mjs.
// Anti-teatro, não anti-adversário: o objetivo é que o caminho de menor esforço passe pelo trabalho real.

export const PHASES = ["P", "R", "E", "V", "C"];
export const MIN_PLAN_BODY = 200;
export const VERDICTS = ["PROCEED", "REVISE", "BLOCK"];
export const MAX_REASON = 2048;

const ADVANCE_TOOL = "mcp__dotcontext__workflow-advance";
// Conteúdo entre aspas sai antes do teste: mensagem de commit ou echo citando o comando não é avanço.
const stripQuoted = (c) => c.replace(/'[^']*'|"(?:[^"\\]|\\.)*"/g, " ");
const CLI_ADVANCE = /(?:^|[\s;&|(])(?:npx\s+(?:(?:-y|--yes)\s+)?|pnpm\s+dlx\s+)?(?:@dotcontext\/cli(?:@\S+)?|(?:\S*\/)?dotcontext)\s+workflow\s+advance\b/;
const TAG = "[devflow phase-gate]";

export function isAdvanceEvent(ev) {
  if (!ev || typeof ev !== "object") return false;
  if (ev.tool_name === ADVANCE_TOOL) return true;
  if (ev.tool_name === "Bash") return CLI_ADVANCE.test(stripQuoted(String(ev.tool_input?.command ?? "")));
  return false;
}

// Fase que o advance está fechando. Fases fora da escala vêm "skipped" no prevc.json do dotcontext.
export function leavingPhase(prevc) {
  const st = prevc?.status;
  const cur = st?.project?.current_phase;
  if (!PHASES.includes(cur)) return null;
  const phases = st.phases ?? {};
  if (phases[cur]?.status === "completed") return null; // workflow já concluído
  const rest = PHASES.slice(PHASES.indexOf(cur) + 1).filter((p) => phases[p]?.status !== "skipped");
  return { phase: cur, completes: rest.length === 0 };
}

// Vocabulário fechado (ADR-014): o veredito cru nunca chega à mensagem.
export function normalizeVerdict(raw) {
  if (raw === null || raw === undefined) return null;
  const v = String(raw).replace(/\s+#.*$/s, "").trim().replace(/^["']|["']$/g, "").toUpperCase();
  if (!v) return null;
  return VERDICTS.includes(v) ? v : "INVALIDO";
}

// Dado vindo do repositório: sem controle C0/C1, curto.
export function clean(text, max = 80) {
  return String(text ?? "").replace(/[\u0000-\u001f\u007f-\u009f]/g, "").slice(0, max);
}
const quote = (t, max) => `«${clean(t, max)}»`;

const item = (code, message, howTo) => ({ code, message, howTo });
const NOT_LINKED = () => item("PLAN_NOT_LINKED", "nenhum plano linkado ao workflow", 'crie o plano (context scaffoldPlan) e vincule com plan({ action: "link" })');

export function evaluateTransition(phase, f = {}) {
  const missing = [];
  if (phase === "P") {
    if (!f.plan?.linked) missing.push(NOT_LINKED());
    else if ((f.plan.bodyChars ?? 0) < MIN_PLAN_BODY) missing.push(item("PLAN_EMPTY", `o plano linkado tem menos de ${MIN_PLAN_BODY} caracteres de corpo`, "escreva o plano (tarefas, testes, sinais) antes de sair da fase P"));
  } else if (phase === "R") {
    const v = f.plan?.review?.verdict ?? null;
    if (!f.plan?.linked) missing.push(NOT_LINKED());
    else if (!v) missing.push(item("REVIEW_MISSING", "o plano não registra a revisão (review.verdict)", "rode a devflow:prevc-review e grave o bloco review: (verdict, reviewers, date) no frontmatter do plano"));
    else if (v !== "PROCEED") missing.push(item("REVIEW_NOT_PROCEED", `a revisão está em ${v === "INVALIDO" ? "valor inválido (use PROCEED, REVISE ou BLOCK)" : v}`, "corrija o plano e revise de novo até PROCEED"));
  } else if (phase === "E") {
    if (f.git?.protected) missing.push(item("PROTECTED_BRANCH", `a branch ${quote(f.git.branch)} é protegida`, "faça o trabalho da fase E numa branch de feature"));
    if (!((f.git?.commitsSincePhaseStart ?? 0) > 0)) missing.push(item("NO_COMMITS", "nenhum commit desde o início da fase E", "commite o trabalho da fase E (testes e implementação) na branch de feature"));
    if ((f.stories?.open ?? 0) > 0) missing.push(item("STORIES_OPEN", `${Number(f.stories.open)} story(ies) ainda pending/in_progress no stories.yaml`, "termine as stories (ou atualize o status) antes de sair da fase E"));
  } else if (phase === "V") {
    if (!f.verify?.pass) {
      const blocks = f.verify?.blocks ?? [];
      const why = blocks.map((b) => `${quote(b.signal, 32)}: ${quote(b.reason, 160)}`).join("; ") || "sem veredito";
      const std = blocks.some((b) => b.signal === "standards");
      missing.push(item("VERIFY_BLOCKED", `verify-gate bloqueado (${why})`, std
        ? 'declare verify.standards: ["devflow-standards", "gate"] no .devflow.yaml e rode os sinais (verify-run) até o verify-gate passar'
        : "rode os sinais exigidos (verify-run) até o verify-gate passar"));
    }
  } else if (phase === "C") {
    if (!f.git?.delivered) missing.push(item("NOT_DELIVERED", "o trabalho não chegou à branch base nem a branch foi publicada no remoto", "publique a branch (push) e abra o PR, ou faça o merge, antes de concluir"));
  }
  return { ok: missing.length === 0, missing };
}

const out = (o) => JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", ...o } });
const cap = (s) => (s.length > MAX_REASON ? s.slice(0, MAX_REASON - 1) + "…" : s);

export function renderDecision(mode, phase, r) {
  if (mode === "off" || r?.ok) return "";
  const head = `${TAG} saída da fase ${clean(phase, 1)} sem a evidência mínima (ADR-018); o texto entre «» é dado do repositório:`;
  const lines = r.missing.map((m) => `- ${m.message} → ${m.howTo}`).join("\n");
  if (mode === "warn") return out({ additionalContext: cap(`${head}\n${lines}\n(modo warn: o avanço segue)`) });
  return out({ permissionDecision: "deny", permissionDecisionReason: cap(`${head}\n${lines}\nforce: true não contorna este gate.`) });
}

export function renderInternalError(message) {
  return out({ additionalContext: `${TAG} não foi possível conferir a evidência da fase (${clean(message, 200)}); o avanço segue sem o gate.` });
}
