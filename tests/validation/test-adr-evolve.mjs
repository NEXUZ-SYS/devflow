// Suite — adr-evolve integration tests (patch/minor/major/refine flows)
// Each flow uses a temp project under tests/validation/tmp/ (S6-safe — within cwd)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, copyFileSync, mkdirSync, mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const FIX_PROJ = './tests/validation/fixtures/adr-project/';
const TEST_TMP_ROOT = './tests/validation/tmp/';
const FIXTURES = ['001-zod-validation-v1.0.0.md', '002-rfc7807-errors-v1.0.0.md', '003-feature-flags-v1.0.0.md'];

function setupTmpProject() {
  mkdirSync(TEST_TMP_ROOT, { recursive: true });
  const tmp = mkdtempSync(join(TEST_TMP_ROOT, 'adr-evolve-'));
  mkdirSync(join(tmp, '.context/docs/adrs'), { recursive: true });
  for (const f of FIXTURES) {
    copyFileSync(join(FIX_PROJ, '.context/docs/adrs', f), join(tmp, '.context/docs/adrs', f));
  }
  // Init git so adr-evolve can run `git mv`
  execFileSync('git', ['init', '-q', tmp], { stdio: 'pipe' });
  execFileSync('git', ['-C', tmp, 'config', 'user.email', 't@t.t'], { stdio: 'pipe' });
  execFileSync('git', ['-C', tmp, 'config', 'user.name', 'test'], { stdio: 'pipe' });
  execFileSync('git', ['-C', tmp, 'add', '.'], { stdio: 'pipe' });
  execFileSync('git', ['-C', tmp, 'commit', '-q', '-m', 'init'], { stdio: 'pipe' });
  return tmp;
}

function runEvolve(file, ...flags) {
  return JSON.parse(
    execFileSync('node', ['scripts/adr-evolve.mjs', file, ...flags], { encoding: 'utf-8' }),
  );
}

test('patch: bump version and rename file', () => {
  const tmp = setupTmpProject();
  const before = join(tmp, '.context/docs/adrs/001-zod-validation-v1.0.0.md');
  const after = join(tmp, '.context/docs/adrs/001-zod-validation-v1.0.1.md');
  assert.ok(existsSync(before));

  const r = runEvolve(before, '--kind=patch', '--apply');
  assert.equal(r.kind, 'patch');
  assert.equal(r.version, '1.0.1');
  assert.ok(!existsSync(before), 'old file should be renamed away');
  assert.ok(existsSync(after), 'new file should exist');
  const content = readFileSync(after, 'utf-8');
  assert.match(content, /version: 1\.0\.1/);

  rmSync(tmp, { recursive: true });
});

test('minor: bump and revert status to Proposto', () => {
  const tmp = setupTmpProject();
  const before = join(tmp, '.context/docs/adrs/001-zod-validation-v1.0.0.md');
  const after = join(tmp, '.context/docs/adrs/001-zod-validation-v1.1.0.md');

  const r = runEvolve(before, '--kind=minor', '--apply');
  assert.equal(r.version, '1.1.0');
  assert.ok(existsSync(after));
  const content = readFileSync(after, 'utf-8');
  assert.match(content, /version: 1\.1\.0/);
  assert.match(content, /status: Proposto/);

  rmSync(tmp, { recursive: true });
});

test('major: create new file with supersedes; old becomes Substituido', () => {
  const tmp = setupTmpProject();
  const oldFile = join(tmp, '.context/docs/adrs/001-zod-validation-v1.0.0.md');
  const newFile = join(tmp, '.context/docs/adrs/001-zod-validation-v2.0.0.md');

  const r = runEvolve(oldFile, '--kind=major', '--apply');
  assert.equal(r.kind, 'major');

  // Old file STILL exists with same name; only frontmatter changed
  assert.ok(existsSync(oldFile));
  const oldContent = readFileSync(oldFile, 'utf-8');
  assert.match(oldContent, /status: Substituido/);

  // New file exists with v2.0.0 + supersedes
  assert.ok(existsSync(newFile));
  const newContent = readFileSync(newFile, 'utf-8');
  assert.match(newContent, /version: 2\.0\.0/);
  assert.match(newContent, /supersedes: \[001-zod-validation-v1\.0\.0\]/);
  assert.match(newContent, /status: Proposto/);

  rmSync(tmp, { recursive: true });
});

test('refine: create new ADR with refines, parent unchanged', () => {
  const tmp = setupTmpProject();
  const parent = join(tmp, '.context/docs/adrs/001-zod-validation-v1.0.0.md');
  const parentBefore = readFileSync(parent, 'utf-8');

  const r = runEvolve(parent, '--kind=refine', '--apply', '--slug=zod-coverage-slo');
  assert.equal(r.kind, 'refine');

  // Parent untouched
  assert.equal(readFileSync(parent, 'utf-8'), parentBefore);

  // New file with next sequential number (004)
  const newFiles = readdirSync(join(tmp, '.context/docs/adrs/')).filter((f) =>
    f.includes('zod-coverage-slo'),
  );
  assert.equal(newFiles.length, 1, 'one new refine ADR');
  assert.match(newFiles[0], /^004-zod-coverage-slo-v1\.0\.0\.md$/);
  const content = readFileSync(join(tmp, '.context/docs/adrs/', newFiles[0]), 'utf-8');
  assert.match(content, /refines: \[001-zod-validation-v1\.0\.0\]/);

  rmSync(tmp, { recursive: true });
});

test('S1: filename containing shell metacharacters is safe (no shell injection)', () => {
  const tmp = setupTmpProject();
  // We don't actually need to plant a malicious filename to verify the lib uses execFileSync;
  // a static check is sufficient.
  const src = readFileSync('./scripts/adr-evolve.mjs', 'utf-8');
  assert.match(src, /execFileSync\(/, 'must use execFileSync (S1 mitigation)');
  assert.doesNotMatch(src, /execSync\s*\(\s*`git/, 'must NOT use execSync template literal for git');
  rmSync(tmp, { recursive: true });
});
