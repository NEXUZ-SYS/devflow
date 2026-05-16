/**
 * Unit tests for standard-enrich.mjs.
 * Run: node --test tests/validation/test-standard-enrich.mjs
 *
 * Covers Guardrails + Enforcement extraction from ADRs:
 *   - extracts ## Guardrails and ## Enforcement bullets
 *   - does NOT leak ## Decisão / ## Contexto / ## Alternativas content
 *   - dedups identical guardrails across multiple ADRs
 *   - graceful empty when ADR lacks the sections
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { enrichFromAdrs } from "../../scripts/lib/standard-enrich.mjs";

const FIX = resolve(import.meta.dirname, "fixtures");

describe("standard-enrich", () => {
  it("extracts Guardrails and Enforcement bullets from an ADR", async () => {
    const result = await enrichFromAdrs([resolve(FIX, "adr-zod-fake.md")]);
    assert.equal(result.guardrails.length, 2, `guardrails: ${JSON.stringify(result.guardrails)}`);
    assert.ok(result.guardrails.some(g => g.includes("Schema.parse na borda")));
    assert.equal(result.enforcement.length, 2, `enforcement: ${JSON.stringify(result.enforcement)}`);
    assert.ok(result.enforcement.some(e => e.includes("Code review")));
  });

  it("does NOT include Decisão / Contexto / Alternativas content", async () => {
    const result = await enrichFromAdrs([resolve(FIX, "adr-zod-fake.md")]);
    const joined = JSON.stringify(result);
    assert.ok(!joined.includes("Adotar Zod"), "Decisão prose leaked");
    assert.ok(!joined.includes("apagam em runtime"), "Contexto prose leaked");
  });

  it("dedups identical guardrails across multiple ADRs", async () => {
    const result = await enrichFromAdrs([
      resolve(FIX, "adr-zod-fake.md"),
      resolve(FIX, "adr-zod-fake.md"),
    ]);
    assert.equal(result.guardrails.length, 2, "duplicate ADR should not double guardrails");
  });

  it("merges guardrails from different ADRs", async () => {
    const result = await enrichFromAdrs([
      resolve(FIX, "adr-zod-fake.md"),
      resolve(FIX, "adr-pydantic-fake.md"),
    ]);
    assert.equal(result.guardrails.length, 4, `expected 4 merged, got ${result.guardrails.length}`);
    assert.equal(result.sources.length, 2);
  });

  it("returns empty arrays when ADR has no Guardrails/Enforcement", async () => {
    const result = await enrichFromAdrs([resolve(FIX, "adr-no-stack-fake.md")]);
    assert.deepEqual(result.guardrails, []);
    assert.deepEqual(result.enforcement, []);
  });
});
