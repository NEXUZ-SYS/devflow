// tests/validation/test-adr-decision.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSignals } from '../../scripts/lib/adr-decision.mjs';

// núcleo = nonTrivial && affectsStack ; reforço = hasAlternatives || impliesGuardrails
test('evaluateSignals: 4/4 dispara', () =>
  assert.equal(evaluateSignals({ nonTrivial: true, affectsStack: true, hasAlternatives: true, impliesGuardrails: true }), true));
test('evaluateSignals: núcleo + 1 reforço (alternativas) dispara', () =>
  assert.equal(evaluateSignals({ nonTrivial: true, affectsStack: true, hasAlternatives: true, impliesGuardrails: false }), true));
test('evaluateSignals: núcleo + 1 reforço (guardrails) dispara', () =>
  assert.equal(evaluateSignals({ nonTrivial: true, affectsStack: true, hasAlternatives: false, impliesGuardrails: true }), true));
test('evaluateSignals: núcleo sem reforço NÃO dispara', () =>
  assert.equal(evaluateSignals({ nonTrivial: true, affectsStack: true, hasAlternatives: false, impliesGuardrails: false }), false));
test('evaluateSignals: reforço sem núcleo (falta affectsStack) NÃO dispara', () =>
  assert.equal(evaluateSignals({ nonTrivial: true, affectsStack: false, hasAlternatives: true, impliesGuardrails: true }), false));
test('evaluateSignals: reforço sem núcleo (falta nonTrivial) NÃO dispara', () =>
  assert.equal(evaluateSignals({ nonTrivial: false, affectsStack: true, hasAlternatives: true, impliesGuardrails: true }), false));
test('evaluateSignals: campos ausentes tratados como false', () =>
  assert.equal(evaluateSignals({ nonTrivial: true, affectsStack: true }), false));

import { decideAction } from '../../scripts/lib/adr-decision.mjs';

test('decideAction: contradicts → evolve major', () =>
  assert.deepEqual(decideAction({ relation: 'contradicts', adrName: 'observability-otel-genai' }),
    { action: 'evolve', command: '/devflow adr:evolve observability-otel-genai', evolveHint: 'major' }));
test('decideAction: extends → evolve minor', () =>
  assert.deepEqual(decideAction({ relation: 'extends', adrName: 'observability-otel-genai' }),
    { action: 'evolve', command: '/devflow adr:evolve observability-otel-genai', evolveHint: 'minor' }));
test('decideAction: aligned → silent', () =>
  assert.deepEqual(decideAction({ relation: 'aligned', adrName: 'observability-otel-genai' }),
    { action: 'silent' }));
test('decideAction: none → create', () =>
  assert.deepEqual(decideAction({ relation: 'none' }),
    { action: 'create', command: '/devflow adr:new --mode=prefilled' }));
test('decideAction: relação inválida lança', () =>
  assert.throws(() => decideAction({ relation: 'foo' }), /unknown relation/));
test('decideAction: evolve sem adrName lança', () =>
  assert.throws(() => decideAction({ relation: 'contradicts' }), /adrName required/));

import { parseGuardrailsBlock } from '../../scripts/lib/adr-decision.mjs';

const BLOCK_FILTER = `<ADR_GUARDRAILS filtered="true">
Loaded 2 of 6 active ADR(s), filtered for task: "x".

### observability-otel-genai [firm] (stack: universal)
NUNCA logar payload bruto.

### permissions-vendor-neutral [proposto] (stack: universal)
SEMPRE deny-first.
</ADR_GUARDRAILS>`;

const BLOCK_HOOK = `<ADR_GUARDRAILS>
### adr-path-migration-to-context-root (stack: universal)
SEMPRE usar resolveAdrPath.
</ADR_GUARDRAILS>`;

test('parseGuardrailsBlock: formato adr-filter (com tags)', () =>
  assert.deepEqual(parseGuardrailsBlock(BLOCK_FILTER), [
    { name: 'observability-otel-genai', stack: 'universal', tags: ['firm'] },
    { name: 'permissions-vendor-neutral', stack: 'universal', tags: ['proposto'] },
  ]));
test('parseGuardrailsBlock: formato hook (sem tags)', () =>
  assert.deepEqual(parseGuardrailsBlock(BLOCK_HOOK), [
    { name: 'adr-path-migration-to-context-root', stack: 'universal', tags: [] },
  ]));
test('parseGuardrailsBlock: bloco sem ADRs → []', () =>
  assert.deepEqual(parseGuardrailsBlock('<ADR_GUARDRAILS>\nnada\n</ADR_GUARDRAILS>'), []));
test('parseGuardrailsBlock: entrada vazia/nula → []', () => {
  assert.deepEqual(parseGuardrailsBlock(''), []);
  assert.deepEqual(parseGuardrailsBlock(null), []);
});
