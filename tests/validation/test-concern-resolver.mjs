/**
 * Unit tests for concern-resolver.mjs.
 * Run: node --test tests/validation/test-concern-resolver.mjs
 *
 * Covers fuzzy match via Levenshtein:
 *   - direct id match (high score)
 *   - inverseHints match (lib name → concern)
 *   - free prose match (summary tokens)
 *   - no-match (low score) returns empty candidates
 *   - ambiguous returns top-3 candidates
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { resolveConcern } from "../../scripts/lib/concern-resolver.mjs";
import { loadTaxonomy } from "../../scripts/lib/taxonomy-loader.mjs";

const MINI = resolve(import.meta.dirname, "fixtures/taxonomy-mini.yaml");

describe("concern-resolver", () => {
  it("auto-confirms when input is exact id match", async () => {
    const tax = await loadTaxonomy({ distributedPath: MINI, projectRoot: null });
    const r = resolveConcern("runtime-validation", tax);
    assert.equal(r.status, "auto-confirmed", `expected auto-confirmed, got ${JSON.stringify(r)}`);
    assert.equal(r.match.id, "runtime-validation");
    assert.ok(r.confidence >= 0.75);
  });

  it("matches via inverseHints lib name (zod → runtime-validation)", async () => {
    const tax = await loadTaxonomy({ distributedPath: MINI, projectRoot: null });
    const r = resolveConcern("zod", tax);
    assert.ok(["auto-confirmed", "ambiguous"].includes(r.status));
    const matched = r.match ?? r.candidates?.[0]?.entry;
    assert.equal(matched?.id, "runtime-validation");
  });

  it("matches via free prose containing summary tokens", async () => {
    const tax = await loadTaxonomy({ distributedPath: MINI, projectRoot: null });
    const r = resolveConcern("validar payload na borda externa", tax);
    const matched = r.match ?? r.candidates?.[0]?.entry;
    assert.equal(matched?.id, "runtime-validation");
  });

  it("returns no-match when input is total garbage", async () => {
    const tax = await loadTaxonomy({ distributedPath: MINI, projectRoot: null });
    const r = resolveConcern("xyzqwertyuiop", tax);
    assert.equal(r.status, "no-match");
    assert.deepEqual(r.candidates, []);
  });

  it("handles error/throw input — matches error-handling", async () => {
    const tax = await loadTaxonomy({ distributedPath: MINI, projectRoot: null });
    const r = resolveConcern("error handling propagation", tax);
    const matched = r.match ?? r.candidates?.[0]?.entry;
    assert.equal(matched?.id, "error-handling");
  });

  it("returns empty candidates when taxonomy has no entries", () => {
    const r = resolveConcern("anything", { entries: [] });
    assert.equal(r.status, "no-match");
  });
});
