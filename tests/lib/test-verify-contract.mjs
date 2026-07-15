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
// V1 (auditoria da fase V): node --import/--loader/--experimental-loader com data:/http: = código EXTERNO inline.
test('node --import data: → lança (código externo inline)', () => {
  assert.throws(() => readVerify(CFG(`verify:\n  unit: ["node", "--import", "data:text/javascript,console.log(1)", "m.mjs"]\n`)), /inline|import/i);
});
test('node --import=data: (com igual) → lança', () => {
  assert.throws(() => readVerify(CFG(`verify:\n  unit: ["node", "--import=data:text/javascript,1"]\n`)), /inline|import/i);
});
test('node --loader / --experimental-loader → lança', () => {
  assert.throws(() => readVerify(CFG(`verify:\n  unit: ["node", "--loader", "data:text/javascript,1", "m.mjs"]\n`)), /inline|loader/i);
  assert.throws(() => readVerify(CFG(`verify:\n  unit: ["node", "--experimental-loader=data:text/javascript,1"]\n`)), /inline|loader/i);
});
// V2 (auditoria da fase V): python -c colado (-cCODE) e cluster (-Ic/-Ec) escapavam de /^-c$/.
test('python3 -cCODE (colado) → lança', () => {
  assert.throws(() => readVerify(CFG(`verify:\n  unit: ["python3", "-cimport os"]\n`)), /inline/i);
});
test('python3 -Ic / -Ec (cluster com c) → lança', () => {
  assert.throws(() => readVerify(CFG(`verify:\n  unit: ["python3", "-Ic", "x"]\n`)), /inline/i);
  assert.throws(() => readVerify(CFG(`verify:\n  unit: ["python", "-Ec", "x"]\n`)), /inline/i);
});
test('python3 -m pytest permanece legítimo (não casa o guard de -c)', () => {
  assert.doesNotThrow(() => readVerify(CFG(`verify:\n  unit: ["python3", "-m", "pytest", "tests/"]\n`)));
});
// V3 (auditoria da fase V): grafia "verify :" (espaço antes de :) que o parser aceita mas o
// hasVerifyText não casava → downgrade silencioso. Deve fail-closed quando verify presente e inválido.
test('verify com espaço antes do : + valor inválido → lança (fail-closed, não warn-only)', () => {
  const cfg = `git:\n  strategy: branch-flow\nverify :\n  unit: &anchor ["bash","x.sh"]\n`;
  assert.throws(() => readVerify(cfg), /fail-closed|parse|inválid|presente/i);
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
