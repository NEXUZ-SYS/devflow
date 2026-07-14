import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CLI = join(process.cwd(), 'scripts/lib/verify-contract-guard-cli.mjs');
function repo(baseVerify, headVerify) {
  const d = mkdtempSync(join(tmpdir(), 'cguard-'));
  const g = (...a) => execFileSync('git', ['-C', d, ...a], { encoding: 'utf8' });
  execFileSync('git', ['init', '-q', '-b', 'main', d]);
  g('config','user.email','t@t'); g('config','user.name','t');
  mkdirSync(join(d, '.context'), { recursive: true });
  const cfg = (v) => `git:\n  strategy: branch-flow\n  protectedBranches: [main]\nverify:\n${v}`;
  writeFileSync(join(d, '.context/.devflow.yaml'), cfg(baseVerify));
  g('add','-A'); g('commit','-q','-m','base');
  g('checkout','-q','-b','feature/x');
  writeFileSync(join(d, '.context/.devflow.yaml'), cfg(headVerify));
  g('add','-A'); g('commit','-q','--allow-empty','-m','head');
  return d;
}
function run(root) {
  try { execFileSync('node', [CLI, `--root=${root}`, '--base-ref=main', '--ci'], { encoding: 'utf8' }); return 0; }
  catch (e) { return e.status ?? 1; }
}
test('remover sinal na feature branch → guard do CI bloqueia (exit 1)', () => {
  const d = repo(`  unit: ["node","--test","x"]\n  e2e: ["bash","e.sh"]\n`, `  unit: ["node","--test","x"]\n`);
  assert.equal(run(d), 1);
});
test('trocar por inline na feature branch → guard do CI bloqueia', () => {
  const d = repo(`  unit: ["node","--test","x"]\n`, `  unit: ["node","--eval","0"]\n`);
  assert.equal(run(d), 1);
});
test('contrato íntegro → guard passa (exit 0)', () => {
  const d = repo(`  unit: ["node","--test","x"]\n`, `  unit: ["node","--test","x"]\n`);
  assert.equal(run(d), 0);
});
