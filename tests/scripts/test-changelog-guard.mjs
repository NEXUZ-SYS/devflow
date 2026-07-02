// tests/scripts/test-changelog-guard.mjs
// (b) Guard de release: exige seção "## [X.Y.Z]" NÃO-VAZIA para a versão lançada.
// Fail-loud (irmão do version-guard). Função pura checkReleaseChangelog.
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkReleaseChangelog } from "../../scripts/lib/changelog-guard.mjs";

const WITH = `# Changelog

## [Unreleased]

## [1.1.0] — 2026-07-02

### Added
- feature X

## [1.0.0] — 2026-01-01
- inicial
`;

test("ok: seção [X.Y.Z] presente e não-vazia", () => {
  assert.equal(checkReleaseChangelog(WITH, "1.1.0").ok, true);
});

test("fail: seção [X.Y.Z] ausente", () => {
  const r = checkReleaseChangelog(WITH, "1.2.0");
  assert.equal(r.ok, false);
  assert.match(r.reason, /sem seção/i);
});

test("fail: seção [X.Y.Z] existe mas vazia", () => {
  const empty = `# Changelog

## [Unreleased]

## [1.3.0] — 2026-07-02

## [1.0.0] — 2026-01-01
- x
`;
  const r = checkReleaseChangelog(empty, "1.3.0");
  assert.equal(r.ok, false);
  assert.match(r.reason, /vazia/i);
});
