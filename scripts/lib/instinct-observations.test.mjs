// scripts/lib/instinct-observations.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as obs from './instinct-observations.mjs';

async function sandbox() {
  const d = await mkdtemp(join(tmpdir(), 'obs-'));
  process.env.DEVFLOW_INSTINCTS_DIR = d;
  return d;
}

test('append redige target antes de escrever', async () => {
  await sandbox();
  await obs.appendObservation('p1', { tool: 'Bash', target: 'curl joe@x.com', outcome: 'ok' });
  const { observations } = await obs.readUnconsumed('p1');
  assert.equal(observations.length, 1);
  assert.match(observations[0].target, /\[EMAIL\]/);
  assert.doesNotMatch(observations[0].target, /joe@x\.com/);
});

test('checkpoint evita reconsumo', async () => {
  await sandbox();
  await obs.appendObservation('p1', { tool: 'Edit', target: 'a.mjs', outcome: 'ok' });
  let r = await obs.readUnconsumed('p1');
  await obs.setCheckpoint('p1', r.offset);
  await obs.appendObservation('p1', { tool: 'Edit', target: 'b.mjs', outcome: 'ok' });
  r = await obs.readUnconsumed('p1');
  assert.equal(r.observations.length, 1);
  assert.equal(r.observations[0].target, 'b.mjs');
});

test('rotação descarta só consumidas, preserva não-mineradas e não reprocessa (C4/I3)', async () => {
  await sandbox();
  process.env.DEVFLOW_INSTINCT_MAX_BYTES = '120'; // cap minúsculo p/ forçar rotação
  for (let i = 0; i < 6; i++) await obs.appendObservation('p1', { tool: 'Edit', target: `f${i}.mjs`, outcome: 'ok' });
  // consome as 3 primeiras
  let r = await obs.readUnconsumed('p1');
  const firstThree = r.observations.slice(0, 3);
  await obs.setCheckpoint('p1', 3);
  // mais um append → dispara rotação (cap 120 bytes)
  await obs.appendObservation('p1', { tool: 'Edit', target: 'f6.mjs', outcome: 'ok' });
  r = await obs.readUnconsumed('p1');
  const targets = r.observations.map((o) => o.target);
  assert.ok(targets.includes('f6.mjs'), 'não-minerada recém-escrita preservada');
  assert.ok(!targets.includes(firstThree[0].target), 'consumida antiga descartada, não reprocessada');
  delete process.env.DEVFLOW_INSTINCT_MAX_BYTES;
});
