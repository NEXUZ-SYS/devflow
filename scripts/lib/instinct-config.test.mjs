// scripts/lib/instinct-config.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isEnabled, profile } from './instinct-config.mjs';

async function projectWith(yaml) {
  const d = await mkdtemp(join(tmpdir(), 'cfg-'));
  await mkdir(join(d, '.context'), { recursive: true });
  await writeFile(join(d, '.context', '.devflow.yaml'), yaml);
  return d;
}
const ON = 'git:\n  strategy: branch-flow\ninstincts:\n  enabled: true\n  profile: minimal   # comentário inline\n';
const OFF = 'instincts:\n  enabled: false\n';
const NONE = 'git:\n  strategy: branch-flow\n';

test('YAML enabled:true habilita (piso opt-in) + lê profile com comentário', async () => {
  const d = await projectWith(ON);
  assert.equal(await isEnabled(d, {}), true);
  assert.equal(await profile(d, {}), 'minimal');
});

test('YAML enabled:false ou seção ausente → desligado', async () => {
  assert.equal(await isEnabled(await projectWith(OFF), {}), false);
  assert.equal(await isEnabled(await projectWith(NONE), {}), false);
});

test('env DEVFLOW_INSTINCTS_ENABLED=0 restringe mesmo com YAML true (N2)', async () => {
  const d = await projectWith(ON);
  assert.equal(await isEnabled(d, { DEVFLOW_INSTINCTS_ENABLED: '0' }), false);
});

test('env DEVFLOW_INSTINCT_PROFILE=off restringe mesmo com YAML true (N2)', async () => {
  const d = await projectWith(ON);
  assert.equal(await isEnabled(d, { DEVFLOW_INSTINCT_PROFILE: 'off' }), false);
});

test('env NUNCA habilita o que o YAML desligou — piso de privacidade (N2)', async () => {
  const d = await projectWith(OFF);
  assert.equal(await isEnabled(d, { DEVFLOW_INSTINCTS_ENABLED: '1' }), false);
  assert.equal(await isEnabled(await projectWith(NONE), { DEVFLOW_INSTINCTS_ENABLED: '1' }), false);
});
