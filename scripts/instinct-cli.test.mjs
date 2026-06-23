// scripts/instinct-cli.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const CLI = new URL('./instinct-cli.mjs', import.meta.url).pathname;
function run(args, env) {
  return execFileSync('node', [CLI, ...args], { env: { ...process.env, ...env }, encoding: 'utf-8' });
}

test('capture + recall round-trip', async () => {
  const d = await mkdtemp(join(tmpdir(), 'cli-'));
  const env = { DEVFLOW_INSTINCTS_DIR: d, DEVFLOW_INSTINCT_PID: 'p1', DEVFLOW_INSTINCTS_ENABLED: '1' };
  run(['mine-apply', '--inline', JSON.stringify([{ id: 'rg', trigger: 'buscar', action: 'rg', domain: 'workflow', delta: 0.3 }])], env);
  const out = run(['recall'], env);
  assert.match(out, /rg/);
});
