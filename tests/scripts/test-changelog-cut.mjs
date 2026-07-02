// tests/scripts/test-changelog-cut.mjs
// (a) Corte de release: bump-version deve renomear "## [Unreleased]" para
// "## [X.Y.Z] — data" (com um [Unreleased] novo vazio no topo), atomicamente
// com o bump dos version files. Função pura cutRelease.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cutRelease } from "../../scripts/lib/changelog-cut.mjs";

const SAMPLE = `# Changelog

## [Unreleased]

### Added
- feature X

## [1.0.0] — 2026-01-01

- inicial
`;

test("corta [Unreleased] → [X.Y.Z] + data; conteúdo migra p/ a nova seção", () => {
  const { text, changed } = cutRelease(SAMPLE, "1.1.0", "2026-07-02");
  assert.equal(changed, true);
  assert.match(text, /## \[Unreleased\]\n\n## \[1\.1\.0\] — 2026-07-02/);
  const idxV = text.indexOf("## [1.1.0]");
  const idxAdded = text.indexOf("### Added");
  const idxPrev = text.indexOf("## [1.0.0]");
  assert.ok(idxV < idxAdded && idxAdded < idxPrev, "conteúdo do Unreleased ficou sob [1.1.0]");
});

test("idempotente: se [X.Y.Z] já existe, não corta de novo", () => {
  const once = cutRelease(SAMPLE, "1.1.0", "2026-07-02").text;
  const twice = cutRelease(once, "1.1.0", "2026-07-02");
  assert.equal(twice.changed, false);
  assert.equal(twice.text, once);
});

test("sem [Unreleased] → no-op (changed=false)", () => {
  const noUnrel = "# Changelog\n\n## [1.0.0] — 2026-01-01\n- x\n";
  const r = cutRelease(noUnrel, "1.1.0", "2026-07-02");
  assert.equal(r.changed, false);
  assert.equal(r.text, noUnrel);
});
