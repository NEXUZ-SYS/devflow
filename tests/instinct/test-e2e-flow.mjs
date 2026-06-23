// tests/instinct/test-e2e-flow.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const CLI = join(process.cwd(), 'scripts/instinct-cli.mjs');

test('captura → mine → recall → bridges (e2e)', async () => {
  const d = await mkdtemp(join(tmpdir(), 'e2e-'));
  const env = { ...process.env, DEVFLOW_INSTINCTS_DIR: d, DEVFLOW_INSTINCT_PID: 'p1', DEVFLOW_INSTINCTS_ENABLED: '1' };
  const run = (a) => execFileSync('node', [CLI, ...a], { env, encoding: 'utf-8' });

  run(['capture', '--tool=Bash', '--target=grep foo', '--outcome=ok']);
  const read = JSON.parse(run(['mine-read']));
  assert.ok(read.observations.length >= 1);
  // simula inferência da skill: reforça até 0.8
  run(['mine-apply', '--inline', JSON.stringify([{ id: 'use-rg', trigger: 'buscar', action: 'rg', delta: 0.5 }])]);
  const digest = run(['recall']);
  assert.match(digest, /rg/);
  const bridges = JSON.parse(run(['bridges']));
  assert.equal(bridges[0].id, 'use-rg');

  // sec (I3/N1): credencial capturada NUNCA aparece no store nem no digest
  run(['capture', '--tool=Bash', '--target=mysql --password=hunter2', '--outcome=ok']);
  const read2 = JSON.parse(run(['mine-read']));
  assert.ok(!JSON.stringify(read2).includes('hunter2'), 'credencial não vaza no store');
  assert.ok(!run(['recall']).includes('hunter2'), 'credencial não vaza no digest');
});
