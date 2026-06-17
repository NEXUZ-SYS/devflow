// Critério 3 — separação de camadas. Run: node --test tests/odoo-artifacts/layer-separation.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { nxzHits, l10nBrHits, l1Standards, L1_FILES, L2_FILES } from "./lib/artifact-lint.mjs";

describe("separação de camadas", () => {
  // L1 skills: sem nxz (palavra solta, prefixo ou nome de classe) nem l10n_br.
  for (const file of L1_FILES.skills) {
    it(`${file} (L1 skill) sem nxz/l10n_br`, () => {
      const text = readFileSync(file, "utf-8");
      assert.deepEqual(nxzHits(text), [], `nxz em L1: ${file}`);
      assert.deepEqual(l10nBrHits(text), [], `l10n_br em L1: ${file}`);
    });
  }
  // I2: standards que permanecem no profile odoo também ficam livres de nxz.
  for (const file of l1Standards()) {
    it(`${file} (L1 standard) sem nxz`, () => {
      assert.deepEqual(nxzHits(readFileSync(file, "utf-8")), [], `nxz em std odoo: ${file}`);
    });
  }
  // L2: sem nxz. Guard existsSync — L2 é criada na Task 3.
  for (const file of L2_FILES.skills) {
    it(`${file} (L2) sem nxz`, () => {
      if (!existsSync(file)) return;
      assert.deepEqual(nxzHits(readFileSync(file, "utf-8")), [], `nxz em L2: ${file}`);
    });
  }
});
