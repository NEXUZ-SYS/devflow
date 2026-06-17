// Critério 1 — L1 cobre Odoo 12–18. Run: node --test tests/odoo-artifacts/version-coverage.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { versionsCovered, REQUIRED_VERSIONS, L1_FILES } from "./lib/artifact-lint.mjs";

describe("L1 cobre Odoo 12–18", () => {
  for (const file of L1_FILES.skills) {
    it(`${file} cita todas as versões 12–18`, () => {
      const found = versionsCovered(readFileSync(file, "utf-8"));
      const missing = REQUIRED_VERSIONS.filter((v) => !found.has(v));
      assert.deepEqual(missing, [], `versões ausentes em ${file}: ${missing.join(", ")}`);
    });
  }
});
