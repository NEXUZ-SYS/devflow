// tests/instinct/test-capture-hook.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

test('post-tool-use captura observação quando enabled', async () => {
  const store = await mkdtemp(join(tmpdir(), 'hookstore-'));
  const input = JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: 'a.mjs' }, tool_response: {} });
  execFileSync('bash', [join(process.cwd(), 'hooks/post-tool-use')], {
    input,
    env: { ...process.env, DEVFLOW_INSTINCTS_DIR: store, DEVFLOW_INSTINCT_PID: 'p1',
           DEVFLOW_INSTINCTS_ENABLED: '1', CLAUDE_PLUGIN_ROOT: process.cwd() },
  });
  const obs = await readFile(join(store, 'projects/p1/observations.jsonl'), 'utf-8');
  assert.match(obs, /"tool":"Edit"/);
});
