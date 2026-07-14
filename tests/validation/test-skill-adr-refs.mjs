// tests/validation/test-skill-adr-refs.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const read = (p) => readFileSync(resolve(root, p), 'utf-8');

test('planning referencia o CLI adr-decision', () =>
  assert.match(read('skills/prevc-planning/SKILL.md'), /adr-decision\.mjs/));
test('execution referencia adr-pending (append-candidate)', () => {
  const t = read('skills/prevc-execution/SKILL.md');
  assert.match(t, /adr-pending\.mjs/);
  assert.match(t, /append-candidate/);
});
test('confirmation referencia read-candidates, clear-pending e resolveAdrPath', () => {
  const t = read('skills/prevc-confirmation/SKILL.md');
  assert.match(t, /read-candidates/);
  assert.match(t, /clear-pending/);
  assert.match(t, /resolveAdrPath/);
});
test('review referencia o conflict gate', () =>
  assert.match(read('skills/prevc-review/SKILL.md'), /ADR conflict gate/));
test('validation cobre o path canônico engineering/adrs', () =>
  assert.match(read('skills/prevc-validation/SKILL.md'), /engineering\/adrs/));
