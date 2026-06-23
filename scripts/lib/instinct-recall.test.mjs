// scripts/lib/instinct-recall.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as store from './instinct-store.mjs';
import { buildDigest } from './instinct-recall.mjs';

test('digest inclui active e exclui pending, respeita maxChars', async () => {
  const d = await mkdtemp(join(tmpdir(), 'rec-'));
  process.env.DEVFLOW_INSTINCTS_DIR = d;
  const m = (id, c) => ({ trigger: `t-${id}`, action: `a-${id}`, domain: 'workflow', scope: 'project', projectId: 'p1', projectName: 'demo' });
  await store.upsertInstinct('hi', m('hi'), 0.3);   // 0.6 active
  await store.upsertInstinct('lo', m('lo'), 0);     // 0.3 pending
  const out = await buildDigest('p1', { maxChars: 2000, minConfidence: 0.6 });
  assert.match(out, /a-hi/);
  assert.doesNotMatch(out, /a-lo/);
  assert.ok(out.length <= 2000);
});
