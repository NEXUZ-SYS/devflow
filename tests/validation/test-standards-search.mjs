/**
 * Unit tests for standards-search.mjs.
 * Run: node --test tests/validation/test-standards-search.mjs
 *
 * Covers reverse lookups:
 *   - searchByGuardrail(adrSlug) → std with relatedAdrs containing slug
 *   - searchByConcern(concernId) → ADRs whose stack/category matches inverseHints/relatedAdrCategories
 *   - graceful empty when .context/ is absent
 *   - skips deprecated stds
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  searchByGuardrail,
  searchByConcern,
} from "../../scripts/lib/standards-search.mjs";

const FIX = resolve(import.meta.dirname, "fixtures");
const MINI = resolve(FIX, "taxonomy-mini.yaml");

function setupProject() {
  const tmp = mkdtempSync(join(tmpdir(), "search-test-"));
  mkdirSync(join(tmp, ".context/standards/machine"), { recursive: true });
  mkdirSync(join(tmp, ".context/adrs"), { recursive: true });
  copyFileSync(join(FIX, "std-zod-fake.md"), join(tmp, ".context/standards/std-zod.md"));
  copyFileSync(join(FIX, "std-runtime-validation-fake.md"),
    join(tmp, ".context/standards/std-runtime-validation.md"));
  copyFileSync(join(FIX, "adr-zod-fake.md"),
    join(tmp, ".context/adrs/009-adr-zod-frontend-v1.0.0.md"));
  copyFileSync(join(FIX, "adr-pydantic-fake.md"),
    join(tmp, ".context/adrs/010-adr-pydantic-backend-v1.0.0.md"));
  return tmp;
}

describe("standards-search", () => {
  it("searchByGuardrail returns std referencing the adr slug", async () => {
    const tmp = setupProject();
    const result = await searchByGuardrail("adr-zod-frontend", { projectRoot: tmp });
    assert.ok(result.length >= 2, `expected >=2 stds, got ${result.length}`);
    assert.ok(result.find(s => s.id === "std-zod"));
    assert.ok(result.find(s => s.id === "std-runtime-validation"));
    rmSync(tmp, { recursive: true, force: true });
  });

  it("searchByGuardrail returns empty when adr not referenced", async () => {
    const tmp = setupProject();
    const result = await searchByGuardrail("adr-nonexistent", { projectRoot: tmp });
    assert.deepEqual(result, []);
    rmSync(tmp, { recursive: true, force: true });
  });

  it("searchByGuardrail skips deprecated stds", async () => {
    const tmp = setupProject();
    // Mark std-zod as deprecated
    const stdPath = join(tmp, ".context/standards/std-zod.md");
    const fs = await import("node:fs");
    const old = fs.readFileSync(stdPath, "utf-8");
    fs.writeFileSync(stdPath, old.replace("id: std-zod", "id: std-zod\ndeprecated: true"));
    const result = await searchByGuardrail("adr-zod-frontend", { projectRoot: tmp });
    assert.ok(!result.find(s => s.id === "std-zod"), "deprecated std should be excluded");
    assert.ok(result.find(s => s.id === "std-runtime-validation"));
    rmSync(tmp, { recursive: true, force: true });
  });

  it("searchByConcern returns ADRs matching inverseHints lib", async () => {
    const tmp = setupProject();
    const result = await searchByConcern("runtime-validation", {
      projectRoot: tmp,
      distributedPath: MINI,
    });
    assert.ok(result.length >= 1, `expected ≥1 ADR, got ${result.length}`);
    assert.ok(result.some(a => a.slug === "adr-zod-frontend"));
    rmSync(tmp, { recursive: true, force: true });
  });

  it("returns empty when .context/standards absent", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "search-empty-"));
    const result = await searchByGuardrail("adr-zod", { projectRoot: tmp });
    assert.deepEqual(result, []);
    rmSync(tmp, { recursive: true, force: true });
  });
});
