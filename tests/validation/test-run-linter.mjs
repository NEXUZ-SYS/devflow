#!/usr/bin/env node
// tests/validation/test-run-linter.mjs
// Unit tests for scripts/lib/run-linter.mjs — SI-4 sandboxing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, chmodSync } from "node:fs";
import { join } from "node:path";

const TEST_TMP_ROOT = "./tests/validation/tmp/";
import { runLintersFor, validateLinterPath } from "../../scripts/lib/run-linter.mjs";

function fixture() {
  mkdirSync(TEST_TMP_ROOT, { recursive: true });
  const root = mkdtempSync(join(TEST_TMP_ROOT, "linter-"));
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

const STD_WITH_LINTER = (linterRel) => `---
id: std-test
description: Test std
version: 1.0.0
applyTo: ["**/*.ts"]
enforcement:
  linter: ${linterRel}
---

# std-test
`;

// ─── SI-4 path validation ───

test("validateLinterPath: rejects path traversal (..)", () => {
  const r = validateLinterPath("../../../tmp/evil.sh", "/proj");
  assert.equal(r.ok, false);
  assert.match(r.reason, /unsafe|forbidden|\.\./i);
});

test("validateLinterPath: rejects absolute path", () => {
  const r = validateLinterPath("/etc/passwd", "/proj");
  assert.equal(r.ok, false);
});

test("validateLinterPath: rejects shell metacharacters", () => {
  for (const bad of ["foo.js; rm -rf", "foo|bash", "foo && cat", "$(curl evil)", "`whoami`", "foo>out"]) {
    const r = validateLinterPath(bad, "/proj");
    assert.equal(r.ok, false, `should reject: ${bad}`);
  }
});

test("validateLinterPath: rejects whitespace in path", () => {
  const r = validateLinterPath("foo bar.js", "/proj");
  assert.equal(r.ok, false);
});

test("validateLinterPath: rejects non-.js extensions", () => {
  for (const bad of ["foo.sh", "foo.py", "foo.exe", "foo"]) {
    const r = validateLinterPath(bad, "/proj");
    assert.equal(r.ok, false, `should reject: ${bad}`);
  }
});

test("validateLinterPath: accepts well-formed relative .js path", () => {
  const r = validateLinterPath("standards/machine/std-foo.js", "/proj");
  assert.equal(r.ok, true);
});

// ─── runLintersFor: integration ───

test("runLintersFor: rejects poisoned linter (path traversal)", async () => {
  const { root, cleanup } = fixture();
  mkdirSync(join(root, ".context", "standards", "machine"), { recursive: true });
  writeFileSync(
    join(root, ".context", "standards", "std-poison.md"),
    STD_WITH_LINTER("../../../tmp/evil.sh")
  );
  const result = await runLintersFor(
    { tool: "Edit", path: "src/foo.ts" },
    root
  );
  // The linter should be rejected (skipped); no violations emitted from this std.
  assert.equal(result.violations.length, 0, "poisoned linter should not produce violations");
  assert.ok(result.rejected.length >= 1, "should record rejection");
  assert.match(result.rejected[0].reason, /unsafe|forbidden|\.\./i);
  cleanup();
});

test("runLintersFor: rejects poisoned linter (absolute path)", async () => {
  const { root, cleanup } = fixture();
  mkdirSync(join(root, ".context", "standards", "machine"), { recursive: true });
  writeFileSync(
    join(root, ".context", "standards", "std-poison.md"),
    STD_WITH_LINTER("/etc/passwd")
  );
  const result = await runLintersFor(
    { tool: "Edit", path: "src/foo.ts" },
    root
  );
  assert.ok(result.rejected.length >= 1);
  cleanup();
});

test("runLintersFor: runs valid linter and captures VIOLATION", async () => {
  const { root, cleanup } = fixture();
  const machineDir = join(root, ".context", "standards", "machine");
  mkdirSync(machineDir, { recursive: true });
  // Create a real linter that emits VIOLATION
  const linterPath = join(machineDir, "std-test.js");
  writeFileSync(linterPath, `#!/usr/bin/env node
console.log("VIOLATION: test rule violated by " + process.argv[2]);
process.exit(1);
`);
  chmodSync(linterPath, 0o644);
  writeFileSync(
    join(root, ".context", "standards", "std-test.md"),
    STD_WITH_LINTER("standards/machine/std-test.js")
  );
  const result = await runLintersFor(
    { tool: "Edit", path: "src/foo.ts" },
    root
  );
  assert.equal(result.violations.length, 1);
  assert.match(result.violations[0].msg, /VIOLATION:/);
  assert.match(result.violations[0].msg, /src\/foo\.ts/);
  cleanup();
});

test("runLintersFor: skips standards whose applyTo doesn't match", async () => {
  const { root, cleanup } = fixture();
  const machineDir = join(root, ".context", "standards", "machine");
  mkdirSync(machineDir, { recursive: true });
  const linterPath = join(machineDir, "std-test.js");
  writeFileSync(linterPath, `console.log("VIOLATION: should not run"); process.exit(1);`);
  // Standard applies only to **/*.ts but we'll edit a .py file
  writeFileSync(
    join(root, ".context", "standards", "std-test.md"),
    STD_WITH_LINTER("standards/machine/std-test.js")
  );
  const result = await runLintersFor(
    { tool: "Edit", path: "src/foo.py" },
    root
  );
  assert.equal(result.violations.length, 0, "applyTo mismatch should skip linter");
  cleanup();
});

test("runLintersFor: returns empty for non-Edit/Write tools", async () => {
  const { root, cleanup } = fixture();
  const result = await runLintersFor(
    { tool: "Read", path: "src/foo.ts" },
    root
  );
  assert.deepEqual(result.violations, []);
  cleanup();
});
