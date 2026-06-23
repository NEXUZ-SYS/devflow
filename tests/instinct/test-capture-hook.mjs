// tests/instinct/test-capture-hook.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const HOOK = join(process.cwd(), 'hooks/post-tool-use');

// Projeto-sandbox com .context/.devflow.yaml — N2: opt-in vem do YAML.
async function projectWith(instinctsYaml) {
  const d = await mkdtemp(join(tmpdir(), 'proj-'));
  await mkdir(join(d, '.context'), { recursive: true });
  await writeFile(join(d, '.context', '.devflow.yaml'), instinctsYaml);
  return d;
}
const input = JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: 'a.mjs' }, tool_response: {} });

test('post-tool-use captura quando opt-in no YAML (instincts.enabled:true)', async () => {
  const store = await mkdtemp(join(tmpdir(), 'hookstore-'));
  const proj = await projectWith('instincts:\n  enabled: true\n');
  execFileSync('bash', [HOOK], {
    input, cwd: proj,
    env: { ...process.env, DEVFLOW_INSTINCTS_DIR: store, DEVFLOW_INSTINCT_PID: 'p1', CLAUDE_PLUGIN_ROOT: process.cwd() },
  });
  const obs = await readFile(join(store, 'projects/p1/observations.jsonl'), 'utf-8');
  assert.match(obs, /"tool":"Edit"/);
});

test('post-tool-use NÃO captura sem opt-in no YAML (N2 — env não habilita)', async () => {
  const store = await mkdtemp(join(tmpdir(), 'hookstore-off-'));
  const proj = await projectWith('git:\n  strategy: branch-flow\n');  // sem instincts
  execFileSync('bash', [HOOK], {
    input, cwd: proj,
    // mesmo com a antiga env "habilitadora" setada, N2 exige opt-in no YAML
    env: { ...process.env, DEVFLOW_INSTINCTS_DIR: store, DEVFLOW_INSTINCT_PID: 'p1',
           DEVFLOW_INSTINCTS_ENABLED: '1', CLAUDE_PLUGIN_ROOT: process.cwd() },
  });
  await assert.rejects(readFile(join(store, 'projects/p1/observations.jsonl'), 'utf-8'),
    'sem opt-in YAML não deve existir observations.jsonl');
});

test('post-tool-use sai 0 mesmo sem CLAUDE_PLUGIN_ROOT sob set -u (invariante F4)', async () => {
  const proj = await projectWith('instincts:\n  enabled: true\n');  // habilitado, mas sem plugin root
  const env = { ...process.env, DEVFLOW_INSTINCT_PID: 'p1' };
  delete env.CLAUDE_PLUGIN_ROOT;
  assert.doesNotThrow(() => execFileSync('bash', [HOOK], { input, cwd: proj, env }));
});
