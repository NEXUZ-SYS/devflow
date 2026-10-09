// scripts/lib/escalation.mjs — rubrica e combinação da escalada (spec §6). PURO.
// O julgamento vem do controlador (entre tentativas) ou de $.model.complete (no meio);
// a DECISÃO é deste código, por limiares (D7/D14).
import { TIERS, nextTier, capAtCeiling } from "./model-routing.mjs";
import { redact } from "./instinct-redact.mjs";

const PRE_CUT = 16000; // a redação é quadrática no pior caso (segurança 7): corta antes
const MAX_REPORT = 8000;
const KEYS = ["failure_is_capability", "claims_done_with_evidence", "is_stuck"];

export function rubricPrompt({ agentType, tier, report, midRun }) {
  const body = redact(String(report ?? "").slice(0, PRE_CUT)).slice(0, MAX_REPORT);
  return [
    `Avalie o resultado de um subagente (${String(agentType).slice(0, 64)}, tier atual: ${String(tier).slice(0, 16)}${midRun ? ", ainda em execução" : ""}).`,
    "Responda SOMENTE um objeto JSON com exatamente estas chaves:",
    '- "failure_is_capability": número 0..1 — a falha vem de dificuldade de raciocínio/desenho, e não de ambiente, ferramenta, acesso ou informação faltando?',
    '- "claims_done_with_evidence": número 0..1 — o relato afirma conclusão citando evidência concreta (comando de teste e saída)?',
    '- "is_stuck": número 0..1 — o agente diz estar bloqueado, inseguro ou sem convergir?',
    `- "needed_tier": um de ${TIERS.join(" | ")} — que tier o trabalho restante exige?`,
    "",
    "Relato (redigido e truncado):",
    "<<<",
    body,
    ">>>",
  ].join("\n");
}

export function parseAnswers(text) {
  if (typeof text !== "string") return null;
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  let o;
  try { o = JSON.parse(m[0]); } catch { return null; }
  const out = {};
  for (const k of KEYS) {
    if (typeof o?.[k] !== "number" || !(o[k] >= 0 && o[k] <= 1)) return null;
    out[k] = o[k];
  }
  if (!TIERS.includes(o.needed_tier)) return null;
  out.needed_tier = o.needed_tier;
  return out;
}

const rank = (t) => TIERS.indexOf(t);

export function combine(answers, { current, ceiling, maxTier = null, signalRed = false, midRun = false, thresholds }) {
  const th = thresholds ?? { capability: 0.6, claimsDone: 0.8 };
  const soft = (reason) => ({ action: midRun ? "keep" : "human", tier: current, reason });
  if (!answers) return { action: "keep", tier: current, reason: "respostas inválidas ou ausentes" };
  if (!midRun && signalRed && answers.claims_done_with_evidence >= th.claimsDone)
    return { action: "human", tier: current, reason: "relato diz concluído, sinal vermelho contradiz" };
  if (answers.failure_is_capability < th.capability) return soft("falha não é de capacidade");
  const top = capAtCeiling("top", ceiling, maxTier);
  if (!top || rank(current) >= rank(top)) return soft("tier atual já é o teto");
  const want = rank(answers.needed_tier) > rank(nextTier(current)) ? answers.needed_tier : nextTier(current);
  return { action: "escalate", tier: capAtCeiling(want, ceiling, maxTier), reason: "falha de capacidade" };
}
