// scripts/lib/adr-decision.mjs
// adr-decision — regra determinística de disparo/ação de ADR no PREVC.
// Julgamento (sinais booleanos, relação) vem do LLM; a regra vive aqui (testável).
// Zero deps — Node stdlib only.

export function evaluateSignals(signals = {}) {
  const nonTrivial = Boolean(signals.nonTrivial);
  const affectsStack = Boolean(signals.affectsStack);
  const hasAlternatives = Boolean(signals.hasAlternatives);
  const impliesGuardrails = Boolean(signals.impliesGuardrails);
  const core = nonTrivial && affectsStack;                     // núcleo obrigatório
  const reinforcement = hasAlternatives || impliesGuardrails;  // ≥1 reforço
  return core && reinforcement;
}
