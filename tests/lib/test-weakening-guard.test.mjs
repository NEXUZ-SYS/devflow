import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { evaluateWeakening } from '../../scripts/lib/test-weakening-guard.mjs';

function repoWith(baseFiles, headFiles, { trailer } = {}) {
  const d = mkdtempSync(join(tmpdir(), 'weak-'));
  const g = (...a) => execFileSync('git', ['-C', d, ...a], { encoding: 'utf8' });
  execFileSync('git', ['init', '-q', '-b', 'main', d]);
  g('config', 'user.email', 't@t'); g('config', 'user.name', 't');
  for (const [p, c] of Object.entries(baseFiles)) writeFileSync(join(d, p), c);
  g('add', '-A'); g('commit', '-q', '-m', 'base');
  // O head vai numa branch de trabalho para que `main` fique como merge-base real
  // (senão HEAD e main apontam para o mesmo commit e merge-base=HEAD → nada a comparar).
  g('checkout', '-q', '-b', 'feature');
  for (const p of Object.keys(baseFiles)) if (!(p in headFiles)) rmSync(join(d, p));
  for (const [p, c] of Object.entries(headFiles)) writeFileSync(join(d, p), c);
  g('add', '-A'); g('commit', '-q', '--allow-empty', '-m', trailer ? `head\n\nWeakens-Tests: ${trailer}` : 'head');
  return d;
}
const HDR = "import{test}from'node:test';import assert from'node:assert';\n";
const TWO = HDR + "test('x',()=>{assert.equal(1,1);assert.equal(2,2);});\n";
const ONE = HDR + "test('x',()=>{assert.equal(1,1);});\n";
const SKIP = HDR + "test.skip('x',()=>{assert.equal(1,1);assert.equal(2,2);});\n";

test('teste deletado → BLOCK', () => {
  const d = repoWith({ 'test-a.mjs': TWO }, {});
  assert.equal(evaluateWeakening({ root: d, baseRef: 'main' }).blocked, true);
});
test('.skip adicionado → BLOCK', () => {
  const d = repoWith({ 'test-a.mjs': TWO }, { 'test-a.mjs': SKIP });
  assert.equal(evaluateWeakening({ root: d, baseRef: 'main' }).blocked, true);
});
test('assert removido (2→1) → BLOCK', () => {
  const d = repoWith({ 'test-a.mjs': TWO }, { 'test-a.mjs': ONE });
  assert.equal(evaluateWeakening({ root: d, baseRef: 'main' }).blocked, true);
});
test('teste novo → livre (PASS)', () => {
  const d = repoWith({ 'test-a.mjs': TWO }, { 'test-a.mjs': TWO, 'test-b.mjs': ONE });
  assert.equal(evaluateWeakening({ root: d, baseRef: 'main' }).blocked, false);
});
test('assert adicionado → livre', () => {
  const d = repoWith({ 'test-a.mjs': ONE }, { 'test-a.mjs': TWO });
  assert.equal(evaluateWeakening({ root: d, baseRef: 'main' }).blocked, false);
});
test('trailer Weakens-Tests: libera o enfraquecimento', () => {
  const d = repoWith({ 'test-a.mjs': TWO }, { 'test-a.mjs': ONE }, { trailer: 'refactor funde asserts' });
  assert.equal(evaluateWeakening({ root: d, baseRef: 'main' }).blocked, false);
});
// R-C3: merge-base ausente é fail-OPEN local mas fail-CLOSED em CI (defesa não pode desligar em silêncio no árbitro).
test('merge-base ausente: local → skip (não bloqueia)', () => {
  const d = repoWith({ 'test-a.mjs': TWO }, { 'test-a.mjs': TWO });
  assert.equal(evaluateWeakening({ root: d, baseRef: 'inexistente-xyz' }).blocked, false);
});
test('merge-base ausente: CI → BLOCK (fail-closed)', () => {
  const d = repoWith({ 'test-a.mjs': TWO }, { 'test-a.mjs': TWO });
  const r = evaluateWeakening({ root: d, baseRef: 'inexistente-xyz', ci: true });
  assert.equal(r.blocked, true);
  assert.match(r.violations[0], /merge-base|fail-closed/i);
});
