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
