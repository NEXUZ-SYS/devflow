#!/usr/bin/env node
// tests/validation/test-adr-evolve-migrates.mjs
// Verifies adr-evolve migrates legacy ADRs to canonical path on write.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { execFileSync } from "node:child_process";

const SCRIPT = join(process.cwd(), "scripts", "adr-evolve.mjs");
const TEST_TMP_ROOT = "./tests/validation/tmp/";

const ADR_V1 = `---
type: adr
name: foo
description: foo description
scope: project
source: local
stack: universal
category: arquitetura
status: Aprovado
version: 1.0.0
created: 2026-05-06
supersedes: []
refines: []
protocol_contract: null
decision_kind: firm
---

# ADR 001 — Foo

- **Data:** 2026-05-06

**Contexto.** body.
`;

function gitInit(root) {
  execFileSync("git", ["init", "-q"], { cwd: root, stdio: "pipe" });
  execFileSync("git", ["config", "user.email", "test@test"], { cwd: root, stdio: "pipe" });
  execFileSync("git", ["config", "user.name", "test"], { cwd: root, stdio: "pipe" });
}

test("adr-evolve patch: migrates legacy ADR to canonical path", () => {
  mkdirSync(TEST_TMP_ROOT, { recursive: true });
  const root = mkdtempSync(join(TEST_TMP_ROOT, "adr-evo-mig-"));
  try {
    gitInit(root);
    const legacyDir = join(root, ".context", "docs", "adrs");
    mkdirSync(legacyDir, { recursive: true });
    const legacyFile = join(legacyDir, "001-foo-v1.0.0.md");
    writeFileSync(legacyFile, ADR_V1);
    execFileSync("git", ["add", "."], { cwd: root, stdio: "pipe" });
    execFileSync("git", ["commit", "-m", "init", "-q"], { cwd: root, stdio: "pipe" });

    // Don't set cwd — let adr-evolve resolve scripts/adr-update-index.mjs from project root
    execFileSync(
      "node",
      [SCRIPT, legacyFile, "--kind=patch", "--apply"],
      { stdio: "pipe" }
    );

    // After evolve, new file should exist in canonical path
    const newFile = join(root, ".context", "adrs", "001-foo-v1.0.1.md");
    const oldFileGone = !existsSync(legacyFile);
    assert.ok(existsSync(newFile), `evolved ADR should be at ${newFile}`);
    assert.ok(oldFileGone, "legacy file should have been git-mv'd");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("adr-evolve patch: does NOT migrate if source already in canonical path", () => {
  mkdirSync(TEST_TMP_ROOT, { recursive: true });
  const root = mkdtempSync(join(TEST_TMP_ROOT, "adr-evo-canonical-"));
  try {
    gitInit(root);
    const canonical = join(root, ".context", "adrs");
    mkdirSync(canonical, { recursive: true });
    const file = join(canonical, "001-foo-v1.0.0.md");
    writeFileSync(file, ADR_V1);
    execFileSync("git", ["add", "."], { cwd: root, stdio: "pipe" });
    execFileSync("git", ["commit", "-m", "init", "-q"], { cwd: root, stdio: "pipe" });

    execFileSync(
      "node",
      [SCRIPT, file, "--kind=patch", "--apply"],
      { stdio: "pipe" }
    );

    const newFile = join(canonical, "001-foo-v1.0.1.md");
    assert.ok(existsSync(newFile), "evolved ADR should be in canonical (unchanged)");
    // No legacy path should be created
    assert.ok(!existsSync(join(root, ".context", "docs")), "should not create legacy dir");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
