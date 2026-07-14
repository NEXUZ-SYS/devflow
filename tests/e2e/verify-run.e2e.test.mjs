import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runSignal } from '../../scripts/lib/verify-run.mjs';
import { lastEntry } from '../../scripts/lib/verify-ledger.mjs';

function repo(verifyBlock) {
  const d = mkdtempSync(join(tmpdir(), 'run-'));
  const g = (...a) => execFileSync('git', ['-C', d, ...a], { encoding: 'utf8' });
  execFileSync('git', ['init', '-q', '-b', 'main', d]);
  g('config', 'user.email', 't@t'); g('config', 'user.name', 't');
  mkdirSync(join(d, '.context'), { recursive: true });
  writeFileSync(join(d, '.context', '.devflow.yaml'), `git:\n  strategy: branch-flow\n${verifyBlock}`);
  writeFileSync(join(d, 'a.txt'), 'x'); g('add', '-A'); g('commit', '-q', '-m', 'i');
  return d;
}

test('sinal verde: exit 0, ledger ganha entrada com digest atual', () => {
  const d = repo(`verify:\n  unit: ["bash", "ok.sh"]\n`);
  writeFileSync(join(d, 'ok.sh'), 'exit 0\n');
  const r = runSignal('unit', { root: d, phase: 'E' });
  assert.equal(r.exit, 0);
  assert.equal(r.signal, 'unit');
  assert.equal(typeof r.treeDigest, 'string');
  assert.equal(lastEntry(d, 'unit').exit, 0);
});

test('sinal vermelho: exit propagado para o ledger', () => {
  const d = repo(`verify:\n  unit: ["bash", "fail.sh"]\n`);
  writeFileSync(join(d, 'fail.sh'), 'exit 3\n');
  const r = runSignal('unit', { root: d, phase: 'E' });
  assert.equal(r.exit, 3);
  assert.equal(lastEntry(d, 'unit').exit, 3);
});

test('sinal não declarado → throw', () => {
  const d = repo(`verify:\n  unit: ["bash", "ok.sh"]\n`);
  assert.throws(() => runSignal('e2e', { root: d }), /não declarado|not declared/i);
});
