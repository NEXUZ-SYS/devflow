/**
 * Structural validation tests for existing project support enhancements.
 * Validates PRD→stories, autonomy upgrade, context-sync workflow, and command docs.
 * Run: node --test tests/validation/test-existing-project-support.mjs
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");
const read = (rel) => readFileSync(resolve(ROOT, rel), "utf-8");

// ─── PRD→Stories Generation (prevc-planning) ─────────────────────

describe("prevc-planning: PRD→stories support", () => {
  const planning = read("skills/prevc-planning/SKILL.md");

  it("should have Path A (from PRD) documented", () => {
    assert.ok(planning.includes("Path A"), "must document Path A (PRD source)");
  });

  it("should have Path B (from plan) documented", () => {
    assert.ok(planning.includes("Path B"), "must document Path B (plan source)");
  });

  it("should reference --from-prd flag", () => {
    assert.ok(planning.includes("--from-prd"), "must reference --from-prd flag");
  });

  it("should instruct enrichment from existing .context/docs/", () => {
    assert.ok(
      planning.includes("project-overview.md") && planning.includes("codebase-map.json"),
      "must instruct reading existing project docs for enrichment"
    );
  });

  it("should describe agent inference from scope items", () => {
    assert.ok(
      planning.includes("backend-specialist") && planning.includes("frontend-specialist"),
      "must describe agent inference from PRD scope"
    );
  });

  it("should maintain original plan-based generation", () => {
    assert.ok(
      planning.includes("task group") && planning.includes("agent annotation"),
      "must still support plan-based story generation (Path B)"
    );
  });
});

// ─── Autonomy Upgrade Mid-Workflow (prevc-flow) ──────────────────

describe("prevc-flow: autonomy upgrade/downgrade", () => {
  const flow = read("skills/prevc-flow/SKILL.md");

  it("should document upgrade flow", () => {
    assert.ok(flow.includes("Autonomy Upgrade"), "must have upgrade section");
  });

  it("should document downgrade flow", () => {
    assert.ok(flow.includes("Downgrade"), "must have downgrade section");
  });

  it("should preserve progress on mode change", () => {
    assert.ok(
      flow.includes("preserves ALL progress") || flow.includes("preserves all progress"),
      "must explicitly state progress preservation"
    );
  });

  it("should handle missing stories.yaml on upgrade", () => {
    assert.ok(
      flow.includes("stories.yaml does NOT exist") || flow.includes("stories.yaml already exists"),
      "must handle both cases: stories.yaml exists and doesn't exist"
    );
  });

  it("should support upgrade without description", () => {
    assert.ok(
      flow.includes("active workflow"),
      "must support upgrading active workflow without new description"
    );
  });

  it("should reference --from-prd shortcut", () => {
    assert.ok(flow.includes("--from-prd"), "must document --from-prd shortcut");
  });

  it("should describe automatic downgrade triggers", () => {
    assert.ok(
      flow.includes("escalation") || flow.includes("2 failures"),
      "must describe automatic downgrade conditions"
    );
  });
});

// ─── Context Sync Workflow (context-sync) ────────────────────────

describe("context-sync: workflow directory support", () => {
  const sync = read("skills/context-sync/SKILL.md");

  it("should include workflow in scope table", () => {
    assert.ok(
      sync.includes("| `workflow`"),
      "must list workflow as a sync scope"
    );
  });

  it("should reference .context/workflow/ in full sync", () => {
    assert.ok(
      sync.includes(".context/workflow/"),
      "must include workflow dir in complete sync"
    );
  });

  it("should validate stories.yaml structure", () => {
    assert.ok(
      sync.includes("validate") && sync.includes("stories.yaml"),
      "must validate stories.yaml during workflow sync"
    );
  });

  it("should check for orphaned blocked_by references", () => {
    assert.ok(
      sync.includes("orphaned") || sync.includes("blocked_by"),
      "must check for orphaned dependency references"
    );
  });

  it("should suggest PRD→stories when stories.yaml missing", () => {
    assert.ok(
      sync.includes("from-prd") || sync.includes("PRD found"),
      "must suggest PRD→stories generation when stories.yaml is missing"
    );
  });

  it("should scaffold directory if missing", () => {
    assert.ok(
      sync.includes("Create") && sync.includes("workflow"),
      "must create .context/workflow/ if missing"
    );
  });
});

// ─── Command Documentation (devflow.md) ──────────────────────────

describe("devflow.md: existing project commands", () => {
  const cmd = read("commands/devflow.md");

  it("should document --from-prd flag", () => {
    assert.ok(cmd.includes("--from-prd"), "must document --from-prd");
  });

  it("should document autonomy upgrade without description", () => {
    assert.ok(
      cmd.includes("autonomy:autonomous     ") || cmd.includes("Upgrade active workflow"),
      "must document upgrade of active workflow"
    );
  });

  it("should have --from-prd example", () => {
    assert.ok(
      cmd.includes("from-prd") && cmd.includes("PRD"),
      "must have example of --from-prd usage"
    );
  });

  it("should have upgrade example", () => {
    assert.ok(
      cmd.includes("Upgrades to autonomous mode") || cmd.includes("Upgrade"),
      "must have example of mid-workflow upgrade"
    );
  });

  it("should list --from-prd in arguments", () => {
    const argsSection = cmd.substring(cmd.indexOf("## Arguments"));
    assert.ok(
      argsSection.includes("--from-prd"),
      "must list --from-prd in arguments section"
    );
  });

  it("should list --from-prd in quick reference", () => {
    assert.ok(
      cmd.includes("Autonomous from existing PRD"),
      "must have quick reference entry for --from-prd"
    );
  });
});

// ─── using-devflow: existing project docs ────────────────────────

describe("using-devflow: existing project documentation", () => {
  const usingDevflow = read("skills/using-devflow/SKILL.md");

  it("should document --from-prd in autonomy section", () => {
    assert.ok(
      usingDevflow.includes("--from-prd"),
      "must document --from-prd in using-devflow"
    );
  });

  it("should document mid-workflow upgrade", () => {
    assert.ok(
      usingDevflow.includes("Mid-workflow upgrade") || usingDevflow.includes("mid-workflow"),
      "must document mid-workflow autonomy upgrade"
    );
  });

  it("should list /devflow-sync workflow command", () => {
    assert.ok(
      usingDevflow.includes("devflow-sync workflow"),
      "must list /devflow-sync workflow in slash commands"
    );
  });

  it("should mention progress preservation", () => {
    assert.ok(
      usingDevflow.includes("progress") && usingDevflow.includes("preserved"),
      "must mention that progress is preserved on upgrade"
    );
  });
});

// ─── Cross-consistency ───────────────────────────────────────────

describe("Cross-file consistency", () => {
  const flow = read("skills/prevc-flow/SKILL.md");
  const planning = read("skills/prevc-planning/SKILL.md");
  const sync = read("skills/context-sync/SKILL.md");
  const cmd = read("commands/devflow.md");
  const usingDevflow = read("skills/using-devflow/SKILL.md");

  it("--from-prd should appear in all relevant files", () => {
    const files = { flow, planning, cmd, usingDevflow };
    for (const [name, content] of Object.entries(files)) {
      assert.ok(content.includes("--from-prd"), `--from-prd missing from ${name}`);
    }
  });

  it("workflow scope should be in both context-sync and using-devflow", () => {
    assert.ok(sync.includes("workflow"), "context-sync must reference workflow scope");
    assert.ok(usingDevflow.includes("workflow"), "using-devflow must reference workflow scope");
  });

  it("stories.yaml generation paths should be consistent", () => {
    // Planning references both Path A and Path B
    assert.ok(planning.includes("Path A") && planning.includes("Path B"));
    // Flow references --from-prd which triggers Path A
    assert.ok(flow.includes("--from-prd") && flow.includes("Path A"));
  });
});
