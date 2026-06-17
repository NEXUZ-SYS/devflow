// Critério 7 — front-matter válido. Run: node --test tests/odoo-artifacts/frontmatter.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { parseFrontmatter, L1_FILES, L2_FILES, L3_FILES } from "./lib/artifact-lint.mjs";

describe("front-matter válido", () => {
  for (const file of [...L1_FILES.skills, ...L2_FILES.skills, ...L3_FILES.skills]) {
    it(`${file}`, () => {
      if (!existsSync(file)) return;
      const { data } = parseFrontmatter(readFileSync(file, "utf-8"));
      assert.ok(data && data.name, `front-matter sem 'name' em ${file}`);
    });
  }
});
