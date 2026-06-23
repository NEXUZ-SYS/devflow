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

test('post-tool-use sai 0 mesmo sem CLAUDE_PLUGIN_ROOT sob set -u (invariante F4)', () => {
  const input = JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: 'a.mjs' }, tool_response: {} });
  const env = { ...process.env, DEVFLOW_INSTINCTS_ENABLED: '1', DEVFLOW_INSTINCT_PID: 'p1' };
  delete env.CLAUDE_PLUGIN_ROOT;   // simula Cursor/OMP ou variante sem essa env
  // execFileSync lança se exit != 0 — o hook NUNCA pode quebrar a sessão
  assert.doesNotThrow(() =>
    execFileSync('bash', [join(process.cwd(), 'hooks/post-tool-use')], { input, env }));
});
