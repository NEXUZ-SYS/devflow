import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { treeDigest } from '../../scripts/lib/verify-tree-digest.mjs';

function repo() {
  const d = mkdtempSync(join(tmpdir(), 'digest-'));
  const g = (...a) => execFileSync('git', ['-C', d, ...a], { encoding: 'utf8' });
  execFileSync('git', ['init', '-q', '-b', 'main', d]);
  g('config', 'user.email', 't@t'); g('config', 'user.name', 't');
  writeFileSync(join(d, 'a.txt'), 'x'); g('add', '-A'); g('commit', '-q', '-m', 'i');
  return { d, g };
}

test('digest é estável quando a árvore não muda', () => {
  const { d } = repo();
  assert.equal(treeDigest(d), treeDigest(d));
});

test('editar código muda o digest', () => {
  const { d } = repo();
  const before = treeDigest(d);
  writeFileSync(join(d, 'a.txt'), 'y');
  assert.notEqual(treeDigest(d), before);
});

test('mexer só em .context/workflow NÃO muda o digest (anti-livelock)', () => {
  const { d, g } = repo();
  mkdirSync(join(d, '.context', 'workflow'), { recursive: true });
  writeFileSync(join(d, '.context', 'workflow', 'plans.json'), '{}');
  g('add', '-A'); g('commit', '-q', '-m', 'workflow state');
  const before = treeDigest(d);
  writeFileSync(join(d, '.context', 'workflow', 'plans.json'), '{"changed":true}');
  assert.equal(treeDigest(d), before);
});

test('falha do git status muda o digest em vez de colapsar para só o HEAD (F2)', async () => {
  const { mkdtempSync: mk, writeFileSync: wf, chmodSync } = await import('node:fs');
  const { tmpdir: td } = await import('node:os');
  const { join: j } = await import('node:path');
  const { d } = repo();
  const clean = treeDigest(d);
  const real = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();
  const bin = mk(j(td(), 'fakegit-'));
  wf(j(bin, 'git'), `#!/bin/sh\nfor a in "$@"; do [ "$a" = status ] && exit 1; done\nexec ${real} "$@"\n`);
  chmodSync(j(bin, 'git'), 0o755);
  const saved = process.env.PATH;
  process.env.PATH = `${bin}:${saved}`;
  try {
    assert.notEqual(treeDigest(d), clean);
    assert.equal(treeDigest(d), treeDigest(d)); // marcador estável
  } finally { process.env.PATH = saved; }
  assert.equal(treeDigest(d), clean); // repo benigno mantém o digest
});
