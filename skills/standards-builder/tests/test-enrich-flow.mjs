/**
 * F2 integration — FROM-CONCERN + enrich.
 * Run: node --test skills/standards-builder/tests/test-enrich-flow.mjs
 *
 * Exercises --enrich-from-adr:
 *   - relatedAdrs populated from the enriched ADR
 *   - Linter section seeded with the ADR's Enforcement bullets
 *   - Princípios section does NOT contain the ADR's Decisão prose
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const REPO = resolve(import.meta.dirname, "../../..");
const CLI = join(REPO, "scripts/devflow-standards.mjs");
const TAXONOMY = join(REPO, "skills/standards-builder/references/taxonomy-of-concerns.yaml");
const FIX = join(REPO, "tests/validation/fixtures");

function setupProject() {
  const tmp = mkdtempSync(join(tmpdir(), "f2-"));
  mkdirSync(join(tmp, ".context/standards/machine"), { recursive: true });
  mkdirSync(join(tmp, ".context/adrs"), { recursive: true });
  writeFileSync(join(tmp, ".context/.devflow.yaml"), "name: test\n");
  copyFileSync(join(FIX, "adr-zod-fake.md"), join(tmp, ".context/adrs/009-adr-zod-frontend-v1.0.0.md"));
  return tmp;
}

function cli(tmp, ...args) {
  return spawnSync("node", [CLI, ...args, `--project=${tmp}`, `--taxonomy=${TAXONOMY}`],
    { encoding: "utf-8" });
}

function section(content, heading) {
  const m = content.match(new RegExp(`## ${heading}([\\s\\S]*?)(?=\\n## |$)`));
  return m ? m[1] : "";
}

describe("F2 — FROM-CONCERN + enrich", () => {
  it("populates relatedAdrs from --enrich-from-adr", () => {
    const tmp = setupProject();
    const res = cli(tmp, "new", "--concern=runtime-validation", "--enrich-from-adr=009");
    assert.equal(res.status, 0, `stderr: ${res.stderr}`);
    const content = readFileSync(join(tmp, ".context/standards/std-runtime-validation.md"), "utf-8");
    assert.match(content, /adr-zod-frontend/);
    rmSync(tmp, { recursive: true, force: true });
  });

  it("Linter section contains enforcement bullets derived from the ADR", () => {
    const tmp = setupProject();
    cli(tmp, "new", "--concern=runtime-validation", "--enrich-from-adr=009");
    const content = readFileSync(join(tmp, ".context/standards/std-runtime-validation.md"), "utf-8");
    const linter = section(content, "Linter");
    assert.match(linter, /Code review/, "ADR enforcement bullet should land in Linter section");
    rmSync(tmp, { recursive: true, force: true });
  });

  it("Princípios section does NOT contain ADR Decisão prose (negative assertion)", () => {
    const tmp = setupProject();
    cli(tmp, "new", "--concern=runtime-validation", "--enrich-from-adr=009");
    const content = readFileSync(join(tmp, ".context/standards/std-runtime-validation.md"), "utf-8");
    const principios = section(content, "Princípios");
    assert.ok(!principios.includes("Adotar Zod 4.1.x"),
      "ADR Decisão prose must NOT leak into Princípios");
    rmSync(tmp, { recursive: true, force: true });
  });

  it("audit gate stays PASSED after enrich", () => {
    const tmp = setupProject();
    cli(tmp, "new", "--concern=runtime-validation", "--enrich-from-adr=009");
    const res = cli(tmp, "audit", "runtime-validation");
    assert.match(res.stdout, /Gate: PASSED/, `audit: ${res.stdout}`);
    rmSync(tmp, { recursive: true, force: true });
  });
});
