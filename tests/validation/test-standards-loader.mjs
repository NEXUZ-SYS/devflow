#!/usr/bin/env node
// tests/validation/test-standards-loader.mjs
// Unit tests for scripts/lib/standards-loader.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  loadStandards,
  findApplicableStandards,
} from "../../scripts/lib/standards-loader.mjs";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "stds-"));
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

const STD_FULL = `---
id: std-error-handling
description: Error handling rules
version: 1.0.0
applyTo: ["src/**/*.ts"]
relatedAdrs: [ADR-009]
enforcement:
  linter: standards/machine/std-error-handling.js
---

# Error handling

Use BaseError.
`;

const STD_NO_LINTER = `---
id: std-naming
description: Naming convention
version: 1.0.0
applyTo: ["src/**"]
---

# Naming
`;

const STD_NO_LINTER_OK = `---
id: std-philosophy
description: Philosophical guideline
version: 1.0.0
applyTo: ["docs/**"]
weakStandardWarning: true
---

# Philosophy
`;

const STD_NO_ID = `---
description: missing id
version: 1.0.0
applyTo: ["src/**"]
---

body
`;

test("loadStandards: empty dir returns []", () => {
  const { root, cleanup } = fixture();
  mkdirSync(join(root, ".context", "standards"), { recursive: true });
  const result = loadStandards(root);
  assert.deepEqual(result, []);
  cleanup();
});

test("loadStandards: parses frontmatter (id, applyTo, version, enforcement)", () => {
  const { root, cleanup } = fixture();
  const dir = join(root, ".context", "standards");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "std-error-handling.md"), STD_FULL);
  const result = loadStandards(root);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "std-error-handling");
  assert.deepEqual(result[0].applyTo, ["src/**/*.ts"]);
  assert.equal(result[0].version, "1.0.0");
  assert.equal(result[0].enforcement.linter, "standards/machine/std-error-handling.js");
  cleanup();
});

test("findApplicableStandards: filters by applyTo glob match", () => {
  const stds = [
    { id: "std-a", applyTo: ["src/**/*.ts"] },
    { id: "std-b", applyTo: ["test/**/*.ts"] },
    { id: "std-c", applyTo: ["src/middleware.ts"] },
  ];
  const matches = findApplicableStandards("src/middleware.ts", stds);
  const ids = matches.map(s => s.id).sort();
  assert.deepEqual(ids, ["std-a", "std-c"]);
});

test("loadStandards: emits weakStandard warning when no linter", () => {
  const { root, cleanup } = fixture();
  const dir = join(root, ".context", "standards");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "std-naming.md"), STD_NO_LINTER);
  const result = loadStandards(root);
  assert.equal(result.length, 1);
  assert.equal(result[0].weak, true, "should mark weak standard");
  cleanup();
});

test("loadStandards: weakStandardWarning:true suppresses weak warning", () => {
  const { root, cleanup } = fixture();
  const dir = join(root, ".context", "standards");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "std-philosophy.md"), STD_NO_LINTER_OK);
  const result = loadStandards(root);
  assert.equal(result.length, 1);
  assert.equal(result[0].weak, false, "weakStandardWarning:true suppresses weak flag");
  cleanup();
});

test("loadStandards: filters out standards without id", () => {
  const { root, cleanup } = fixture();
  const dir = join(root, ".context", "standards");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "std-noid.md"), STD_NO_ID);
  const result = loadStandards(root);
  assert.deepEqual(result, [], "standards without id should be silently dropped");
  cleanup();
});

test("loadStandards: skips machine/ subdir and README.md", () => {
  const { root, cleanup } = fixture();
  const dir = join(root, ".context", "standards");
  mkdirSync(join(dir, "machine"), { recursive: true });
  writeFileSync(join(dir, "README.md"), "# Authoring guide\n");
  writeFileSync(join(dir, "std-real.md"), STD_FULL);
  writeFileSync(join(dir, "machine", "linter.js"), "// not a standard");
  const result = loadStandards(root);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "std-error-handling");
  cleanup();
});
