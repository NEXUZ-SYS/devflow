#!/usr/bin/env node
// scripts/adr-decision.mjs — CLI fino sobre lib/adr-decision.mjs.
// Usado pelos SKILL.md das fases PREVC para aplicar a regra de ADR
// deterministicamente (julgamento dos sinais/relação vem do LLM).
//
// Divergência intencional do padrão dos outros CLIs ADR: NÃO há --format nem
// findProjectRoot — entrada é só por flags, saída é sempre JSON puro em stdout,
// não há arquivo/projectRoot a resolver.
//
// Usage:
//   adr-decision.mjs evaluate --non-trivial=BOOL --affects-stack=BOOL --alternatives=BOOL --guardrails=BOOL
//   adr-decision.mjs decide --relation=contradicts|extends|aligned|none [--name=<adrName>]

import { evaluateSignals, decideAction } from './lib/adr-decision.mjs';

const argv = process.argv.slice(2);
const sub = argv[0];
const flag = (name) => {
  const hit = argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
};
const bool = (name) => flag(name) === 'true';

try {
  if (sub === 'evaluate') {
    const trigger = evaluateSignals({
      nonTrivial: bool('non-trivial'),
      affectsStack: bool('affects-stack'),
      hasAlternatives: bool('alternatives'),
      impliesGuardrails: bool('guardrails'),
    });
    console.log(JSON.stringify({ trigger }));
  } else if (sub === 'decide') {
    console.log(JSON.stringify(decideAction({ relation: flag('relation'), adrName: flag('name') })));
  } else {
    console.error('Usage: adr-decision.mjs <evaluate|decide> [flags]');
    process.exit(2);
  }
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
