#!/usr/bin/env node
// tests/validation/test-standards-scaffold.mjs
// Structural test: .context/standards/README.md authoring guide must exist
// with the required H2 sections (per ADR-002 Enforcement).
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const README = ".context/standards/README.md";

test("standards/README.md exists at canonical path", () => {
  assert.ok(existsSync(README), `${README} must exist`);
});

test("standards/README.md has required H2 sections", () => {
  const content = readFileSync(README, "utf-8");
  const required = [
    "## O que é um Standard",
    "## Frontmatter obrigatório",
    "## applyTo (glob subset)",
    "## Linter executável",
    "## Anti-patterns",
    "## Como criar",
    "## Como validar",
  ];
  for (const section of required) {
    assert.ok(
      content.includes(section),
      `Required section "${section}" missing from README.md`
    );
  }
});

test("standards/machine/ directory exists with .gitkeep", () => {
  assert.ok(
    existsSync(".context/standards/machine/.gitkeep"),
    ".context/standards/machine/.gitkeep must exist (committed empty dir)"
  );
});

test("standards/README.md mentions SI-4 linter sandboxing", () => {
  const content = readFileSync(README, "utf-8");
  assert.ok(
    content.includes("SI-4") || content.includes("sandboxing"),
    "README must reference SI-4 linter sandboxing constraints"
  );
});
