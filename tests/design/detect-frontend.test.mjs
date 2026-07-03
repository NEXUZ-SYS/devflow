// Task D1 — detect-frontend: detecção determinística de projeto front-end.
// Invariantes de segurança (Revisão R): JSON.parse seguro (malformado → não crash),
// glob sem seguir symlink, excluindo node_modules/.git, profundidade limitada.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectFrontend } from '../../scripts/design/detect-frontend.mjs';

function tmp(prefix) {
  return mkdtempSync(join(tmpdir(), prefix));
}

test('detecta front-end por dep react', () => {
  const d = tmp('df-react-');
  writeFileSync(join(d, 'package.json'), JSON.stringify({ dependencies: { react: '19' } }));
  const r = detectFrontend(d);
  assert.equal(r.isFrontend, true);
  assert.ok(r.signals.some((s) => /react/.test(s)));
});

test('backend-only (express) não é front-end', () => {
  const d = tmp('df-be-');
  writeFileSync(join(d, 'package.json'), JSON.stringify({ dependencies: { express: '4' } }));
  assert.equal(detectFrontend(d).isFrontend, false);
});

test('detecta por arquivo .tsx mesmo sem dep de framework', () => {
  const d = tmp('df-tsx-');
  mkdirSync(join(d, 'src'));
  writeFileSync(join(d, 'src', 'App.tsx'), 'export const x = 1;');
  assert.equal(detectFrontend(d).isFrontend, true);
});

test('package.json malformado → não-frontend, sem throw (segurança)', () => {
  const d = tmp('df-bad-');
  writeFileSync(join(d, 'package.json'), '{ isto não é json ');
  assert.doesNotThrow(() => detectFrontend(d));
  assert.equal(detectFrontend(d).isFrontend, false);
});

test('não vasculha node_modules (glob seguro)', () => {
  const d = tmp('df-nm-');
  mkdirSync(join(d, 'node_modules', 'x'), { recursive: true });
  writeFileSync(join(d, 'node_modules', 'x', 'C.tsx'), 'x');
  // só há .tsx dentro de node_modules → NÃO deve contar como front-end
  assert.equal(detectFrontend(d).isFrontend, false);
});

test('register default é null (resolvido no init)', () => {
  const d = tmp('df-reg-');
  writeFileSync(join(d, 'package.json'), JSON.stringify({ dependencies: { next: '15' } }));
  assert.equal(detectFrontend(d).register, null);
});
