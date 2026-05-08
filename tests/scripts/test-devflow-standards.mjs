#!/usr/bin/env node
// tests/scripts/test-devflow-standards.mjs
// Smoke tests for scripts/devflow-standards.mjs (new|verify subcommands).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const TEST_TMP_ROOT = "./tests/validation/tmp/";
const SCRIPT = join(process.cwd(), "scripts", "devflow-standards.mjs");

function fixture() {
  mkdirSync(TEST_TMP_ROOT, { recursive: true });
  const root = mkdtempSync(join(TEST_TMP_ROOT, "stds-cli-"));
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

function runCmd(root, ...args) {
  return execFileSync("node", [SCRIPT, ...args], {
    cwd: root,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  });
}

function runCmdExpectError(root, ...args) {
  try {
    return execFileSync("node", [SCRIPT, ...args], {
      cwd: root,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (err) {
    return { stdout: err.stdout?.toString() || "", stderr: err.stderr?.toString() || "", status: err.status };
  }
}

test("new <id>: scaffolds standard file with valid frontmatter", () => {
  const { root, cleanup } = fixture();
  try {
    runCmd(root, "new", "error-handling");
    const stdPath = join(root, ".context", "standards", "std-error-handling.md");
    assert.ok(existsSync(stdPath), "standard file should be created");
    const content = readFileSync(stdPath, "utf-8");
    assert.match(content, /^id: std-error-handling/m);
    assert.match(content, /^applyTo:/m);
    assert.match(content, /^version: 1\.0\.0/m);
  } finally {
    cleanup();
  }
});

test("verify: exits 0 when all standards have linter", () => {
  const { root, cleanup } = fixture();
  try {
    const dir = join(root, ".context", "standards");
    const machineDir = join(dir, "machine");
    mkdirSync(machineDir, { recursive: true });
    writeFileSync(join(dir, "std-good.md"), `---
id: std-good
description: good
version: 1.0.0
applyTo: ["src/**"]
enforcement:
  linter: standards/machine/std-good.js
---

# good
`);
    writeFileSync(join(machineDir, "std-good.js"), "process.exit(0);");
    const out = runCmd(root, "verify");
    assert.match(out, /OK|0 weak|all standards/i);
  } finally {
    cleanup();
  }
});

test("verify: emits weak-standard warning when standard lacks linter", () => {
  const { root, cleanup } = fixture();
  try {
    const dir = join(root, ".context", "standards");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "std-weak.md"), `---
id: std-weak
description: no linter
version: 1.0.0
applyTo: ["src/**"]
---

# weak
`);
    const out = runCmd(root, "verify");
    assert.match(out, /weak/i);
    assert.match(out, /std-weak/);
  } finally {
    cleanup();
  }
});

test("verify --strict: exits non-zero on weak-standards", () => {
  const { root, cleanup } = fixture();
  try {
    const dir = join(root, ".context", "standards");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "std-weak.md"), `---
id: std-weak
description: no linter
version: 1.0.0
applyTo: ["src/**"]
---
`);
    const result = runCmdExpectError(root, "verify", "--strict");
    assert.notEqual(result.status, 0, "--strict should exit non-zero with weak standards");
  } finally {
    cleanup();
  }
});
