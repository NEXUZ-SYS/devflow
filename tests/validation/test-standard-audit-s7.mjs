/**
 * Unit tests for standard-audit.mjs check S7 (lib-centric detection).
 * Run: node --test tests/validation/test-standard-audit-s7.mjs
 *
 * S7 is a non-blocking WARN: a std whose id matches a known library name
 * (from the taxonomy's inverseHints) is flagged as lib-centric, suggesting
 * migration to a concern-based standard. Deprecated stds skip S7.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { auditStandard } from "../../scripts/lib/standard-audit.mjs";

const MINI = resolve(import.meta.dirname, "fixtures/taxonomy-mini.yaml");

function setupStd(id, extraFrontmatter = "") {
  const tmp = mkdtempSync(join(tmpdir(), "audit-s7-"));
  const stdsDir = join(tmp, ".context/standards");
  const machineDir = join(stdsDir, "machine");
  mkdirSync(machineDir, { recursive: true });
  writeFileSync(join(machineDir, `${id}.js`), "process.exit(0);\n");
  writeFileSync(join(stdsDir, `${id}.md`), `---
id: ${id}
description: fixture standard for S7
version: 1.0.0
applyTo: ["**/*.ts"]
relatedAdrs: []
enforcement:
  linter: standards/machine/${id}.js
weakStandardWarning: true${extraFrontmatter}
---
# Standard
## Princípios
Regra operacional.
## Anti-patterns
| Errado | Certo |
|---|---|
| x | y |
## Linter
Verifica algo.
## Referência
ok
`);
  return { tmp, stdPath: join(stdsDir, `${id}.md`) };
}

describe("standard-audit S7 — lib-centric detection", () => {
  it("WARN when std id matches a known lib (std-zod)", () => {
    const { tmp, stdPath } = setupStd("std-zod");
    const r = auditStandard(stdPath, tmp, { taxonomyPath: MINI });
    const s7 = r.checks.find(c => c.id === "S7");
    assert.ok(s7, "S7 check must be present");
    assert.equal(s7.status, "WARN");
    assert.match(s7.diagnosis, /runtime-validation/);
    rmSync(tmp, { recursive: true, force: true });
  });

  it("PASS when std id is concern-based (std-runtime-validation)", () => {
    const { tmp, stdPath } = setupStd("std-runtime-validation");
    const r = auditStandard(stdPath, tmp, { taxonomyPath: MINI });
    const s7 = r.checks.find(c => c.id === "S7");
    assert.equal(s7.status, "PASS");
    rmSync(tmp, { recursive: true, force: true });
  });

  it("WARN when id prefix matches a known lib (std-zod-frontend)", () => {
    const { tmp, stdPath } = setupStd("std-zod-frontend");
    const r = auditStandard(stdPath, tmp, { taxonomyPath: MINI });
    const s7 = r.checks.find(c => c.id === "S7");
    assert.equal(s7.status, "WARN");
    rmSync(tmp, { recursive: true, force: true });
  });

  it("skips S7 (PASS) when std has deprecated: true", () => {
    const { tmp, stdPath } = setupStd("std-zod", "\ndeprecated: true");
    const r = auditStandard(stdPath, tmp, { taxonomyPath: MINI });
    const s7 = r.checks.find(c => c.id === "S7");
    assert.equal(s7.status, "PASS");
    assert.match(s7.diagnosis, /deprecated/);
    rmSync(tmp, { recursive: true, force: true });
  });

  it("S7 WARN does not block the gate (gate stays PASSED)", () => {
    const { tmp, stdPath } = setupStd("std-zod");
    const r = auditStandard(stdPath, tmp, { taxonomyPath: MINI });
    assert.equal(r.gate, "PASSED", "S7 WARN must not block the gate");
    rmSync(tmp, { recursive: true, force: true });
  });
});
