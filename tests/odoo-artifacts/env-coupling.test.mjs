// Critério 2 — L1+L2 (e agente) sem acoplamento de ambiente.
// Run: node --test tests/odoo-artifacts/env-coupling.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { envCouplingHits, L1_FILES, L2_FILES, REPO } from "./lib/artifact-lint.mjs";

describe("L1+L2 sem acoplamento de ambiente", () => {
  for (const file of [...L1_FILES.skills, ...L2_FILES.skills]) {
    it(`${file} não tem path/DB/porta/service hardcoded`, () => {
      if (!existsSync(file)) return; // L2 criada na Task 3
      const hits = envCouplingHits(readFileSync(file, "utf-8"));
      assert.deepEqual(hits, [], `acoplamento de env em ${file}: ${hits.join(", ")}`);
    });
  }
});

const AGENT = resolve(REPO, "agents/odoo-specialist.md");
describe("agente sem env hardcoded", () => {
  it("agents/odoo-specialist.md", () => {
    const hits = envCouplingHits(readFileSync(AGENT, "utf-8"));
    assert.deepEqual(hits, [], `env no agente: ${hits.join(", ")}`);
  });
});
