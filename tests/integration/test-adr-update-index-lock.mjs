// tests/integration/test-adr-update-index-lock.mjs
// Lock do adr-update-index (S4), exercitado pelo script real: só dono morto, prazo vencido
// ou arquivo antigo provam abandono — lock ilegível, sozinho, não.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, utimesSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'scripts', 'adr-update-index.mjs');

function project(t) {
  const root = mkdtempSync(join(tmpdir(), 'adr-lock-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const adrs = join(root, '.context', 'engineering', 'adrs');
  mkdirSync(adrs, { recursive: true });
  return { root, lock: join(adrs, '.lock') };
}

const nextNumber = (root) => spawnSync('node', [SCRIPT, '--next-number'], { cwd: root, encoding: 'utf-8' });

test('lock de dono vivo bloqueia o script', (t) => {
  const { root, lock } = project(t);
  writeFileSync(lock, JSON.stringify({ pid: process.pid, ts: Date.now() }));
  const r = nextNumber(root);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /could not acquire lock/);
  assert.equal(r.stdout, '');
});

test('lock recém-criado e ainda sem conteúdo não é tomado', (t) => {
  const { root, lock } = project(t);
  writeFileSync(lock, ''); // o dono já criou o arquivo ('wx') e ainda não gravou pid/ts
  const r = nextNumber(root);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /could not acquire lock/);
  assert.equal(r.stdout, '');
  assert.equal(readFileSync(lock, 'utf-8'), '');
});

test('lock sem conteúdo e antigo é recuperado', (t) => {
  const { root, lock } = project(t);
  writeFileSync(lock, '');
  const old = new Date(Date.now() - 60_000);
  utimesSync(lock, old, old);
  const r = nextNumber(root);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), '001');
  assert.equal(existsSync(lock), false);
});
