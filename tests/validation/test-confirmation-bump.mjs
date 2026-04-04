/**
 * Structural tests for prevc-confirmation version bump step.
 * Validates that bump step exists and appears before branch finalization.
 * Run: node --test tests/validation/test-confirmation-bump.mjs
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");
const read = (rel) => readFileSync(resolve(ROOT, rel), "utf-8");

describe("prevc-confirmation version bump", () => {
  const content = read("skills/prevc-confirmation/SKILL.md");

  it("should contain a Version Bump step", () => {
    assert.match(content, /Version Bump|Bump de Vers/i,
      "SKILL.md must have a Version Bump step");
  });

  it("should have bump step before Finalize Branch step", () => {
    const bumpIndex = content.search(/Version Bump|Bump de Vers/i);
    const finalizeIndex = content.search(/Finalize Branch|finishing-a-development-branch/);
    assert.ok(bumpIndex > -1, "bump step must exist");
    assert.ok(finalizeIndex > -1, "finalize step must exist");
    assert.ok(bumpIndex < finalizeIndex,
      `bump step (pos ${bumpIndex}) must appear before finalize step (pos ${finalizeIndex})`);
  });

  it("should detect project capabilities for bump", () => {
    assert.match(content, /bump-version\.sh|package\.json/,
      "SKILL.md must reference bump detection (scripts/bump-version.sh or package.json)");
  });

  it("should adapt bump behavior by autonomy mode", () => {
    assert.match(content, /supervised|autonomous|assisted/i,
      "SKILL.md must reference autonomy modes for bump behavior");
  });
});
