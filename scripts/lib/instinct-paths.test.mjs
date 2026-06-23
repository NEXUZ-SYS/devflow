// scripts/lib/instinct-paths.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import * as p from './instinct-paths.mjs';

test('baseDir respeita override absoluto', () => {
  process.env.DEVFLOW_INSTINCTS_DIR = '/tmp/abs-store';
  assert.equal(p.baseDir(), '/tmp/abs-store');
  delete process.env.DEVFLOW_INSTINCTS_DIR;
});

test('projectId estável e normaliza credenciais/.git', () => {
  const a = p.projectId('https://x:y@github.com/NEXUZ-SYS/devflow.git');
  const b = p.projectId('https://github.com/NEXUZ-SYS/devflow');
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{12}$/);
});

test('paths derivam de baseDir + id', () => {
  process.env.DEVFLOW_INSTINCTS_DIR = '/tmp/s';
  const id = 'abc123abc123';
  assert.equal(p.observationsFile(id), join('/tmp/s', 'projects', id, 'observations.jsonl'));
  delete process.env.DEVFLOW_INSTINCTS_DIR;
});
