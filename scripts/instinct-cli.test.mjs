// scripts/instinct-cli.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
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

test('promote via CLI promove instinct cross-project para global', async () => {
  const d = await mkdtemp(join(tmpdir(), 'cli-promo-'));
  const item = JSON.stringify([{ id: 'rg', trigger: 'b', action: 'rg', domain: 'workflow', delta: 0.5 }]);
  run(['mine-apply', '--inline', item], { DEVFLOW_INSTINCTS_DIR: d, DEVFLOW_INSTINCT_PID: 'p1' });
  run(['mine-apply', '--inline', item], { DEVFLOW_INSTINCTS_DIR: d, DEVFLOW_INSTINCT_PID: 'p2' });
  const promoted = JSON.parse(run(['promote'], { DEVFLOW_INSTINCTS_DIR: d, DEVFLOW_INSTINCT_PID: 'p1' }));
  assert.ok(promoted.includes('rg'), 'rg promovido (visto em p1 e p2)');
});

test('capture gated por N2: só registra com instincts.enabled:true no YAML', async () => {
  const store = await mkdtemp(join(tmpdir(), 'cap-n2-'));
  const mkProj = async (yaml) => {
    const d = await mkdtemp(join(tmpdir(), 'proj-'));
    await mkdir(join(d, '.context'), { recursive: true });
    await writeFile(join(d, '.context', '.devflow.yaml'), yaml);
    return d;
  };
  const projOff = await mkProj('git:\n  strategy: branch-flow\n');           // sem opt-in
  const projOn = await mkProj('instincts:\n  enabled: true\n');               // opt-in YAML
  const env = { ...process.env, DEVFLOW_INSTINCTS_DIR: store, DEVFLOW_INSTINCT_PID: 'p1' };
  const cap = (cwd) => execFileSync('node', [CLI, 'capture', '--tool=Bash', '--target=grep x'], { env, cwd, encoding: 'utf-8' });
  cap(projOff);  // N2: sem opt-in YAML → no-op (env não habilita)
  cap(projOn);   // opt-in YAML → captura
  const read = JSON.parse(execFileSync('node', [CLI, 'mine-read'], { env, encoding: 'utf-8' }));
  assert.equal(read.observations.length, 1, 'só a captura com opt-in YAML registra');
});

test('bridges lista só elegíveis (≥0.8 ou global)', async () => {
  const d = await mkdtemp(join(tmpdir(), 'br-'));
  const env = { DEVFLOW_INSTINCTS_DIR: d, DEVFLOW_INSTINCT_PID: 'p1' };
  run(['mine-apply', '--inline', JSON.stringify([
    { id: 'hi', trigger: 't', action: 'a', delta: 0.5 },   // 0.8 elegível
    { id: 'lo', trigger: 't2', action: 'a2', delta: 0.2 }, // 0.5 não
  ])], env);
  const out = JSON.parse(run(['bridges'], env));
  assert.deepEqual(out.map((x) => x.id), ['hi']);
});
