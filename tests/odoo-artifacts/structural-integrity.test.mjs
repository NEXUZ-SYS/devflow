// Critério 4 — integridade estrutural. Run: node --test tests/odoo-artifacts/structural-integrity.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseFrontmatter, sectionNumbers, subsectionMismatches, L1_FILES } from "./lib/artifact-lint.mjs";

describe("integridade estrutural", () => {
  for (const file of L1_FILES.skills) {
    it(`${file}: H2 monotônico e sem duplicata`, () => {
      const { body } = parseFrontmatter(readFileSync(file, "utf-8"));
      const nums = sectionNumbers(body);
      const sorted = [...nums].sort((a, b) => a - b);
      assert.deepEqual(nums, sorted, `H2 fora de ordem em ${file}: ${nums.join(",")}`);
      assert.equal(new Set(nums).size, nums.length, `H2 duplicado em ${file}: ${nums.join(",")}`);
    });
    it(`${file}: subseções coerentes com o pai (### N.M sob ## N.)`, () => {
      const { body } = parseFrontmatter(readFileSync(file, "utf-8"));
      const bad = subsectionMismatches(body);
      assert.deepEqual(bad, [], `subseção fora do pai em ${file}: ${JSON.stringify(bad)}`);
    });
  }
});
