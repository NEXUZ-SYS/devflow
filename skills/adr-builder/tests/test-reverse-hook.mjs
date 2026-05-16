/**
 * F4 integration — adr-builder Step 5e reverse hook (via CLI search).
 * Run: node --test skills/adr-builder/tests/test-reverse-hook.mjs
 *
 * Step 5e is a conversational skill step; this test exercises the CLI
 * primitive it relies on (`devflow standards search`):
 *   - search --by-concern finds ADRs matching a concern's inverseHints
 *   - search --by-guardrail finds concern stds referencing an ADR
 *   - both emit valid JSON for the skill to parse
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const REPO = resolve(import.meta.dirname, "../../..");
const CLI = join(REPO, "scripts/devflow-standards.mjs");
const TAXONOMY = join(REPO, "skills/standards-builder/references/taxonomy-of-concerns.yaml");
const FIX = join(REPO, "tests/validation/fixtures");

function setupProject() {
  const tmp = mkdtempSync(join(tmpdir(), "f4-"));
  mkdirSync(join(tmp, ".context/standards/machine"), { recursive: true });
  mkdirSync(join(tmp, ".context/adrs"), { recursive: true });
  writeFileSync(join(tmp, ".context/.devflow.yaml"), "name: test\n");
  // Pre-existing concern std referencing adr-zod-frontend.
  copyFileSync(join(FIX, "std-runtime-validation-fake.md"),
    join(tmp, ".context/standards/std-runtime-validation.md"));
  writeFileSync(join(tmp, ".context/standards/machine/std-runtime-validation.js"),
    "process.exit(0);\n");
  return tmp;
}

function cli(tmp, ...args) {
  return spawnSync("node", [CLI, ...args, `--project=${tmp}`], { encoding: "utf-8" });
}

describe("F4 — adr-builder Step 5e reverse hook (CLI search primitive)", () => {
  it("search --by-concern finds a newly-added ADR matching the concern", () => {
    const tmp = setupProject();
    // Simulate adr-builder having just committed a new Zod ADR.
    copyFileSync(join(FIX, "adr-zod-fake.md"),
      join(tmp, ".context/adrs/022-adr-valibot-frontend-v1.0.0.md"));
    const res = cli(tmp, "search", "--by-concern=runtime-validation", `--taxonomy=${TAXONOMY}`);
    assert.equal(res.status, 0, `stderr: ${res.stderr}`);
    const parsed = JSON.parse(res.stdout);
    assert.ok(Array.isArray(parsed));
    assert.ok(parsed.length >= 1, "should find the Zod ADR via inverseHints");
    rmSync(tmp, { recursive: true, force: true });
  });

  it("search --by-guardrail finds the concern std referencing the ADR (INJECT signal)", () => {
    const tmp = setupProject();
    const res = cli(tmp, "search", "--by-guardrail=adr-zod-frontend");
    assert.equal(res.status, 0, `stderr: ${res.stderr}`);
    const parsed = JSON.parse(res.stdout);
    assert.ok(parsed.some(s => s.id === "std-runtime-validation"),
      "existing concern std → Step 5e INJECT path");
    rmSync(tmp, { recursive: true, force: true });
  });

  it("search --by-guardrail returns empty for an unreferenced ADR (CREATE signal)", () => {
    const tmp = setupProject();
    const res = cli(tmp, "search", "--by-guardrail=adr-brand-new-decision");
    assert.equal(res.status, 0);
    const parsed = JSON.parse(res.stdout);
    assert.deepEqual(parsed, [], "no std → Step 5e CREATE path");
    rmSync(tmp, { recursive: true, force: true });
  });
});
