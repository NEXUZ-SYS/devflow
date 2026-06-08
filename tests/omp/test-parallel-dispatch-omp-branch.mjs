import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
test("branch omp: task tool + worktree + output + detect-runtime", () => {
  const s = readFileSync("skills/parallel-dispatch/SKILL.md", "utf-8");
  for (const re of [/omp/i, /\btask\b/, /worktree|isolated|isolation/i, /output schema|output:/i, /detect-runtime/]) assert.match(s, re);
});
