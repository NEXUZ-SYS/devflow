// scripts/lib/instinct-confidence.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as c from './instinct-confidence.mjs';

test('reforço soma 0.1 com cap 0.9', () => {
  assert.equal(c.reinforce(0.3), 0.4);
  assert.equal(c.reinforce(0.85), 0.9);
  assert.equal(c.reinforce(0.9), 0.9);
});

test('correção soma 0.2 com cap', () => {
  assert.equal(c.applyCorrection(0.3), 0.5);
  assert.equal(c.applyCorrection(0.8), 0.9);
});

test('status por limiar 0.6', () => {
  assert.equal(c.statusFor(0.59), 'pending');
  assert.equal(c.statusFor(0.6), 'active');
});

test('elegibilidade de ponte: 0.8 ou global', () => {
  assert.equal(c.eligibleForBridge({ confidence: 0.8, scope: 'project' }), true);
  assert.equal(c.eligibleForBridge({ confidence: 0.5, scope: 'global' }), true);
  assert.equal(c.eligibleForBridge({ confidence: 0.5, scope: 'project' }), false);
});

test('triggerKey normaliza para pré-filtro', () => {
  assert.equal(c.triggerKey('  Ao  Buscar Texto '), 'ao buscar texto');
});
