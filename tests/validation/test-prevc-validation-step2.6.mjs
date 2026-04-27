// Test Step 2.6 (ADR Audit Gate) in prevc-validation: doc-test + integration scenario.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync, rmSync, writeFileSync, mkdtempSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';

const SKILL = readFileSync('./skills/prevc-validation/SKILL.md', 'utf-8');
const TEST_TMP = './tests/validation/tmp/';

function setupGitRepo() {
  mkdirSync(TEST_TMP, { recursive: true });
  const tmp = mkdtempSync(join(TEST_TMP, 'step2.6-'));
  mkdirSync(join(tmp, '.context/docs/adrs'), { recursive: true });
  execFileSync('git', ['init', '-q', tmp], { stdio: 'pipe' });
  execFileSync('git', ['-C', tmp, 'config', 'user.email', 't@t.t'], { stdio: 'pipe' });
  execFileSync('git', ['-C', tmp, 'config', 'user.name', 'test'], { stdio: 'pipe' });
  // Create empty initial commit on main
  execFileSync('git', ['-C', tmp, 'commit', '--allow-empty', '-q', '-m', 'init'], { stdio: 'pipe' });
  // Create branch for "workflow"
  execFileSync('git', ['-C', tmp, 'checkout', '-q', '-b', 'feature/workflow'], { stdio: 'pipe' });
  return tmp;
}

test('Step 2.6 section exists with matrix-by-status', () => {
  assert.match(SKILL, /## Step 2\.6/);
  for (const status of ['Proposto', 'Aprovado', 'Substituido', 'Descontinuado']) {
    assert.match(SKILL, new RegExp(`\\b${status}\\b`));
  }
});

test('Step 2.6 uses git merge-base for worktree-safe diff', () => {
  assert.match(SKILL, /git merge-base HEAD main/);
});

test('Step 2.6 references adr-audit.mjs --enforce-gate', () => {
  assert.match(SKILL, /adr-audit\.mjs.*--enforce-gate/);
});

test('integration: empty diff means skip Step 2.6', () => {
  const tmp = setupGitRepo();
  // No ADRs touched on the new branch — diff vs initial commit
  const diff = execFileSync('git', ['-C', tmp, 'diff', '--name-only', 'HEAD', '--', '.context/docs/adrs/'], {
    encoding: 'utf-8',
  }).trim();
  assert.equal(diff, '', 'empty diff → skip path');
  rmSync(tmp, { recursive: true });
});

test('integration: invalid ADR Proposto causes adr-audit --enforce-gate to exit 1', () => {
  const tmp = setupGitRepo();
  // Plant a vague-guardrail invalid ADR
  copyFileSync(
    './tests/validation/fixtures/adr/invalid-01-vague-guardrail.md',
    join(tmp, '.context/docs/adrs/001-vague-v1.0.0.md'),
  );

  let exitCode = 0;
  try {
    execFileSync(
      'node',
      ['scripts/adr-audit.mjs', join(tmp, '.context/docs/adrs/001-vague-v1.0.0.md'), '--enforce-gate'],
      { stdio: 'pipe' },
    );
  } catch (err) {
    exitCode = err.status;
  }
  assert.equal(exitCode, 1, 'must exit 1 (gate BLOCKED) when FIX-INTERVIEW present');
  rmSync(tmp, { recursive: true });
});
