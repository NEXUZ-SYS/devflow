import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appendEntry, readEntries, lastEntry, consecutiveReds } from '../../scripts/lib/verify-ledger.mjs';

const mk = () => mkdtempSync(join(tmpdir(), 'ledger-'));

test('append preserva ordem e readEntries devolve todas', () => {
  const r = mk();
  appendEntry(r, { signal: 'unit', exit: 1, at: 'a' });
  appendEntry(r, { signal: 'unit', exit: 0, at: 'b' });
  const e = readEntries(r);
  assert.equal(e.length, 2);
  assert.equal(e[0].at, 'a'); assert.equal(e[1].at, 'b');
});

test('lastEntry devolve a última do sinal', () => {
  const r = mk();
  appendEntry(r, { signal: 'unit', exit: 1 });
  appendEntry(r, { signal: 'e2e', exit: 0 });
  appendEntry(r, { signal: 'unit', exit: 0 });
  assert.equal(lastEntry(r, 'unit').exit, 0);
  assert.equal(lastEntry(r, 'lint'), null);
});

test('linha malformada é ignorada, não derruba o leitor', () => {
  const r = mk();
  mkdirSync(join(r, '.context', 'runtime'), { recursive: true });
  writeFileSync(join(r, '.context', 'runtime', 'verify-ledger.jsonl'),
    '{"signal":"unit","exit":0}\n{ not json \n{"signal":"e2e","exit":1}\n');
  const e = readEntries(r);
  assert.equal(e.length, 2);
});

test('consecutiveReds conta REDs seguidos do mesmo sinal desde o último GREEN', () => {
  const r = mk();
  appendEntry(r, { signal: 'unit', exit: 0 });
  appendEntry(r, { signal: 'unit', exit: 1 });
  appendEntry(r, { signal: 'unit', exit: 1 });
  appendEntry(r, { signal: 'unit', exit: 1 });
  assert.equal(consecutiveReds(r, 'unit'), 3);
});

test('consecutiveReds zera após um GREEN', () => {
  const r = mk();
  appendEntry(r, { signal: 'unit', exit: 1 });
  appendEntry(r, { signal: 'unit', exit: 0 });
  assert.equal(consecutiveReds(r, 'unit'), 0);
});

test('readEntries em repo sem ledger → []', () => {
  assert.deepEqual(readEntries(mk()), []);
});
