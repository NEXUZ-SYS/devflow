/**
 * Unit tests for taxonomy-loader.mjs.
 * Run: node --test tests/validation/test-taxonomy-loader.mjs
 *
 * Covers:
 *   - load distributed taxonomy with multi-line block scalars (|)
 *   - merge local concerns.local.yaml shadowing distributed entries
 *   - graceful empty result when distributed file missing
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolve, join } from "node:path";
import { writeFileSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { loadTaxonomy } from "../../scripts/lib/taxonomy-loader.mjs";

const MINI = resolve(import.meta.dirname, "fixtures/taxonomy-mini.yaml");

describe("taxonomy-loader", () => {
  it("loads distributed taxonomy and returns entries with required fields", async () => {
    const tax = await loadTaxonomy({ distributedPath: MINI, projectRoot: null });
    assert.ok(Array.isArray(tax.entries), "entries should be an array");
    assert.ok(tax.entries.length >= 2, `expected ≥2 entries, got ${tax.entries.length}`);
    const entry = tax.entries.find(e => e.id === "runtime-validation");
    assert.ok(entry, "runtime-validation entry must exist");
    assert.equal(typeof entry.summary, "string");
    assert.equal(typeof entry.category, "string");
    assert.ok(Array.isArray(entry.defaultApplyTo));
    assert.ok(Array.isArray(entry.inverseHints));
    assert.ok(typeof entry.principleTemplate === "string");
    assert.ok(entry.principleTemplate.includes("{{boundaryList}}"),
      "principleTemplate should contain placeholder (block scalar preserved)");
    assert.ok(Array.isArray(entry.antiPatternTemplate));
    assert.equal(typeof entry.antiPatternTemplate[0].rule, "string");
    assert.equal(typeof entry.antiPatternTemplate[0].correct, "string");
  });

  it("merges local concerns.local.yaml shadowing distributed", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "tax-test-"));
    const ctx = join(tmp, ".context/standards");
    mkdirSync(ctx, { recursive: true });
    writeFileSync(join(ctx, "concerns.local.yaml"),
      `entries:\n  - id: runtime-validation\n    summary: LOCAL OVERRIDE\n    category: contracts\n    defaultApplyTo: ["**/*.ts"]\n    inverseHints: []\n    antiPatternTemplate: []\n    linterHints: []\n    relatedAdrCategories: []\n`);
    const tax = await loadTaxonomy({ distributedPath: MINI, projectRoot: tmp });
    const entry = tax.entries.find(e => e.id === "runtime-validation");
    assert.equal(entry.summary, "LOCAL OVERRIDE");
    assert.ok(tax.warnings.some(w => w.includes("shadowed")),
      `expected 'shadowed' warning, got: ${JSON.stringify(tax.warnings)}`);
    rmSync(tmp, { recursive: true, force: true });
  });

  it("returns empty entries gracefully when distributed file missing", async () => {
    const tax = await loadTaxonomy({ distributedPath: "/nonexistent.yaml", projectRoot: null });
    assert.deepEqual(tax.entries, []);
    assert.ok(tax.warnings.some(w => w.includes("not found")));
  });
});
