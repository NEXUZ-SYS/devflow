import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const read = (p) => readFileSync(resolve(import.meta.dirname, '../..', p), 'utf-8');

test('prevc-planning Step 5.5 emite requiredSignals', () => {
  const t = read('skills/prevc-planning/SKILL.md');
  assert.match(t, /requiredSignals/);
  assert.match(t, /unit|integration|e2e|lint/);
});
