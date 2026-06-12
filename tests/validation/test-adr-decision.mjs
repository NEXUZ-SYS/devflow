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
