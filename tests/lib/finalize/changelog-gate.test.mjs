// tests/lib/finalize/changelog-gate.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { assertUnreleasedNonEmpty } from "../../../scripts/lib/finalize/changelog-gate.mjs";

const CL_FULL = "# Changelog\n\n## [Unreleased]\n\n- **X** — feito\n\n## [1.0.0] — 2026-01-01\n- old\n";
const CL_EMPTY = "# Changelog\n\n## [Unreleased]\n\n## [1.0.0] — 2026-01-01\n- old\n";
const CL_NONE = "# Changelog\n\n## [1.0.0] — 2026-01-01\n- old\n";

test("Unreleased com conteúdo → ok", () => {
  assert.deepEqual(assertUnreleasedNonEmpty(CL_FULL), { ok: true });
});
test("Unreleased vazio → empty", () => {
  assert.equal(assertUnreleasedNonEmpty(CL_EMPTY).empty, true);
});
test("sem seção Unreleased → empty", () => {
  assert.equal(assertUnreleasedNonEmpty(CL_NONE).empty, true);
});

const CLI = fileURLToPath(new URL("../../../scripts/lib/finalize/changelog-gate.mjs", import.meta.url));
function runCli(text) {
  const d = mkdtempSync(join(tmpdir(), "cg-"));
  const p = join(d, "CHANGELOG.md"); writeFileSync(p, text);
  try {
    const out = execFileSync("node", [CLI, "check", p], { encoding: "utf8" }).trim();
    return { code: 0, out };
  } catch (e) {
    return { code: e.status, out: (e.stdout || "").toString().trim() };
  }
}

test("CLI: conteúdo → exit 0 ok", () => {
  const r = runCli(CL_FULL);
  assert.equal(r.code, 0); assert.equal(r.out, "ok");
});
test("CLI: vazio → exit 1 empty", () => {
  const r = runCli(CL_EMPTY);
  assert.equal(r.code, 1); assert.equal(r.out, "empty");
});
