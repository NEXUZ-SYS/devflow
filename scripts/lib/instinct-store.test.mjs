// scripts/lib/instinct-store.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as store from './instinct-store.mjs';

async function sandbox() {
  const d = await mkdtemp(join(tmpdir(), 'inst-'));
  process.env.DEVFLOW_INSTINCTS_DIR = d;
  return d;
}

test('upsert cria @0.3 e materializa índice', async () => {
  await sandbox();
  const meta = { trigger: 'ao buscar', action: 'usar rg', domain: 'workflow', scope: 'project', projectId: 'p1', projectName: 'demo' };
  const inst = await store.upsertInstinct('use-rg', meta, 0);
  assert.equal(inst.confidence, 0.3);
  assert.equal(inst.status, 'pending');
  const idx = await store.loadIndex('p1', 'project');
  assert.equal(idx.length, 1);
  assert.equal(idx[0].id, 'use-rg');
});

test('upsert aplica delta e vira active em 0.6', async () => {
  await sandbox();
  const meta = { trigger: 't', action: 'a', domain: 'git', scope: 'project', projectId: 'p1', projectName: 'demo' };
  await store.upsertInstinct('x', meta, 0);      // 0.3
  await store.upsertInstinct('x', meta, 0.1);    // 0.4
  await store.upsertInstinct('x', meta, 0.1);    // 0.5
  const inst = await store.upsertInstinct('x', meta, 0.1); // 0.6
  assert.equal(inst.confidence, 0.6);
  assert.equal(inst.status, 'active');
});

test('withLock serializa escrita concorrente', async () => {
  const d = await sandbox();
  let max = 0, cur = 0;
  await Promise.all([1,2,3].map(() => store.withLock(d, async () => {
    cur++; max = Math.max(max, cur);
    await new Promise(r => setTimeout(r, 10));
    cur--;
  })));
  assert.equal(max, 1);
});

test('upsert global grava em global/ e indexa em scope global (C2)', async () => {
  await sandbox();
  const meta = { trigger: 't', action: 'a', domain: 'workflow', scope: 'global', projectName: 'x' };
  const inst = await store.upsertInstinct('g1', meta, 0.3);
  assert.equal(inst.scope, 'global');
  const idx = await store.loadIndex(undefined, 'global');
  assert.equal(idx.length, 1);
  assert.equal(idx[0].id, 'g1');
});

test('upsert redige credencial em trigger/action (sec I4)', async () => {
  await sandbox();
  const meta = { trigger: 'curl --password=hunter2', action: 'a', domain: 'workflow', scope: 'project', projectId: 'p1', projectName: 'x' };
  const inst = await store.upsertInstinct('r1', meta, 0);
  assert.doesNotMatch(inst.trigger, /hunter2/);
});
