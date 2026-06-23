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

test('promove instinct visto em ≥2 projetos para global (MVP)', async () => {
  await sandbox();
  const mk = (pid) => ({ trigger: 'buscar', action: 'rg', domain: 'workflow', scope: 'project', projectId: pid, projectName: pid });
  await store.upsertInstinct('use-rg', mk('p1'), 0.4); // 0.7
  await store.upsertInstinct('use-rg', mk('p2'), 0.2); // 0.5
  const promoted = await store.promoteAcrossProjects(2);
  assert.deepEqual(promoted, ['use-rg']);
  const g = await store.loadIndex(undefined, 'global');
  assert.equal(g[0].id, 'use-rg');
  assert.equal(g[0].confidence, 0.7); // max observada
});

test('touchRegistry guarda remote normalizado sem credencial (I5)', async () => {
  await sandbox();
  await store.touchRegistry('p1', { name: 'demo', remote: 'https://u:pw@github.com/o/r.git' });
  const reg = JSON.parse(await (await import('node:fs/promises')).readFile(
    (await import('./instinct-paths.mjs')).projectsRegistry(), 'utf-8'));
  assert.doesNotMatch(JSON.stringify(reg), /pw@/);
});

test('prune remove pending<0.3 estagnado e preserva active', async () => {
  await sandbox();
  const m = (id, sc) => ({ trigger: id, action: id, domain: 'workflow', scope: 'project', projectId: 'p1', projectName: 'x' });
  await store.upsertInstinct('keep', m('keep'), 0.3);     // 0.6 active → preserva
  await store.upsertInstinct('stale', m('stale'), 0);     // 0.3 pending (limiar) → não < 0.3, não remove
  // forja um pending antigo < 0.3 escrevendo updated no passado
  await store._writeRaw('p1', 'old', { trigger: 'o', action: 'o', domain: 'workflow', scope: 'project',
    projectId: 'p1', projectName: 'x', confidence: 0.2, observations: 1, status: 'pending', updated: '2000-01-01' });
  const removed = await store.pruneStale('p1', 30);
  assert.ok(removed.includes('old'));
  const idx = await store.loadIndex('p1', 'project');
  assert.ok(idx.find((i) => i.id === 'keep'));
  assert.ok(!idx.find((i) => i.id === 'old'));
});
