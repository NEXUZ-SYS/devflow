/**
 * Structural validation tests for DevFlow autonomous-loop artifacts.
 * Validates skill frontmatter, cross-references, and schema integrity.
 * Run: node --test tests/validation/test-structural.mjs
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve, basename, dirname } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");
const read = (rel) => readFileSync(resolve(ROOT, rel), "utf-8");

// ─── Skill Frontmatter Validation ─────────────────────────────────

describe("Skill frontmatter", () => {
  const autonomousLoopSkills = [
    "skills/autonomous-loop/SKILL.md",
    "skills/prevc-flow/SKILL.md",
    "skills/prevc-execution/SKILL.md",
    "skills/prevc-planning/SKILL.md",
    "skills/using-devflow/SKILL.md",
    "skills/napkin/SKILL.md",
  ];

  for (const skillPath of autonomousLoopSkills) {
    describe(skillPath, () => {
      const content = read(skillPath);

      it("should have YAML frontmatter delimiters", () => {
        assert.ok(content.startsWith("---\n"), "must start with ---");
        const secondDelim = content.indexOf("---", 4);
        assert.ok(secondDelim > 4, "must have closing ---");
      });

      it("should have a name field", () => {
        const match = content.match(/^name:\s*(.+)$/m);
        assert.ok(match, "missing name field");
        assert.ok(match[1].trim().length > 0, "name must not be empty");
      });

      it("should have a description field", () => {
        const match = content.match(/^description:\s*(.+)$/m);
        assert.ok(match, "missing description field");
        assert.ok(match[1].trim().length > 10, "description too short");
      });

      it("should have name matching directory name", () => {
        const nameMatch = content.match(/^name:\s*(.+)$/m);
        const dirName = basename(dirname(resolve(ROOT, skillPath)));
        const skillName = nameMatch[1].trim().replace(/^["']|["']$/g, "");
        assert.equal(skillName, dirName, `name "${skillName}" should match dir "${dirName}"`);
      });
    });
  }
});

// ─── Cross-reference Validation ───────────────────────────────────

describe("Cross-references in using-devflow", () => {
  const usingDevflow = read("skills/using-devflow/SKILL.md");

  // Extract all devflow:skill-name references
  const skillRefs = [...usingDevflow.matchAll(/`devflow:([a-z-]+)`/g)].map((m) => m[1]);

  it("should reference autonomous-loop skill", () => {
    assert.ok(skillRefs.includes("autonomous-loop"), "autonomous-loop not referenced in using-devflow");
  });

  for (const ref of [...new Set(skillRefs)]) {
    it(`devflow:${ref} should have a matching SKILL.md`, () => {
      const skillFile = resolve(ROOT, `skills/${ref}/SKILL.md`);
      assert.ok(existsSync(skillFile), `skills/${ref}/SKILL.md does not exist`);
    });
  }
});

describe("Cross-references in prevc-execution", () => {
  const execution = read("skills/prevc-execution/SKILL.md");

  it("should reference autonomous-loop skill", () => {
    assert.ok(
      execution.includes("autonomous-loop"),
      "prevc-execution should reference autonomous-loop"
    );
  });
});

describe("Cross-references in prevc-planning", () => {
  const planning = read("skills/prevc-planning/SKILL.md");

  it("should reference stories.yaml generation", () => {
    assert.ok(
      planning.includes("stories.yaml") || planning.includes("stories-schema"),
      "prevc-planning should reference stories.yaml generation"
    );
  });
});

// ─── stories-schema.yaml Validation ──────────────────────────────

describe("stories-schema.yaml", () => {
  const schema = read("templates/stories-schema.yaml");

  it("should exist and have content", () => {
    assert.ok(schema.length > 100, "schema too short");
  });

  it("should define required top-level fields", () => {
    for (const field of ["feature:", "autonomy:", "escalation:", "stats:", "stories:"]) {
      assert.ok(schema.includes(field), `missing top-level field: ${field}`);
    }
  });

  it("should define all autonomy modes", () => {
    assert.ok(schema.includes("supervised"), "missing supervised mode");
    assert.ok(schema.includes("assisted"), "missing assisted mode");
    assert.ok(schema.includes("autonomous"), "missing autonomous mode");
  });

  it("should define required story fields", () => {
    for (const field of ["id:", "title:", "agent:", "priority:", "status:", "attempts:", "blocked_by:"]) {
      assert.ok(schema.includes(field), `missing story field: ${field}`);
    }
  });

  it("should define all status values", () => {
    for (const status of ["pending", "in_progress", "completed", "failed", "escalated"]) {
      assert.ok(schema.includes(status), `missing status: ${status}`);
    }
  });

  it("should define escalation config fields", () => {
    for (const field of ["max_retries_per_story:", "max_consecutive_failures:", "security_immediate:"]) {
      assert.ok(schema.includes(field), `missing escalation field: ${field}`);
    }
  });

  it("should define stats fields", () => {
    for (const field of ["total:", "completed:", "failed:", "escalated:", "consecutive_failures:"]) {
      assert.ok(schema.includes(field), `missing stats field: ${field}`);
    }
  });
});

// ─── autonomous-loop SKILL.md Content Validation ─────────────────

describe("autonomous-loop skill content", () => {
  const skill = read("skills/autonomous-loop/SKILL.md");

  it("should reference stories.yaml", () => {
    assert.ok(skill.includes("stories.yaml"), "must reference stories.yaml");
  });

  it("should mention TDD enforcement", () => {
    assert.ok(
      skill.toLowerCase().includes("tdd"),
      "must mention TDD enforcement"
    );
  });

  it("should mention escalation", () => {
    assert.ok(skill.includes("escalat"), "must mention escalation");
  });

  it("should mention quality gates", () => {
    assert.ok(
      skill.toLowerCase().includes("gate") || skill.toLowerCase().includes("quality"),
      "must mention quality gates"
    );
  });

  it("should be mode-aware (Full/Lite/Minimal)", () => {
    let modeCount = 0;
    if (skill.includes("Full")) modeCount++;
    if (skill.includes("Lite")) modeCount++;
    if (skill.includes("Minimal")) modeCount++;
    assert.ok(modeCount >= 2, "must reference at least 2 operating modes");
  });
});

// ─── commands/devflow.md Validation ──────────────────────────────

describe("devflow command references autonomy", () => {
  const cmd = read("commands/devflow.md");

  it("should document autonomy parameter", () => {
    assert.ok(
      cmd.includes("autonomy") || cmd.includes("autonomous"),
      "devflow command must document autonomy"
    );
  });

  it("should list autonomy modes", () => {
    assert.ok(cmd.includes("supervised"), "must list supervised mode");
    assert.ok(cmd.includes("assisted"), "must list assisted mode");
    assert.ok(cmd.includes("autonomous"), "must list autonomous mode");
  });
});
