// tests/instinct/test-recall-hook.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

test('session-start injeta digest de instincts active', async () => {
  const store = await mkdtemp(join(tmpdir(), 'recstore-'));
  // semente: 1 instinct active via CLI
  execFileSync('node', [join(process.cwd(), 'scripts/instinct-cli.mjs'), 'mine-apply', '--inline',
    JSON.stringify([{ id: 'rg', trigger: 'buscar', action: 'usar rg', domain: 'workflow', delta: 0.3 }])],
    { env: { ...process.env, DEVFLOW_INSTINCTS_DIR: store, DEVFLOW_INSTINCT_PID: 'p1' } });
  const out = execFileSync('bash', [join(process.cwd(), 'hooks/session-start')], {
    input: JSON.stringify({ source: 'startup' }),
    env: { ...process.env, DEVFLOW_INSTINCTS_DIR: store, DEVFLOW_INSTINCT_PID: 'p1',
           DEVFLOW_INSTINCTS_ENABLED: '1', CLAUDE_PLUGIN_ROOT: process.cwd() }, encoding: 'utf-8',
  });
  assert.match(out, /usar rg/);
});
