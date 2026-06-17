// Critério 6 — cross-refs resolvem. Run: node --test tests/odoo-artifacts/cross-refs.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { parseFrontmatter, referencedRefs, L1_FILES, L2_FILES, L3_FILES } from "./lib/artifact-lint.mjs";

describe("cross-refs resolvem", () => {
  for (const file of [...L1_FILES.skills, ...L2_FILES.skills, ...L3_FILES.skills]) {
    it(`refs citadas em ${file} existem`, () => {
      if (!existsSync(file)) return; // skills L2/L3 criadas em tasks posteriores
      const { body } = parseFrontmatter(readFileSync(file, "utf-8"));
      for (const ref of referencedRefs(body)) {
        const p = resolve(dirname(file), "references", ref);
        assert.ok(existsSync(p), `ref quebrada: ${ref} em ${file}`);
      }
    });
  }
});
