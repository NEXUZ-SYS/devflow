import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readVerify } from '../../scripts/lib/devflow-config.mjs';

test('.devflow.yaml do repo declara os 4 sinais apontando para os runners', () => {
  const src = readFileSync(resolve(import.meta.dirname, '../../.context/.devflow.yaml'), 'utf-8');
  const v = readVerify(src);
  assert.deepEqual(v.signals.unit, ['bash', 'tests/run-unit.sh']);
  assert.deepEqual(v.signals.integration, ['bash', 'tests/run-integration.sh']);
  assert.deepEqual(v.signals.e2e, ['bash', 'tests/run-e2e.sh']);
  assert.deepEqual(v.signals.lint, ['bash', 'tests/run-lint.sh']);
  assert.deepEqual(v.onTaskComplete, ['unit']);
});
