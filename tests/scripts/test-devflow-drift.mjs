#!/usr/bin/env node
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  majorVersionDiff,
  findDrift,
} from "../../scripts/devflow-drift.mjs";

const TEST_TMP_ROOT = "./tests/validation/tmp/";

function fixture() {
  mkdirSync(TEST_TMP_ROOT, { recursive: true });
  const root = mkdtempSync(join(TEST_TMP_ROOT, "drift-"));
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test("majorVersionDiff: detects major bump", () => {
  assert.equal(majorVersionDiff("15.0.0", "16.0.0"), true);
  assert.equal(majorVersionDiff("1.2.3", "2.0.0"), true);
});

test("majorVersionDiff: ignores minor/patch", () => {
  assert.equal(majorVersionDiff("15.0.0", "15.1.0"), false);
  assert.equal(majorVersionDiff("15.0.0", "15.0.5"), false);
  assert.equal(majorVersionDiff("1.2.3", "1.2.3"), false);
});

test("majorVersionDiff: handles caret/tilde prefixes", () => {
  assert.equal(majorVersionDiff("^15.0.0", "16.0.0"), true);
  assert.equal(majorVersionDiff("~15.0.0", "15.5.0"), false);
});

test("majorVersionDiff: invalid versions return false (graceful)", () => {
  assert.equal(majorVersionDiff("not-a-version", "1.0.0"), false);
  assert.equal(majorVersionDiff(null, "1.0.0"), false);
});

test("findDrift: detects major drift between package.json and manifest", () => {
  const { root, cleanup } = fixture();
  try {
    writeFileSync(join(root, "package.json"), JSON.stringify({
      dependencies: { next: "^16.0.0", react: "^19.0.0" },
    }));
    mkdirSync(join(root, ".context", "stacks"), { recursive: true });
    writeFileSync(join(root, ".context", "stacks", "manifest.yaml"),
      `spec: devflow-stack/v0
frameworks:
  next:
    version: "15.0.0"
    artisanalRef: refs/next@15.0.0.md
  react:
    version: "19.0.0"
    artisanalRef: refs/react@19.0.0.md
`);
    const drift = findDrift(root);
    assert.equal(drift.length, 1);
    assert.equal(drift[0].framework, "next");
    assert.equal(drift[0].installed, "16.0.0");
    assert.equal(drift[0].pinned, "15.0.0");
  } finally {
    cleanup();
  }
});

test("findDrift: returns empty when no drift", () => {
  const { root, cleanup } = fixture();
  try {
    writeFileSync(join(root, "package.json"), JSON.stringify({
      dependencies: { next: "15.1.0" },
    }));
    mkdirSync(join(root, ".context", "stacks"), { recursive: true });
    writeFileSync(join(root, ".context", "stacks", "manifest.yaml"),
      `spec: devflow-stack/v0
frameworks:
  next:
    version: "15.0.0"
    artisanalRef: refs/next@15.0.0.md
`);
    const drift = findDrift(root);
    assert.deepEqual(drift, []);
  } finally {
    cleanup();
  }
});

test("findDrift: skips frameworks with skipDocs:true", () => {
  const { root, cleanup } = fixture();
  try {
    writeFileSync(join(root, "package.json"), JSON.stringify({
      dependencies: { postgres: "18.0.0" },
    }));
    mkdirSync(join(root, ".context", "stacks"), { recursive: true });
    writeFileSync(join(root, ".context", "stacks", "manifest.yaml"),
      `spec: devflow-stack/v0
frameworks:
  postgres:
    version: "17.0.0"
    skipDocs: true
`);
    const drift = findDrift(root);
    assert.deepEqual(drift, []);
  } finally {
    cleanup();
  }
});
