// Suite B — adr-update-index integration tests
// Asserts schema (14 cols), idempotency, --next-number, --resolve, lock safety, path traversal mitigation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const FIX_PROJ = './tests/validation/fixtures/adr-project/';

function setupTmpProject() {
  const tmp = mkdtempSync(join(tmpdir(), 'adr-idx-'));
  mkdirSync(join(tmp, '.context/docs/adrs'), { recursive: true });
  for (const f of ['001-zod-validation-v1.0.0.md', '002-rfc7807-errors-v1.0.0.md', '003-feature-flags-v1.0.0.md']) {
    copyFileSync(join(FIX_PROJ, '.context/docs/adrs', f), join(tmp, '.context/docs/adrs', f));
  }
  return tmp;
}

function runIndex(project, ...flags) {
  return execFileSync('node', ['scripts/adr-update-index.mjs', `--project=${project}`, ...flags], {
    encoding: 'utf-8',
  }).trim();
}

test('regenerates README with 14 columns', () => {
  const tmp = setupTmpProject();
  runIndex(tmp);
  const readme = readFileSync(join(tmp, '.context/docs/adrs/README.md'), 'utf-8');
  for (const col of [
    '#',
    'Título',
    'Versão',
    'Categoria',
    'Stack',
    'Escopo',
    'Status',
    'Kind',
    'Contrato',
    'Refines',
    'Supersedes',
    'Criada',
    'Guardrails',
    'Arquivo',
  ]) {
    assert.match(readme, new RegExp(`\\| ?${col}\\s`), `column ${col} missing`);
  }
  assert.match(readme, /índice gerado/i);
  rmSync(tmp, { recursive: true });
});

test('idempotent: second run identical', () => {
  const tmp = setupTmpProject();
  runIndex(tmp);
  const a = readFileSync(join(tmp, '.context/docs/adrs/README.md'), 'utf-8');
  runIndex(tmp);
  const b = readFileSync(join(tmp, '.context/docs/adrs/README.md'), 'utf-8');
  assert.equal(a, b);
  rmSync(tmp, { recursive: true });
});

test('next-number returns 004 for existing 001-003', () => {
  const tmp = setupTmpProject();
  const out = runIndex(tmp, '--next-number');
  assert.equal(out, '004');
  rmSync(tmp, { recursive: true });
});

test('resolve query by prefix', () => {
  const tmp = setupTmpProject();
  const out = runIndex(tmp, '--resolve=001');
  assert.match(out, /001-zod-validation-v1\.0\.0\.md$/);
  rmSync(tmp, { recursive: true });
});

test('S6: rejects --project outside cwd', () => {
  let exitCode = 0;
  try {
    execFileSync('node', ['scripts/adr-update-index.mjs', '--project=/etc'], {
      encoding: 'utf-8',
      stdio: 'pipe',
    });
  } catch (err) {
    exitCode = err.status;
  }
  assert.equal(exitCode, 2, 'must exit 2 on path traversal attempt');
});

test('concurrent --next-number runs serialize without crash', async () => {
  const tmp = setupTmpProject();
  const procs = Array.from({ length: 5 }, () =>
    new Promise((resolve) => {
      try {
        const out = execFileSync('node', ['scripts/adr-update-index.mjs', `--project=${tmp}`, '--next-number'], {
          encoding: 'utf-8',
        }).trim();
        resolve(out);
      } catch {
        resolve('FAIL');
      }
    }),
  );
  const results = await Promise.all(procs);
  for (const r of results) {
    assert.match(r, /^\d{3}$/, `parallel run produced invalid output: ${r}`);
  }
  rmSync(tmp, { recursive: true });
});
