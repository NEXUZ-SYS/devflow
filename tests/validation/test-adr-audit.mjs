// Suite A — adr-audit fixture-driven integration test
// For each fixture in fixtures/adr/, parse EXPECTED block, run lib, compare classifications.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, copyFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const FIX_DIR = './tests/validation/fixtures/adr/';

function parseExpected(content) {
  const m = content.match(/<!--\s*EXPECTED:\s*([\s\S]+?)-->/);
  if (!m) return null;
  const map = Object.create(null);
  for (const line of m[1].trim().split('\n')) {
    const [id, status] = line.split(':').map((s) => s.trim());
    if (/^\d+$/.test(id)) map[id] = status;
  }
  return map;
}

function runAudit(file, ...flags) {
  return JSON.parse(
    execFileSync('node', ['scripts/adr-audit.mjs', file, '--format=json', ...flags], {
      encoding: 'utf-8',
    }),
  );
}

const fixtures = readdirSync(FIX_DIR).filter((f) =>
  f.match(/^(valid|invalid|9\d{2})-.*\.md$/),
);

for (const f of fixtures) {
  test(`audit fixture: ${f}`, () => {
    const content = readFileSync(`${FIX_DIR}${f}`, 'utf-8');
    const expected = parseExpected(content);
    assert.ok(expected, `no EXPECTED block in ${f}`);

    const result = runAudit(`${FIX_DIR}${f}`);
    for (const check of result.checks) {
      const exp = expected[String(check.id)];
      // Skip checks not declared in the fixture's EXPECTED block (Check #13
      // was added in v1.0 follow-up and is always PASS — soft warning only).
      if (exp === undefined) continue;
      assert.equal(
        check.status,
        exp,
        `${f} Check ${check.id} (${check.name}): expected ${exp}, got ${check.status} — ${check.diagnosis}`,
      );
    }
  });
}

// S3 — Aprovado status must demote FIX-AUTO and prevent --apply-fix-auto from modifying file
test('S3: Aprovado status blocks --apply-fix-auto silent edits', () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'adr-audit-s3-'));
  const tmpFile = join(tmpDir, 'aprovado.md');
  copyFileSync(`${FIX_DIR}valid-aprovado-with-fix-auto.md`, tmpFile);
  const before = readFileSync(tmpFile, 'utf-8');
  try {
    runAudit(tmpFile, '--apply-fix-auto');
  } catch {
    /* exit 1 from --apply-fix-auto with FIX-INTERVIEW remaining is OK; file must not change */
  }
  const after = readFileSync(tmpFile, 'utf-8');
  assert.equal(before, after, 'Aprovado ADR must not be modified by --apply-fix-auto');
  rmSync(tmpDir, { recursive: true });
});

// --no-fix-auto demotes all FIX-AUTO to FIX-INTERVIEW
test('--no-fix-auto demotes FIX-AUTO to FIX-INTERVIEW (migration mode)', () => {
  const result = runAudit(`${FIX_DIR}invalid-01-vague-guardrail.md`, '--no-fix-auto');
  assert.equal(result.summary.fix_auto, 0, 'no FIX-AUTO should remain after demote');
});
