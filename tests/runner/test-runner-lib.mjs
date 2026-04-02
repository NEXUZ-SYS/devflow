/**
 * Unit tests for devflow-runner core library.
 * Run: node --test tests/runner/test-runner-lib.mjs
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseStoriesContent, getNextStory, buildPrompt } from "../../scripts/runner-lib.mjs";

const FIXTURES = resolve(import.meta.dirname, "../fixtures");
const readFixture = (name) => readFileSync(resolve(FIXTURES, name), "utf-8");

// ─── parseStoriesContent ───────────────────────────────────────────

describe("parseStoriesContent", () => {
  it("should parse valid stories.yaml with all fields", () => {
    const { stories, maxRetries } = parseStoriesContent(readFixture("stories-valid.yaml"));
    assert.equal(stories.length, 4);
    assert.equal(maxRetries, 2);
    assert.equal(stories[0].id, "S1");
    assert.equal(stories[0].title, "Criar model Product");
    assert.equal(stories[0].agent, "backend-specialist");
    assert.equal(stories[0].priority, "1");
    assert.equal(stories[0].status, "pending");
    assert.equal(stories[0].attempts, "0");
  });

  it("should parse blocked_by as inline array string", () => {
    const { stories } = parseStoriesContent(readFixture("stories-valid.yaml"));
    assert.equal(stories[1].blocked_by, "[S1]");
    assert.equal(stories[3].blocked_by, "[S2, S3]");
    assert.equal(stories[0].blocked_by, "[]");
  });

  it("should handle unquoted, double-quoted, and single-quoted IDs", () => {
    const { stories } = parseStoriesContent(readFixture("stories-quoted-ids.yaml"));
    assert.equal(stories.length, 3);
    assert.equal(stories[0].id, "S1");
    assert.equal(stories[1].id, "S2");
    assert.equal(stories[2].id, "S3");
  });

  it("should read max_retries_per_story from escalation config", () => {
    const content = readFixture("stories-stuck.yaml");
    const { maxRetries } = parseStoriesContent(content);
    assert.equal(maxRetries, 3);
  });

  it("should default maxRetries to 2 when not specified", () => {
    const content = `feature: "test"\nstories:\n  - id: S1\n    title: "test"\n    status: pending\n    priority: 1`;
    const { maxRetries } = parseStoriesContent(content);
    assert.equal(maxRetries, 2);
  });

  it("should throw on malformed content without stories: key", () => {
    assert.throws(
      () => parseStoriesContent(readFixture("stories-malformed.txt")),
      { message: /missing 'stories:' key/ }
    );
  });

  it("should throw on empty content", () => {
    assert.throws(
      () => parseStoriesContent(""),
      { message: /missing 'stories:' key/ }
    );
  });

  it("should return empty stories array for file with stories: but no entries", () => {
    const content = "feature: test\nstories:\n";
    const { stories } = parseStoriesContent(content);
    assert.equal(stories.length, 0);
  });

  it("should parse mixed status stories correctly", () => {
    const { stories } = parseStoriesContent(readFixture("stories-mixed-status.yaml"));
    assert.equal(stories.length, 5);
    assert.equal(stories[0].status, "completed");
    assert.equal(stories[2].status, "failed");
    assert.equal(stories[3].status, "escalated");
  });
});

// ─── getNextStory ──────────────────────────────────────────────────

describe("getNextStory", () => {
  it("should pick the first pending story with lowest priority", () => {
    const { stories, maxRetries } = parseStoriesContent(readFixture("stories-valid.yaml"));
    const next = getNextStory(stories, maxRetries);
    assert.equal(next.id, "S1");
  });

  it("should skip blocked stories when dependencies not met", () => {
    const { stories, maxRetries } = parseStoriesContent(readFixture("stories-valid.yaml"));
    // S2 blocked by S1, S3 blocked by S1, S4 blocked by S2+S3
    // Only S1 is selectable
    const next = getNextStory(stories, maxRetries);
    assert.equal(next.id, "S1");
  });

  it("should return null when all stories are completed", () => {
    const { stories, maxRetries } = parseStoriesContent(readFixture("stories-all-completed.yaml"));
    const next = getNextStory(stories, maxRetries);
    assert.equal(next, null);
  });

  it("should prioritize in_progress stories (session death recovery)", () => {
    const { stories, maxRetries } = parseStoriesContent(readFixture("stories-stuck.yaml"));
    const next = getNextStory(stories, maxRetries);
    assert.equal(next.id, "S1");
    assert.equal(next.status, "in_progress");
  });

  it("should prioritize failed retryable stories over pending", () => {
    const { stories, maxRetries } = parseStoriesContent(readFixture("stories-mixed-status.yaml"));
    const next = getNextStory(stories, maxRetries);
    // S3 is failed with attempts=1, maxRetries=2, so it's retryable
    assert.equal(next.id, "S3");
    assert.equal(next.status, "failed");
  });

  it("should not retry failed stories that exceeded max retries", () => {
    const stories = [
      { id: "S1", status: "failed", attempts: "3", priority: "1", blocked_by: "" },
      { id: "S2", status: "pending", priority: "2", blocked_by: "" },
    ];
    const next = getNextStory(stories, 2);
    assert.equal(next.id, "S2");
  });

  it("should not select stories blocked by non-existent IDs", () => {
    const stories = [
      { id: "S1", status: "pending", priority: "1", blocked_by: "[NONEXISTENT]" },
    ];
    const next = getNextStory(stories, 2);
    assert.equal(next, null);
  });

  it("should not select stories blocked by escalated dependencies", () => {
    const { stories, maxRetries } = parseStoriesContent(readFixture("stories-mixed-status.yaml"));
    // S5 is blocked by S4 which is escalated (not completed)
    // Only S3 (failed, retryable) should be selected
    const next = getNextStory(stories, maxRetries);
    assert.notEqual(next.id, "S5");
  });

  it("should handle empty blocked_by array", () => {
    const stories = [
      { id: "S1", status: "pending", priority: "1", blocked_by: "[]" },
    ];
    const next = getNextStory(stories, 2);
    assert.equal(next.id, "S1");
  });

  it("should handle missing blocked_by field", () => {
    const stories = [
      { id: "S1", status: "pending", priority: "1" },
    ];
    const next = getNextStory(stories, 2);
    assert.equal(next.id, "S1");
  });

  it("should select unblocked pending when deps completed", () => {
    const stories = [
      { id: "S1", status: "completed", priority: "1", blocked_by: "" },
      { id: "S2", status: "pending", priority: "2", blocked_by: "[S1]" },
    ];
    const next = getNextStory(stories, 2);
    assert.equal(next.id, "S2");
  });

  it("should return null for empty stories array", () => {
    assert.equal(getNextStory([], 2), null);
  });

  it("should sort by priority among same-status candidates", () => {
    const stories = [
      { id: "S3", status: "pending", priority: "3", blocked_by: "" },
      { id: "S1", status: "pending", priority: "1", blocked_by: "" },
      { id: "S2", status: "pending", priority: "2", blocked_by: "" },
    ];
    const next = getNextStory(stories, 2);
    assert.equal(next.id, "S1");
  });
});

// ─── getNextStory edge cases ──────────────────────────────────────

describe("getNextStory edge cases", () => {
  it("should handle priority 0 correctly", () => {
    const stories = [
      { id: "S1", status: "pending", priority: "1", blocked_by: "" },
      { id: "S2", status: "pending", priority: "0", blocked_by: "" },
    ];
    const next = getNextStory(stories, 2);
    assert.equal(next.id, "S2", "priority 0 should come before priority 1");
  });

  it("should handle non-numeric priority gracefully", () => {
    const stories = [
      { id: "S1", status: "pending", priority: "abc", blocked_by: "" },
      { id: "S2", status: "pending", priority: "1", blocked_by: "" },
    ];
    // NaN sorts unpredictably — should at least not crash
    const next = getNextStory(stories, 2);
    assert.ok(next !== null, "should return a story even with bad priority");
  });

  it("should return null for circular dependencies", () => {
    const stories = [
      { id: "S1", status: "pending", priority: "1", blocked_by: "[S2]" },
      { id: "S2", status: "pending", priority: "2", blocked_by: "[S1]" },
    ];
    const next = getNextStory(stories, 2);
    assert.equal(next, null, "circular deps should block all stories");
  });

  it("should handle blocked_by with extra spaces", () => {
    const stories = [
      { id: "S1", status: "completed", priority: "1", blocked_by: "" },
      { id: "S2", status: "pending", priority: "2", blocked_by: "[ S1 ]" },
    ];
    const next = getNextStory(stories, 2);
    assert.equal(next.id, "S2", "should trim spaces in blocked_by entries");
  });

  it("should handle story with missing status field", () => {
    const stories = [
      { id: "S1", priority: "1", blocked_by: "" },
    ];
    const next = getNextStory(stories, 2);
    // Missing status means it's not pending/failed/in_progress — should be skipped
    assert.equal(next, null, "missing status should not match any selection criteria");
  });

  it("should handle story with missing priority field", () => {
    const stories = [
      { id: "S1", status: "pending", blocked_by: "" },
      { id: "S2", status: "pending", priority: "1", blocked_by: "" },
    ];
    const next = getNextStory(stories, 2);
    // Should not crash on parseInt(undefined)
    assert.ok(next !== null, "should return a story even with missing priority");
  });

  it("should handle attempts as undefined for retry check", () => {
    const stories = [
      { id: "S1", status: "failed", priority: "1", blocked_by: "" },
    ];
    // attempts is undefined, should default to 0 (retryable)
    const next = getNextStory(stories, 2);
    assert.equal(next.id, "S1", "undefined attempts should be treated as 0");
  });
});

// ─── parseStoriesContent edge cases ───────────────────────────────

describe("parseStoriesContent edge cases", () => {
  it("should handle story with only id field", () => {
    const content = "stories:\n  - id: S1\n";
    const { stories } = parseStoriesContent(content);
    assert.equal(stories.length, 1);
    assert.equal(stories[0].id, "S1");
    assert.equal(stories[0].status, undefined);
  });

  it("should handle multiple stories with varying field completeness", () => {
    const content = [
      "stories:",
      "  - id: S1",
      "    title: Full story",
      "    status: pending",
      "    priority: 1",
      "    attempts: 0",
      "    blocked_by: []",
      "  - id: S2",
      "    title: Minimal story",
    ].join("\n");
    const { stories } = parseStoriesContent(content);
    assert.equal(stories.length, 2);
    assert.equal(stories[0].priority, "1");
    assert.equal(stories[1].priority, undefined);
  });

  it("should handle YAML with comments in content", () => {
    const content = [
      "# This is a comment",
      "stories:",
      "  - id: S1",
      "    title: A story  # inline comment",
    ].join("\n");
    const { stories } = parseStoriesContent(content);
    assert.equal(stories.length, 1);
    assert.equal(stories[0].id, "S1");
  });

  it("should handle description field with colons", () => {
    const content = [
      "stories:",
      "  - id: S1",
      '    description: "Create API: GET /users endpoint"',
    ].join("\n");
    const { stories } = parseStoriesContent(content);
    assert.ok(
      stories[0].description.includes("GET /users"),
      "should preserve colons in quoted description"
    );
  });
});

// ─── buildPrompt ───────────────────────────────────────────────────

describe("buildPrompt", () => {
  it("should include story ID, title, and agent", () => {
    const prompt = buildPrompt({ id: "S1", title: "Create model", agent: "backend-specialist" });
    assert.ok(prompt.includes("S1"));
    assert.ok(prompt.includes("Create model"));
    assert.ok(prompt.includes("backend-specialist"));
  });

  it("should include description when present", () => {
    const prompt = buildPrompt({ id: "S1", title: "Test", description: "Full description here", agent: "dev" });
    assert.ok(prompt.includes("Full description here"));
  });

  it("should exclude description line when empty", () => {
    const prompt = buildPrompt({ id: "S1", title: "Test", agent: "dev" });
    assert.ok(!prompt.includes("Description:"));
  });

  it("should default agent to feature-developer", () => {
    const prompt = buildPrompt({ id: "S1", title: "Test" });
    assert.ok(prompt.includes("feature-developer"));
  });

  it("should include autonomous-loop skill instruction", () => {
    const prompt = buildPrompt({ id: "S1", title: "Test", agent: "dev" });
    assert.ok(prompt.includes("devflow:autonomous-loop"));
  });
});
