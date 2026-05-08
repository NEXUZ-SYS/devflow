#!/usr/bin/env node
// tests/validation/test-adr-audit-legacy-warning.mjs
// Verifies adr-audit emits LEGACY_PATH_DETECTED to stderr when an audited ADR
// lives in .context/docs/adrs/ AND the project hasn't migrated yet.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, relative } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

const SCRIPT = join(process.cwd(), "scripts", "adr-audit.mjs");

const ADR = `---
type: adr
name: foo
description: Foo description here
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
- **Status:** Aprovado
- **Escopo:** Project
- **Stack:** universal
- **Categoria:** Arquitetura

**Contexto.** Test ADR for legacy path detection.

**Decisão.** Use new path going forward.

**Alternativas.**
- Option A — keep legacy
- Option B — migrate now

**Consequências.**

Positivas:
- cleaner

Negativas:
- transition cost

**Guardrails.**
- SEMPRE usar .context/adrs/ daqui pra frente
- NUNCA criar ADRs em paths legados

**Enforcement.**
- [ ] Audit em CI bloqueia legado
`;

function runAudit(cwd, file) {
  return execFileSync(
    "sh",
    ["-c", `node ${SCRIPT} ${file} 2>&1 || true`],
    { cwd, encoding: "utf-8" }
  );
}

test("adr-audit emits LEGACY_PATH_DETECTED for legacy-path ADR", () => {
  const root = mkdtempSync(join(tmpdir(), "adr-legacy-"));
  try {
    const adrDir = join(root, ".context", "docs", "adrs");
    mkdirSync(adrDir, { recursive: true });
    const adrFile = join(adrDir, "001-foo-v1.0.0.md");
    writeFileSync(adrFile, ADR);

    const out = runAudit(root, relative(root, adrFile));
    assert.match(out, /LEGACY_PATH_DETECTED/);
    assert.match(out, /\.context\/docs\/adrs\//);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("adr-audit does NOT emit LEGACY warning when ADR is in canonical path", () => {
  const root = mkdtempSync(join(tmpdir(), "adr-canonical-"));
  try {
    const adrDir = join(root, ".context", "adrs");
    mkdirSync(adrDir, { recursive: true });
    const adrFile = join(adrDir, "001-foo-v1.0.0.md");
    writeFileSync(adrFile, ADR);

    const out = runAudit(root, relative(root, adrFile));
    assert.doesNotMatch(out, /LEGACY_PATH_DETECTED/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("adr-audit does NOT emit LEGACY warning when both paths exist", () => {
  // When .context/adrs/ exists, isLegacy is false even if legacy also exists.
  // Only "stuck on legacy" projects get the warning.
  const root = mkdtempSync(join(tmpdir(), "adr-both-"));
  try {
    mkdirSync(join(root, ".context", "adrs"), { recursive: true });
    const adrDir = join(root, ".context", "docs", "adrs");
    mkdirSync(adrDir, { recursive: true });
    const adrFile = join(adrDir, "001-foo-v1.0.0.md");
    writeFileSync(adrFile, ADR);

    const out = runAudit(root, relative(root, adrFile));
    assert.doesNotMatch(out, /LEGACY_PATH_DETECTED/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
