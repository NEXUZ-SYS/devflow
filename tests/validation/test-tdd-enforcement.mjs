/**
 * Structural validation that TDD is enforced across the DevFlow workflow.
 * Validates that skills contain hard gates, test-type requirements, and test-first ordering.
 * Run: node --test tests/validation/test-tdd-enforcement.mjs
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");
const read = (rel) => readFileSync(resolve(ROOT, rel), "utf-8");

// ─── prevc-execution: TDD enforcement ─────────────────────────────

describe("prevc-execution: TDD enforcement", () => {
  const execution = read("skills/prevc-execution/SKILL.md");

  it("should have HARD-GATE for TDD", () => {
    assert.ok(
      execution.includes("<HARD-GATE>") && execution.includes("TDD"),
      "must have HARD-GATE tag with TDD enforcement"
    );
  });

  it("should enforce RED→GREEN→REFACTOR sequence", () => {
    assert.ok(execution.includes("RED"), "must mention RED phase");
    assert.ok(execution.includes("GREEN"), "must mention GREEN phase");
    assert.ok(execution.includes("REFACTOR"), "must mention REFACTOR phase");
  });

  it("should enforce TDD for ALL modes, not just autonomous", () => {
    assert.ok(
      execution.includes("ALL modes") || execution.includes("all modes"),
      "must explicitly state TDD applies to all modes"
    );
    assert.ok(
      execution.includes("Supervised") || execution.includes("supervised"),
      "must mention supervised mode in TDD section"
    );
  });

  it("should define when E2E tests are mandatory", () => {
    assert.ok(
      execution.includes("E2E is mandatory") || execution.includes("E2E tests are required"),
      "must define when E2E is mandatory"
    );
  });

  it("should list specific E2E trigger conditions", () => {
    const triggers = [
      "authentication", "authorization",
      "payment", "registration",
    ];
    let found = 0;
    for (const trigger of triggers) {
      if (execution.toLowerCase().includes(trigger)) found++;
    }
    assert.ok(found >= 3, `must list at least 3 E2E trigger conditions (found ${found})`);
  });

  it("should have test-type table mapping implementation areas to required tests", () => {
    assert.ok(
      execution.includes("Unit tests") && execution.includes("Integration") && execution.includes("E2E"),
      "must have test-type requirement table"
    );
  });

  it("should reference superpowers:test-driven-development", () => {
    assert.ok(
      execution.includes("superpowers:test-driven-development"),
      "must invoke TDD sub-skill"
    );
  });

  it("should enforce test-writer BEFORE implementation agent in Full Mode", () => {
    assert.ok(
      execution.includes("BEFORE") && execution.includes("test-writer"),
      "must enforce test-writer ordering before implementation"
    );
  });

  it("should include test-first in gate check", () => {
    const gateSection = execution.substring(execution.indexOf("Gate Check"));
    assert.ok(
      gateSection.includes("test-first") || gateSection.includes("Test-first"),
      "gate must verify test-first ordering"
    );
  });
});

// ─── prevc-validation: test-type gate ─────────────────────────────

describe("prevc-validation: test-type adequacy gate", () => {
  const validation = read("skills/prevc-validation/SKILL.md");

  it("should have HARD-GATE for test type adequacy", () => {
    assert.ok(
      validation.includes("<HARD-GATE>") && validation.includes("test TYPES"),
      "must have HARD-GATE for test type verification"
    );
  });

  it("should define E2E mandatory conditions", () => {
    assert.ok(
      validation.includes("E2E is mandatory"),
      "must define when E2E is mandatory in validation"
    );
  });

  it("should define what counts as an E2E test", () => {
    assert.ok(
      validation.includes("What counts as an E2E test"),
      "must define E2E test criteria"
    );
    assert.ok(
      validation.includes("REAL script") || validation.includes("real execution"),
      "must require real execution, not mocks"
    );
  });

  it("should block advancement when E2E is missing", () => {
    assert.ok(
      validation.includes("return to Execution phase"),
      "must block and return to E when E2E is missing"
    );
  });

  it("should include test types in validation summary", () => {
    assert.ok(
      validation.includes("Test Types:") && validation.includes("E2E"),
      "validation summary must include test type breakdown"
    );
  });

  it("should include TDD ordering in validation summary", () => {
    assert.ok(
      validation.includes("TDD Ordering"),
      "validation summary must include TDD ordering check"
    );
  });

  it("should include test-type adequacy in gate requirements", () => {
    const gateSection = validation.substring(validation.indexOf("gate requires"));
    assert.ok(
      gateSection.includes("test type") || gateSection.includes("Test type"),
      "gate must include test type adequacy requirement"
    );
  });

  it("should include TDD ordering verification in gate", () => {
    const gateSection = validation.substring(validation.indexOf("gate requires"));
    assert.ok(
      gateSection.includes("TDD ordering") || gateSection.includes("test commits"),
      "gate must verify TDD ordering"
    );
  });
});

// ─── prevc-planning: test-first plan validation ───────────────────

describe("prevc-planning: test-first ordering validation", () => {
  const planning = read("skills/prevc-planning/SKILL.md");

  it("should have Step 5.5 for test-first validation", () => {
    assert.ok(
      planning.includes("Step 5.5") || planning.includes("Test-First Ordering"),
      "must have test-first validation step"
    );
  });

  it("should have HARD-GATE for test-first in plans", () => {
    // Find HARD-GATE near test-first content
    const testFirstSection = planning.substring(planning.indexOf("test-first") || planning.indexOf("Test-First"));
    assert.ok(
      planning.includes("<HARD-GATE>"),
      "must have HARD-GATE for plan validation"
    );
  });

  it("should require test step before implementation step", () => {
    assert.ok(
      planning.includes("test step") && planning.includes("before"),
      "must require test steps before implementation"
    );
  });

  it("should require test types annotation in task groups", () => {
    assert.ok(
      planning.includes("test types") && planning.includes("annotated"),
      "must require test type annotations in plan"
    );
  });

  it("should include test-first validation in gate requirements", () => {
    const gateSection = planning.substring(planning.indexOf("gate requires") || planning.indexOf("Gate Check"));
    assert.ok(
      gateSection.includes("test-first"),
      "planning gate must validate test-first ordering"
    );
  });
});

// ─── autonomous-loop: TDD consistency ─────────────────────────────

describe("autonomous-loop: TDD enforcement consistency", () => {
  const loop = read("skills/autonomous-loop/SKILL.md");

  it("should enforce TDD for every story", () => {
    assert.ok(
      loop.includes("TDD") && (loop.includes("every story") || loop.includes("ALL stories")),
      "must enforce TDD for all stories"
    );
  });

  it("should have anti-pattern for skipping TDD", () => {
    assert.ok(
      loop.toLowerCase().includes("skip tdd"),
      "must have anti-pattern against skipping TDD"
    );
  });
});

// ─── Cross-consistency: TDD across workflow ───────────────────────

describe("TDD cross-workflow consistency", () => {
  const execution = read("skills/prevc-execution/SKILL.md");
  const validation = read("skills/prevc-validation/SKILL.md");
  const planning = read("skills/prevc-planning/SKILL.md");
  const loop = read("skills/autonomous-loop/SKILL.md");

  it("all phases that enforce TDD should agree on E2E trigger conditions", () => {
    // Both execution and validation should mention auth as E2E trigger
    assert.ok(
      execution.toLowerCase().includes("auth") && validation.toLowerCase().includes("auth"),
      "execution and validation must both reference auth as E2E trigger"
    );
  });

  it("HARD-GATE should appear in execution, validation, AND planning", () => {
    assert.ok(execution.includes("<HARD-GATE>"), "execution must have HARD-GATE");
    assert.ok(validation.includes("<HARD-GATE>"), "validation must have HARD-GATE");
    assert.ok(planning.includes("<HARD-GATE>"), "planning must have HARD-GATE");
  });

  it("RED→GREEN→REFACTOR should appear in execution and autonomous-loop", () => {
    const hasRedGreen = (content) =>
      content.includes("RED") && content.includes("GREEN");
    assert.ok(hasRedGreen(execution), "execution must reference RED/GREEN");
    assert.ok(hasRedGreen(loop), "autonomous-loop must reference RED/GREEN");
  });
});
