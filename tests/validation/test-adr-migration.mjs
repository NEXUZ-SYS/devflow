// Suite — migration of 001/002 from v1 (DevFlow legacy) to v2.1.0
// Asserts: filenames renamed, frontmatter v2 fields present, Relacionamentos removed,
// pytest URL migrated to Evidências, status preserved, zero stale refs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { parse } from '../../scripts/lib/adr-frontmatter.mjs';

const ADRS = '.context/docs/adrs/';

test('001-tdd-python migrated to v1.0.0 filename', () => {
  assert.ok(existsSync(`${ADRS}001-tdd-python-v1.0.0.md`), 'v1.0.0 file must exist');
  assert.ok(!existsSync(`${ADRS}001-tdd-python.md`), 'old unsuffixed file must be gone');
});

test('001 frontmatter has v2.1.0 fields', () => {
  const { frontmatter, body } = parse(readFileSync(`${ADRS}001-tdd-python-v1.0.0.md`, 'utf-8'));
  assert.equal(frontmatter.version, '1.0.0');
  assert.deepEqual(frontmatter.supersedes, []);
  assert.deepEqual(frontmatter.refines, []);
  assert.equal(frontmatter.protocol_contract, null);
  assert.equal(frontmatter.decision_kind, 'firm');
  assert.equal(frontmatter.status, 'Aprovado'); // preserved
  assert.doesNotMatch(body, /^##\s+Relacionamentos/m);
  assert.match(body, /pytest\.org/i);
});

test('002-code-review migrated to v1.0.0', () => {
  assert.ok(existsSync(`${ADRS}002-code-review-v1.0.0.md`));
  assert.ok(!existsSync(`${ADRS}002-code-review.md`));
});

test('002 frontmatter has v2.1.0 fields', () => {
  const { frontmatter, body } = parse(readFileSync(`${ADRS}002-code-review-v1.0.0.md`, 'utf-8'));
  assert.equal(frontmatter.version, '1.0.0');
  assert.deepEqual(frontmatter.supersedes, []);
  assert.deepEqual(frontmatter.refines, []);
  assert.equal(frontmatter.status, 'Aprovado');
  assert.doesNotMatch(body, /^##\s+Relacionamentos/m);
});

test('grep finds zero stale unsuffixed references in code/skills', () => {
  // Allowed contexts: docs/superpowers/, .context/plans/ (historical refs in plan text); fixtures using -v1.0.0
  const out = execSync(
    "grep -rln --include='*.md' '001-tdd-python\\.md\\|002-code-review\\.md' . 2>/dev/null | grep -v node_modules | grep -v '/.git/' || true",
    { encoding: 'utf-8' },
  ).trim();
  if (out) {
    // Filter out historical doc references (spec, plan)
    const blocking = out.split('\n').filter((p) =>
      !p.includes('docs/superpowers/specs/') &&
      !p.includes('.context/plans/'),
    );
    assert.equal(blocking.length, 0, `stale refs remain: ${blocking.join(', ')}`);
  }
});
