#!/usr/bin/env node
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const TEST_TMP_ROOT = "./tests/validation/tmp/";
const SCRIPT = join(process.cwd(), "scripts", "devflow-stacks.mjs");

function fixture() {
  mkdirSync(TEST_TMP_ROOT, { recursive: true });
  const root = mkdtempSync(join(TEST_TMP_ROOT, "stacks-cli-"));
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

function runCmd(root, args) {
  return execFileSync("node", [SCRIPT, ...args], {
    cwd: root,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  });
}

function runCmdExpectError(root, args) {
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

test("validate: passes when no manifest exists (empty stub OK)", () => {
  const { root, cleanup } = fixture();
  try {
    const out = runCmd(root, ["validate"]);
    assert.match(out, /OK|no frameworks|valid/i);
  } finally {
    cleanup();
  }
});

test("validate: fails when artisanalRef declared but file missing", () => {
  const { root, cleanup } = fixture();
  try {
    const dir = join(root, ".context", "stacks");
    mkdirSync(join(dir, "refs"), { recursive: true });
    writeFileSync(join(dir, "manifest.yaml"), `spec: devflow-stack/v0
frameworks:
  next:
    version: "15.0.0"
    artisanalRef: refs/next@15.0.0.md
    applyTo: ["src/**"]
`);
    const result = runCmdExpectError(root, ["validate"]);
    assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, /missing|not found|next/i);
  } finally {
    cleanup();
  }
});

test("validate: passes when ref file present with SI-6 fence", () => {
  const { root, cleanup } = fixture();
  try {
    const dir = join(root, ".context", "stacks");
    mkdirSync(join(dir, "refs"), { recursive: true });
    writeFileSync(join(dir, "manifest.yaml"), `spec: devflow-stack/v0
frameworks:
  next:
    version: "15.0.0"
    artisanalRef: refs/next@15.0.0.md
    applyTo: ["src/**"]
`);
    // Create a ref file with the fence + 5 code blocks (md2llm sanity bound)
    const fence = "<<<DEVFLOW_STACK_REF_START_abc123def456>>>\n";
    const blocks = "```js\nconsole.log(1);\n```\n".repeat(6);
    writeFileSync(
      join(dir, "refs", "next@15.0.0.md"),
      fence + blocks + "<<<DEVFLOW_STACK_REF_END>>>\n"
    );
    const out = runCmd(root, ["validate"]);
    assert.match(out, /OK|valid|next.*15\.0\.0/i);
  } finally {
    cleanup();
  }
});

test("validate: warns when ref file lacks SI-6 fence", () => {
  const { root, cleanup } = fixture();
  try {
    const dir = join(root, ".context", "stacks");
    mkdirSync(join(dir, "refs"), { recursive: true });
    writeFileSync(join(dir, "manifest.yaml"), `spec: devflow-stack/v0
frameworks:
  foo:
    version: "1.0.0"
    artisanalRef: refs/foo@1.0.0.md
`);
    writeFileSync(join(dir, "refs", "foo@1.0.0.md"),
      "TITLE: foo\nCODE: bar\n");  // No fence
    const result = runCmdExpectError(root, ["validate", "--strict"]);
    assert.match(result.stdout + result.stderr, /fence|SI-6|tampered|missing/i);
  } finally {
    cleanup();
  }
});

test("scrape-batch --dry-run: shows plan without executing", () => {
  const { root, cleanup } = fixture();
  try {
    writeFileSync(join(root, "package.json"), JSON.stringify({
      dependencies: { "is-odd": "4.0.0" },
    }));
    const out = runCmd(root, ["scrape-batch", "--from-package", "--dry-run"]);
    assert.match(out, /is-odd/);
    assert.match(out, /dry-run|plan|would scrape/i);
  } finally {
    cleanup();
  }
});

test("usage on no args", () => {
  const { root, cleanup } = fixture();
  try {
    const result = runCmdExpectError(root, []);
    assert.match(result.stdout + result.stderr, /usage|scrape|validate/i);
  } finally {
    cleanup();
  }
});
