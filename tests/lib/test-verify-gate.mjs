import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { evaluateGate } from '../../scripts/lib/verify-gate.mjs';
import { appendEntry } from '../../scripts/lib/verify-ledger.mjs';
import { treeDigest } from '../../scripts/lib/verify-tree-digest.mjs';

function repo(verifyBlock) {
  const d = mkdtempSync(join(tmpdir(), 'gate-'));
  const g = (...a) => execFileSync('git', ['-C', d, ...a], { encoding: 'utf8' });
  execFileSync('git', ['init', '-q', '-b', 'main', d]);
  g('config','user.email','t@t'); g('config','user.name','t');
  mkdirSync(join(d, '.context'), { recursive: true });
  writeFileSync(join(d, '.context', '.devflow.yaml'), `git:\n  strategy: branch-flow\n${verifyBlock}`);
  writeFileSync(join(d, 'a.txt'), 'x'); g('add','-A'); g('commit','-q','-m','i');
  return d;
}
const V = `verify:\n  unit: ["bash","ok.sh"]\n`;

test('sem verify: → warn-only, pass', () => {
  const d = repo("");
  const r = evaluateGate({ root: d, requiredSignals: ['unit'] });
  assert.equal(r.pass, true); assert.equal(r.warnOnly, true);
});
test('ledger vazio → BLOCK "sem observação"', () => {
  const d = repo(V);
  const r = evaluateGate({ root: d, requiredSignals: ['unit'] });
  assert.equal(r.pass, false);
  assert.match(r.blocks[0].reason, /sem observ|afirmaria/i);
});
test('digest vencido → BLOCK', () => {
  const d = repo(V);
  appendEntry(d, { signal: 'unit', exit: 0, treeDigest: 'STALE', at: 'x' });
  const r = evaluateGate({ root: d, requiredSignals: ['unit'] });
  assert.equal(r.pass, false); assert.match(r.blocks[0].reason, /vencid|stale/i);
});
test('exit≠0 → BLOCK', () => {
  const d = repo(V);
  appendEntry(d, { signal: 'unit', exit: 1, treeDigest: treeDigest(d), at: 'x' });
  const r = evaluateGate({ root: d, requiredSignals: ['unit'] });
  assert.equal(r.pass, false); assert.match(r.blocks[0].reason, /vermelho|exit/i);
});
test('verde com digest atual → PASS', () => {
  const d = repo(V);
  appendEntry(d, { signal: 'unit', exit: 0, treeDigest: treeDigest(d), at: 'x' });
  const r = evaluateGate({ root: d, requiredSignals: ['unit'] });
  assert.equal(r.pass, true); assert.equal(r.warnOnly, false);
});
// R-C6: verify: presente mas o .devflow.yaml não parseia → BLOCK ruidoso, NUNCA warn-only-pass nem crash.
test('verify: presente mas parse falha → BLOCK (não warn-only, não stack trace)', () => {
  const d = repo(`verify:\n  unit: ["bash", "ok.sh"]\n  bad: &anchor nope\n`); // âncora YAML → readVerify lança
  const r = evaluateGate({ root: d, requiredSignals: ['unit'] });
  assert.equal(r.pass, false);
  assert.match(r.blocks[0].reason, /inválid|fail-closed|parse/i);
});
