/**
 * Unit tests for standard-from-concern.mjs.
 * Run: node --test tests/validation/test-standard-from-concern.mjs
 *
 * Covers baseline standard generation:
 *   - frontmatter + 4 sections, no enrich (placeholders kept)
 *   - enrichment fills placeholders + Linter bullets + relatedAdrs
 *   - defaultApplyTo from concern, override supported
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { generateStandardFromConcern } from "../../scripts/lib/standard-from-concern.mjs";
import { loadTaxonomy } from "../../scripts/lib/taxonomy-loader.mjs";

const MINI = resolve(import.meta.dirname, "fixtures/taxonomy-mini.yaml");

async function concern(id) {
  const tax = await loadTaxonomy({ distributedPath: MINI, projectRoot: null });
  return tax.entries.find(e => e.id === id);
}

describe("standard-from-concern", () => {
  it("generates baseline with frontmatter + 4 sections, no enrich", async () => {
    const entry = await concern("runtime-validation");
    const result = generateStandardFromConcern({ concern: entry, enrichment: null });
    assert.ok(result.frontmatter.includes("id: std-runtime-validation"));
    assert.ok(result.frontmatter.includes("weakStandardWarning: true"));
    assert.match(result.frontmatter, /relatedAdrs:\s*\[\]/);
    assert.ok(result.body.includes("## Princípios"));
    assert.ok(result.body.includes("## Anti-patterns"));
    assert.ok(result.body.includes("## Linter"));
    assert.ok(result.body.includes("## Referência"));
    assert.ok(result.body.includes("{{boundaryList}}"),
      "placeholder kept when no enrich");
  });

  it("fills placeholders + Linter bullets + relatedAdrs when enriched", async () => {
    const entry = await concern("runtime-validation");
    const enrichment = {
      guardrails: ["SEMPRE Schema.parse na borda"],
      enforcement: ["Code review: parse na primeira linha após I/O"],
      sources: ["adr-zod-frontend"],
      adrSlugs: ["adr-zod-frontend"],
      boundaryList: "HTTP, IPC Tauri, localStorage",
    };
    const result = generateStandardFromConcern({ concern: entry, enrichment });
    assert.ok(result.body.includes("HTTP, IPC Tauri, localStorage"),
      "boundary placeholder filled");
    assert.ok(!result.body.includes("{{boundaryList}}"), "no leftover placeholder");
    assert.ok(result.body.includes("Code review: parse na primeira linha"),
      "enforcement bullet in Linter section");
    assert.ok(result.frontmatter.includes("adr-zod-frontend"));
  });

  it("uses defaultApplyTo from the concern entry", async () => {
    const entry = await concern("runtime-validation");
    const result = generateStandardFromConcern({ concern: entry, enrichment: null });
    assert.ok(result.frontmatter.includes('"**/*.ts"'));
    assert.ok(result.frontmatter.includes('"**/*.py"'));
  });

  it("supports applyTo override", async () => {
    const entry = await concern("runtime-validation");
    const result = generateStandardFromConcern({
      concern: entry,
      enrichment: null,
      applyTo: ["src/api/**/*.ts"],
    });
    assert.ok(result.frontmatter.includes('"src/api/**/*.ts"'));
    assert.ok(!result.frontmatter.includes('"**/*.tsx"'));
  });

  it("renders anti-patterns table from concern antiPatternTemplate", async () => {
    const entry = await concern("runtime-validation");
    const result = generateStandardFromConcern({ concern: entry, enrichment: null });
    assert.ok(result.body.includes("| Errado | Certo |"));
    assert.ok(result.body.includes("Schema.parse(input)"));
  });
});
