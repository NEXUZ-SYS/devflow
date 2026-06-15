// skills/import-reversa/tests/skill-structure.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SKILL = readFileSync(join(import.meta.dirname, "..", "SKILL.md"), "utf-8");

describe("SKILL.md import-reversa", () => {
  it("tem frontmatter com name e description", () => {
    assert.match(SKILL, /^---\n[\s\S]*?name:\s*.+[\s\S]*?description:\s*.+[\s\S]*?\n---/);
  });
  it("descreve as 4 etapas interativas obrigatórias", () => {
    assert.match(SKILL, /destino/i);
    assert.match(SKILL, /bootstrap/i);
    assert.match(SKILL, /readiness/i);
    assert.match(SKILL, /reconcilia/i);
  });
  it("referencia a lib do pipeline e o contrato", () => {
    assert.match(SKILL, /scripts\/reversa-import\/pipeline\.mjs/);
    assert.match(SKILL, /reaproveita.*project-init|devflow:project-init/i);
  });
  it("enuncia a invariante de não-destrutividade e fixture read-only", () => {
    assert.match(SKILL, /não-destrutiv|nunca.*sobrescrev|WIP/i);
  });
});
