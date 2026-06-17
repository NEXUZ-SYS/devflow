// Critério 5 — grounding híbrido. Run: node --test tests/odoo-artifacts/grounding.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { L1_FILES } from "./lib/artifact-lint.mjs";

const POINTER = /(search_docs|find_version|github\.com\/oca|odoo\.com\/documentation)/i;

describe("grounding híbrido: L1 aponta para fonte versionada/OCA", () => {
  for (const file of L1_FILES.skills) {
    it(`${file} contém ponteiro de grounding`, () => {
      assert.ok(POINTER.test(readFileSync(file, "utf-8")), `sem ponteiro em ${file}`);
    });
  }
});
