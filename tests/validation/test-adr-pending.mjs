// tests/validation/test-adr-pending.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appendCandidate, readCandidates, clearPending, normalizePhrase } from '../../scripts/lib/adr-pending.mjs';

function fresh() { return mkdtempSync(join(tmpdir(), 'adr-pending-')); }
const FILE = (root) => join(root, '.context/workflow/.adr-pending.json');

test('readCandidates: arquivo ausente → []', () => {
  const root = fresh();
  try { assert.deepEqual(readCandidates(root), []); } finally { rmSync(root, { recursive: true, force: true }); }
});

test('appendCandidate: cria arquivo com envelope schema e persiste', () => {
  const root = fresh();
  try {
    appendCandidate(root, { phrase: 'Adotar Vitest', phase: 'E', relatedAdr: 'jest-config' });
    assert.deepEqual(readCandidates(root), [{ phrase: 'Adotar Vitest', phase: 'E', relatedAdr: 'jest-config' }]);
    const raw = JSON.parse(readFileSync(FILE(root), 'utf-8'));
    assert.equal(raw.schema, 1);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('readCandidates: tolera array cru legacy (schema 0)', () => {
  const root = fresh();
  try {
    mkdirSync(join(root, '.context/workflow'), { recursive: true });
    writeFileSync(FILE(root), JSON.stringify([{ phrase: 'X', phase: 'E', relatedAdr: null }]));
    assert.equal(readCandidates(root).length, 1);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('appendCandidate: dedup por frase normalizada (espaços + diacríticos)', () => {
  const root = fresh();
  try {
    appendCandidate(root, { phrase: 'Adoção de Zod', phase: 'E', relatedAdr: null });
    appendCandidate(root, { phrase: '  adocao   de zod ', phase: 'C', relatedAdr: null });
    assert.equal(readCandidates(root).length, 1);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('appendCandidate: relatedAdr default null', () => {
  const root = fresh();
  try {
    appendCandidate(root, { phrase: 'X', phase: 'E' });
    assert.equal(readCandidates(root)[0].relatedAdr, null);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('readCandidates: JSON corrompido → []', () => {
  const root = fresh();
  try {
    mkdirSync(join(root, '.context/workflow'), { recursive: true });
    writeFileSync(FILE(root), '{ não é json');
    assert.deepEqual(readCandidates(root), []);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('clearPending: remove candidatos', () => {
  const root = fresh();
  try {
    appendCandidate(root, { phrase: 'X', phase: 'E' });
    clearPending(root);
    assert.deepEqual(readCandidates(root), []);
    assert.equal(existsSync(FILE(root)), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('normalizePhrase: lowercase + colapso de espaços + sem diacríticos', () =>
  assert.equal(normalizePhrase('  Adoção   de Zod '), 'adocao de zod'));
