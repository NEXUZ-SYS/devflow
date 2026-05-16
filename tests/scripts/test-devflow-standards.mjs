#!/usr/bin/env node
// tests/scripts/test-devflow-standards.mjs
// Smoke tests for scripts/devflow-standards.mjs (new|verify|audit|search subcommands).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const TEST_TMP_ROOT = "./tests/validation/tmp/";
const SCRIPT = join(process.cwd(), "scripts", "devflow-standards.mjs");
const TAXONOMY = join(process.cwd(), "skills/standards-builder/references/taxonomy-of-concerns.yaml");
const FIX = join(process.cwd(), "tests/validation/fixtures");

function fixture() {
  mkdirSync(TEST_TMP_ROOT, { recursive: true });
  const root = mkdtempSync(join(TEST_TMP_ROOT, "stds-cli-"));
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

// Seeds a tmp project with one ADR (adr-zod-frontend) under .context/adrs/.
function seedAdr(root) {
  const adrDir = join(root, ".context", "adrs");
  mkdirSync(adrDir, { recursive: true });
  copyFileSync(join(FIX, "adr-zod-fake.md"), join(adrDir, "009-adr-zod-frontend-v1.0.0.md"));
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

test("new --concern: creates std-<concern-id>.md with concern frontmatter", () => {
  const { root, cleanup } = fixture();
  try {
    runCmd(root, "new", "--concern=runtime-validation", `--taxonomy=${TAXONOMY}`);
    const stdPath = join(root, ".context", "standards", "std-runtime-validation.md");
    assert.ok(existsSync(stdPath), "std-runtime-validation.md should be created");
    const content = readFileSync(stdPath, "utf-8");
    assert.match(content, /^id: std-runtime-validation/m);
    assert.match(content, /^weakStandardWarning: true/m);
    assert.match(content, /## Princípios/);
    // linter stub created
    assert.ok(existsSync(join(root, ".context", "standards", "machine", "std-runtime-validation.js")));
  } finally {
    cleanup();
  }
});

test("new --concern: exits non-zero on unknown concern", () => {
  const { root, cleanup } = fixture();
  try {
    const result = runCmdExpectError(root, "new", "--concern=totally-bogus-xyz", `--taxonomy=${TAXONOMY}`);
    assert.notEqual(result.status, 0, "unknown concern should exit non-zero");
    assert.match(result.stderr, /not found|no-match/i);
  } finally {
    cleanup();
  }
});

test("new --concern --enrich-from-adr: populates relatedAdrs from ADR", () => {
  const { root, cleanup } = fixture();
  try {
    seedAdr(root);
    runCmd(root, "new", "--concern=runtime-validation", "--enrich-from-adr=009", `--taxonomy=${TAXONOMY}`);
    const content = readFileSync(join(root, ".context", "standards", "std-runtime-validation.md"), "utf-8");
    assert.match(content, /adr-zod-frontend/, "relatedAdrs should include the enriched ADR slug");
  } finally {
    cleanup();
  }
});

test("new --from-adr legacy: emits lib-centric warning + concern hint to stderr", () => {
  const { root, cleanup } = fixture();
  try {
    seedAdr(root);
    const res = spawnSync("node",
      [SCRIPT, "new", "zod", "--from-adr=009", `--taxonomy=${TAXONOMY}`, "--yes"],
      { cwd: root, encoding: "utf-8" });
    assert.equal(res.status, 0, `expected success, stderr: ${res.stderr}`);
    assert.match(res.stderr, /lib-centric/i, "stderr should warn about lib-centric std");
    assert.match(res.stderr, /runtime-validation/,
      "stderr should suggest the canonical concern via inverseHints");
  } finally {
    cleanup();
  }
});

test("new --from-adr legacy: appends to .legacy-from-adr.log", () => {
  const { root, cleanup } = fixture();
  try {
    seedAdr(root);
    spawnSync("node",
      [SCRIPT, "new", "zod", "--from-adr=009", `--taxonomy=${TAXONOMY}`, "--yes"],
      { cwd: root, encoding: "utf-8" });
    const logPath = join(root, ".context", "standards", ".legacy-from-adr.log");
    assert.ok(existsSync(logPath), ".legacy-from-adr.log should be written");
    const log = readFileSync(logPath, "utf-8");
    assert.match(log, /009/);
    assert.match(log, /runtime-validation/);
  } finally {
    cleanup();
  }
});

// Seeds a std-runtime-validation.md referencing adr-zod-frontend.
function seedConcernStd(root) {
  const dir = join(root, ".context", "standards");
  mkdirSync(dir, { recursive: true });
  copyFileSync(join(FIX, "std-runtime-validation-fake.md"), join(dir, "std-runtime-validation.md"));
}

test("search --by-guardrail: returns JSON list of stds referencing the ADR", () => {
  const { root, cleanup } = fixture();
  try {
    seedConcernStd(root);
    const res = spawnSync("node",
      [SCRIPT, "search", "--by-guardrail=adr-zod-frontend"],
      { cwd: root, encoding: "utf-8" });
    assert.equal(res.status, 0, `stderr: ${res.stderr}`);
    const parsed = JSON.parse(res.stdout);
    assert.ok(Array.isArray(parsed));
    assert.ok(parsed.some(s => s.id === "std-runtime-validation"));
  } finally {
    cleanup();
  }
});

test("search --by-concern: returns JSON list of ADRs matching the concern", () => {
  const { root, cleanup } = fixture();
  try {
    seedAdr(root);
    const res = spawnSync("node",
      [SCRIPT, "search", "--by-concern=runtime-validation", `--taxonomy=${TAXONOMY}`],
      { cwd: root, encoding: "utf-8" });
    assert.equal(res.status, 0, `stderr: ${res.stderr}`);
    const parsed = JSON.parse(res.stdout);
    assert.ok(Array.isArray(parsed));
    assert.ok(parsed.some(a => a.slug === "adr-zod-frontend"));
  } finally {
    cleanup();
  }
});

test("search without --by-* flag: exits non-zero", () => {
  const { root, cleanup } = fixture();
  try {
    const res = spawnSync("node", [SCRIPT, "search"], { cwd: root, encoding: "utf-8" });
    assert.notEqual(res.status, 0);
  } finally {
    cleanup();
  }
});
