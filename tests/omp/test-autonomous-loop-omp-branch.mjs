import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
test("autonomous-loop omp: task + gate por output JSON + smol", () => {
  const s = readFileSync("skills/autonomous-loop/SKILL.md", "utf-8");
  for (const re of [/omp/i, /\btask\b/, /output schema|JSON validado|validated/i, /pi\/smol|smol/, /detect-runtime/]) assert.match(s, re);
});
