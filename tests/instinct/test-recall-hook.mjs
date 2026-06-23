// tests/instinct/test-recall-hook.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

async function projectWith(instinctsYaml) {
  const d = await mkdtemp(join(tmpdir(), 'proj-'));
  await mkdir(join(d, '.context'), { recursive: true });
  await writeFile(join(d, '.context', '.devflow.yaml'), instinctsYaml);
  return d;
}

test('session-start injeta digest de instincts active quando opt-in no YAML', async () => {
  const store = await mkdtemp(join(tmpdir(), 'recstore-'));
  const proj = await projectWith('instincts:\n  enabled: true\n');
  // semente: 1 instinct active via CLI (mine-apply não é gated por enabled)
  execFileSync('node', [join(process.cwd(), 'scripts/instinct-cli.mjs'), 'mine-apply', '--inline',
    JSON.stringify([{ id: 'rg', trigger: 'buscar', action: 'usar rg', domain: 'workflow', delta: 0.3 }])],
    { env: { ...process.env, DEVFLOW_INSTINCTS_DIR: store, DEVFLOW_INSTINCT_PID: 'p1' } });
  const out = execFileSync('bash', [join(process.cwd(), 'hooks/session-start')], {
    input: JSON.stringify({ source: 'startup' }), cwd: proj,
    env: { ...process.env, DEVFLOW_INSTINCTS_DIR: store, DEVFLOW_INSTINCT_PID: 'p1',
           CLAUDE_PLUGIN_ROOT: process.cwd() }, encoding: 'utf-8',
  });
  assert.match(out, /usar rg/);
});

test('session-start NÃO injeta digest sem opt-in no YAML (N2)', async () => {
  const store = await mkdtemp(join(tmpdir(), 'recstore-off-'));
  const proj = await projectWith('git:\n  strategy: branch-flow\n');  // sem instincts
  execFileSync('node', [join(process.cwd(), 'scripts/instinct-cli.mjs'), 'mine-apply', '--inline',
    JSON.stringify([{ id: 'rg', trigger: 'buscar', action: 'usar rg', domain: 'workflow', delta: 0.3 }])],
    { env: { ...process.env, DEVFLOW_INSTINCTS_DIR: store, DEVFLOW_INSTINCT_PID: 'p1' } });
  const out = execFileSync('bash', [join(process.cwd(), 'hooks/session-start')], {
    input: JSON.stringify({ source: 'startup' }), cwd: proj,
    env: { ...process.env, DEVFLOW_INSTINCTS_DIR: store, DEVFLOW_INSTINCT_PID: 'p1',
           DEVFLOW_INSTINCTS_ENABLED: '1', CLAUDE_PLUGIN_ROOT: process.cwd() }, encoding: 'utf-8',
  });
  assert.doesNotMatch(out, /usar rg/, 'sem opt-in YAML, env=1 não habilita recall (N2)');
});
