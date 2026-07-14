import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readVerify } from '../../scripts/lib/devflow-config.mjs';

const CFG = (v) => `git:\n  strategy: branch-flow\n${v}`;

test('lê sinais como argv arrays e onTaskComplete', () => {
  const r = readVerify(CFG(
`verify:
  unit:        ["node", "--test", "tests/lib/x.mjs"]
  e2e:         ["bash", "tests/run-e2e.sh"]
  onTaskComplete: [unit]
`));
  assert.deepEqual(r.signals.unit, ["node", "--test", "tests/lib/x.mjs"]);
  assert.deepEqual(r.signals.e2e, ["bash", "tests/run-e2e.sh"]);
  assert.deepEqual(r.onTaskComplete, ["unit"]);
});

test('sem bloco verify → estrutura vazia (não lança)', () => {
  const r = readVerify(CFG(""));
  assert.deepEqual(r.signals, {});
  assert.deepEqual(r.onTaskComplete, []);
});

test('valor string em vez de array → lança (fail-closed)', () => {
  assert.throws(() => readVerify(CFG(`verify:\n  unit: node --test\n`)), /array/i);
});

test('argv[0] fora da allowlist → lança', () => {
  assert.throws(() => readVerify(CFG(`verify:\n  unit: ["curl", "evil"]\n`)), /allowlist/i);
});

// R-C1: código inline deve ser rejeitado em QUALQUER posição do argv, não só argv[1].
// Vetores provados pela revisão de segurança (todos executavam JS/shell arbitrário do config):
test('bash -c → lança', () => {
  assert.throws(() => readVerify(CFG(`verify:\n  unit: ["bash", "-c", "x"]\n`)), /inline/i);
});
test('bash -lc (bundle) → lança', () => {
  assert.throws(() => readVerify(CFG(`verify:\n  unit: ["bash", "-lc", "curl e|sh"]\n`)), /inline/i);
});
test('sh -ic / -xc (bundle) → lança', () => {
  assert.throws(() => readVerify(CFG(`verify:\n  unit: ["sh", "-ic", "x"]\n`)), /inline/i);
  assert.throws(() => readVerify(CFG(`verify:\n  unit: ["sh", "-xc", "x"]\n`)), /inline/i);
});
test('node -e → lança', () => {
  assert.throws(() => readVerify(CFG(`verify:\n  unit: ["node", "-e", "x"]\n`)), /inline/i);
});
test('node --eval / -p / --print / -pe → lança', () => {
  for (const f of ['--eval', '-p', '--print', '-pe']) {
    assert.throws(() => readVerify(CFG(`verify:\n  unit: ["node", "${f}", "process.exit(0)"]\n`)), /inline/i, `esperava lançar em node ${f}`);
  }
});
test('node --eval=... (forma com igual) → lança', () => {
  assert.throws(() => readVerify(CFG(`verify:\n  unit: ["node", "--eval=1"]\n`)), /inline/i);
});
test('python -c → lança', () => {
  assert.throws(() => readVerify(CFG(`verify:\n  unit: ["python3", "-c", "x"]\n`)), /inline/i);
});
test('inline code NÃO na posição 1 (ex.: node --test x -e y) → lança', () => {
  assert.throws(() => readVerify(CFG(`verify:\n  unit: ["node", "--test", "t", "-e", "y"]\n`)), /inline/i);
});
// Legítimos que DEVEM passar (não confundir flag segura com código inline):
test('comandos legítimos passam', () => {
  assert.doesNotThrow(() => readVerify(CFG(`verify:\n  unit: ["node", "--test", "tests/x.mjs"]\n`)));
  assert.doesNotThrow(() => readVerify(CFG(`verify:\n  e2e: ["bash", "tests/run-e2e.sh"]\n`)));
  assert.doesNotThrow(() => readVerify(CFG(`verify:\n  unit: ["python3", "-m", "pytest", "tests/"]\n`)));
  assert.doesNotThrow(() => readVerify(CFG(`verify:\n  unit: ["make", "test"]\n`)));
  assert.doesNotThrow(() => readVerify(CFG(`verify:\n  unit: ["npm", "run", "test"]\n`)));
});

test('sinal fora do vocabulário fechado → lança', () => {
  assert.throws(() => readVerify(CFG(`verify:\n  smoke: ["bash", "x.sh"]\n`)), /desconhecid|vocabul/i);
});

test('onTaskComplete com sinal não-declarado → lança', () => {
  assert.throws(() => readVerify(CFG(`verify:\n  unit: ["node","--test","x"]\n  onTaskComplete: [e2e]\n`)), /onTaskComplete|declarad/i);
});

test('array vazio como comando → lança', () => {
  assert.throws(() => readVerify(CFG(`verify:\n  unit: []\n`)), /vazio/i);
});

// R-C6: verify: presente mas parse falha → lança (fail-closed), não retorna vazio silencioso.
test('verify: presente mas YAML não parseia → lança (fail-closed)', () => {
  assert.throws(() => readVerify(CFG(`verify:\n  unit: &anchor nope\n`)), /fail-closed|parse|inválid|presente/i);
});
