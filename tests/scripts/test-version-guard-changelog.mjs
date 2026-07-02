// tests/scripts/test-version-guard-changelog.mjs
// (b) wiring: o version-guard CLI, ao detectar um BUMP (transição != none),
// exige a seção "## [X.Y.Z]" não-vazia no CHANGELOG (fail-loud). Num PR sem bump
// (kind=none) o CHANGELOG NÃO é exigido.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI = new URL("../../scripts/lib/version-guard.mjs", import.meta.url).pathname;

function fixture(version, changelog) {
  const root = mkdtempSync(join(tmpdir(), "vg-cl-"));
  mkdirSync(join(root, ".claude-plugin"), { recursive: true });
  mkdirSync(join(root, ".cursor-plugin"), { recursive: true });
  const vf = JSON.stringify({ version });
  writeFileSync(join(root, ".claude-plugin", "plugin.json"), vf);
  writeFileSync(join(root, ".claude-plugin", "marketplace.json"), vf);
  writeFileSync(join(root, ".cursor-plugin", "plugin.json"), vf);
  if (changelog != null) writeFileSync(join(root, "CHANGELOG.md"), changelog);
  return root;
}
function run(root, base) {
  try {
    return { code: 0, out: execFileSync("node", [CLI, "--root", root, "--base", base], { encoding: "utf8" }) };
  } catch (e) {
    return { code: e.status ?? 1, out: (e.stdout || "") + (e.stderr || "") };
  }
}

const CL_WITH = "# Changelog\n\n## [Unreleased]\n\n## [1.1.0] — 2026-07-02\n\n### Added\n- x\n\n## [1.0.0] — 2026-01-01\n- init\n";
const CL_WITHOUT = "# Changelog\n\n## [Unreleased]\n\n### Added\n- x\n\n## [1.0.0] — 2026-01-01\n- init\n";
const CL_NONE = "# Changelog\n\n## [Unreleased]\n\n## [0.9.0] — 2026-01-01\n- old\n";

test("bump (minor) COM seção de CHANGELOG → OK", () => {
  assert.equal(run(fixture("1.1.0", CL_WITH), "1.0.0").code, 0);
});

test("bump (minor) SEM seção de CHANGELOG → FAIL (fail-loud)", () => {
  const r = run(fixture("1.1.0", CL_WITHOUT), "1.0.0");
  assert.equal(r.code, 1);
  assert.match(r.out, /CHANGELOG|seção/i);
});

test("bump SEM CHANGELOG.md nenhum → FAIL", () => {
  const r = run(fixture("1.1.0", null), "1.0.0");
  assert.equal(r.code, 1);
});

test("sem bump (kind=none) → CHANGELOG NÃO é exigido (guard pulado)", () => {
  // current == base → none; CHANGELOG sem seção [1.0.0] e mesmo assim OK.
  assert.equal(run(fixture("1.0.0", CL_NONE), "1.0.0").code, 0);
});
