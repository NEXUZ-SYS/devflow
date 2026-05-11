#!/usr/bin/env node
// tests/validation/test-adr-index-dual-read.mjs
// Integration test: adr-update-index.mjs must scan ADRs from both paths.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

const SCRIPT = join(process.cwd(), "scripts", "adr-update-index.mjs");

const MIN_FM = (id, name) => `---
type: adr
name: ${name}
description: ${name} description
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

# ADR ${id} — ${name}

- **Data:** 2026-05-06
- **Status:** Aprovado
- **Escopo:** Project
`;

test("adr-update-index lists ADRs from both paths", () => {
  const root = mkdtempSync(join(tmpdir(), "adr-dualread-"));
  try {
    mkdirSync(join(root, ".context", "adrs"), { recursive: true });
    mkdirSync(join(root, ".context", "docs", "adrs"), { recursive: true });
    writeFileSync(
      join(root, ".context", "adrs", "001-foo-v1.0.0.md"),
      MIN_FM("001", "foo")
    );
    writeFileSync(
      join(root, ".context", "docs", "adrs", "099-legacy-v1.0.0.md"),
      MIN_FM("099", "legacy")
    );

    execFileSync("node", [SCRIPT, "--project=."], { cwd: root, stdio: "pipe" });

    // README written to new path (canonical)
    const readmePath = join(root, ".context", "adrs", "README.md");
    assert.ok(existsSync(readmePath), "README.md should be at new path");
    const idx = readFileSync(readmePath, "utf-8");
    assert.match(idx, /001/, "index should contain ADR 001 from new path");
    assert.match(idx, /099/, "index should contain ADR 099 from legacy path");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("adr-update-index writes README to legacy path when only legacy has ADRs", () => {
  const root = mkdtempSync(join(tmpdir(), "adr-only-legacy-"));
  try {
    mkdirSync(join(root, ".context", "docs", "adrs"), { recursive: true });
    writeFileSync(
      join(root, ".context", "docs", "adrs", "001-old-v1.0.0.md"),
      MIN_FM("001", "old")
    );

    execFileSync("node", [SCRIPT, "--project=."], { cwd: root, stdio: "pipe" });

    // README at legacy path because that's where ADRs live
    const legacyReadme = join(root, ".context", "docs", "adrs", "README.md");
    const newReadme = join(root, ".context", "adrs", "README.md");
    assert.ok(existsSync(legacyReadme), "README should be at legacy when ADRs are there");
    assert.ok(!existsSync(newReadme), "should NOT create new path if only legacy has ADRs");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
