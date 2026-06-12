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

// adrName: o campo `name` do frontmatter (ex.: "observability-otel-genai"),
// repassado a `/devflow adr:evolve <name>` que resolve via query fuzzy.
// command/evolveHint são SUGESTÕES textuais — a classificação final do kind
// (patch/minor/major/refine) é do adr-builder EVOLVE via interview.
export function decideAction({ relation, adrName } = {}) {
  if (relation === 'aligned') return { action: 'silent' };
  if (relation === 'none') return { action: 'create', command: '/devflow adr:new --mode=prefilled' };
  if (relation === 'contradicts' || relation === 'extends') {
    if (!adrName) throw new Error('adrName required for evolve');
    const evolveHint = relation === 'contradicts' ? 'major' : 'minor';
    return { action: 'evolve', command: `/devflow adr:evolve ${adrName}`, evolveHint };
  }
  throw new Error(`unknown relation: ${relation}`);
}
