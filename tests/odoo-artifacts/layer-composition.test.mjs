// M2 — L3 referencia as camadas base. Run: node --test tests/odoo-artifacts/layer-composition.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { L3_FILES } from "./lib/artifact-lint.mjs";

describe("L3 referencia as camadas base", () => {
  for (const file of L3_FILES.skills) {
    it(`${file} cita odoo-development, frontend-specialist-odoo e odoo-l10n-br`, () => {
      if (!existsSync(file)) return;
      const text = readFileSync(file, "utf-8");
      for (const base of ["odoo-development", "frontend-specialist-odoo", "odoo-l10n-br"]) {
        assert.ok(text.includes(base), `L3 não referencia ${base}`);
      }
    });
  }
});
