import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectWeakenings } from '../../scripts/lib/devflow-config-guard.mjs';

const withVerify = (body) => `git:\n  strategy: branch-flow\n  protectedBranches: [main]\nverify:\n${body}`;

test('remover um sinal declarado → enfraquecimento', () => {
  const cur = withVerify(`  unit: ["node","--test","x"]\n  e2e: ["bash","run-e2e.sh"]\n`);
  const prop = withVerify(`  unit: ["node","--test","x"]\n`);
  const w = detectWeakenings(cur, prop);
  assert.ok(w.some(x => /verify.*e2e|sinal.*remov/i.test(x)), `esperava weakening de verify.e2e, obtive: ${JSON.stringify(w)}`);
});

test('trocar comando por no-op (-c) → enfraquecimento (via readVerify que lança)', () => {
  const cur = withVerify(`  unit: ["node","--test","x"]\n`);
  const prop = withVerify(`  unit: ["bash","-c","true"]\n`);
  const w = detectWeakenings(cur, prop);
  assert.ok(w.some(x => /verify.*inválid|inseguro|inline/i.test(x)), `esperava weakening por proposto inseguro, obtive: ${JSON.stringify(w)}`);
});

test('trocar comando por inline node --eval → enfraquecimento', () => {
  const cur = withVerify(`  unit: ["node","--test","x"]\n`);
  const prop = withVerify(`  unit: ["node","--eval","0"]\n`);
  const w = detectWeakenings(cur, prop);
  assert.ok(w.some(x => /verify.*inválid|inseguro|inline/i.test(x)));
});

test('manter os sinais → sem enfraquecimento de verify', () => {
  const cfg = withVerify(`  unit: ["node","--test","x"]\n`);
  assert.equal(detectWeakenings(cfg, cfg).filter(x => /verify/i.test(x)).length, 0);
});

test('regressão: enfraquecimento de git.* ainda detectado', () => {
  const cur = `git:\n  strategy: branch-flow\n  branchProtection: true\n  protectedBranches: [main]\n`;
  const prop = `git:\n  strategy: branch-flow\n  branchProtection: false\n  protectedBranches: [main]\n`;
  assert.ok(detectWeakenings(cur, prop).some(x => /branchProtection/i.test(x)));
});
