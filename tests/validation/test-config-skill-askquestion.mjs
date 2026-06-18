#!/usr/bin/env node
// tests/validation/test-config-skill-askquestion.mjs
// GAP-PORT-1: structural lint for skills/config/SKILL.md.
//
// Claude Code's AskUserQuestion accepts AT MOST 4 options per question. This
// test parses every `options:` block in the skill and asserts the cap, plus
// that the 5.3 "patch incremental" menu was split into a SINGLE call with TWO
// questions (so the 5 configurable areas still fit the 4-option limit).
//
// This is a real portability invariant (the runtime rejects >4 options), not a
// content check — it parses structure and enforces a hard runtime constraint.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const SKILL = join(HERE, "../../skills/config/SKILL.md");
const MAX_OPTIONS = 4;

function indentOf(line) {
  const m = line.match(/^( *)/);
  return m ? m[1].length : 0;
}

// Count `- label:` items belonging to the `options:` line at optIdx (deeper
// indentation, until the first dedent to a sibling/parent key).
function countOptions(lines, optIdx) {
  const optIndent = indentOf(lines[optIdx]);
  let count = 0;
  for (let i = optIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "") continue;
    if (indentOf(line) <= optIndent) break;
    if (/^\s*-\s+label:/.test(line)) count++;
  }
  return count;
}

function findOptionBlocks(lines) {
  const blocks = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*options:\s*$/.test(lines[i])) {
      blocks.push({ line: i + 1, count: countOptions(lines, i) });
    }
  }
  return blocks;
}

const raw = readFileSync(SKILL, "utf-8");
const lines = raw.split(/\r?\n/);

test("every AskUserQuestion options: block has ≤ 4 options (runtime cap)", () => {
  const blocks = findOptionBlocks(lines);
  assert.ok(blocks.length > 0, "expected at least one options: block in the skill");
  const offenders = blocks.filter((b) => b.count > MAX_OPTIONS);
  assert.equal(
    offenders.length,
    0,
    `options: blocks exceeding ${MAX_OPTIONS}: ` +
      offenders.map((o) => `line ${o.line} has ${o.count}`).join(", ")
  );
});

// Isolate the 5.3 section (from "#### 5.3" up to the next "####"/"##" heading).
function section53(lines) {
  const start = lines.findIndex((l) => /^####\s+5\.3\b/.test(l));
  assert.ok(start >= 0, "section 5.3 not found");
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^#{2,4}\s/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end);
}

test("5.3 patch-incremental menu is a SINGLE call with TWO questions (3+2 split)", () => {
  const sec = section53(lines);
  // single call → one `questions:` list
  const hasQuestionsList = sec.some((l) => /^\s*questions:\s*$/.test(l));
  assert.ok(hasQuestionsList, "5.3 must use a single AskUserQuestion call with a questions: list");
  // two questions
  const questionCount = sec.filter((l) => /^\s*-?\s*question:/.test(l)).length;
  assert.equal(questionCount, 2, `5.3 must have exactly 2 questions, found ${questionCount}`);
  // two options: blocks, each ≤ 4 and together covering the 5 areas
  const optionBlocks = [];
  for (let i = 0; i < sec.length; i++) {
    if (/^\s*options:\s*$/.test(sec[i])) optionBlocks.push(countOptions(sec, i));
  }
  assert.equal(optionBlocks.length, 2, `5.3 must have 2 options: blocks, found ${optionBlocks.length}`);
  for (const c of optionBlocks) assert.ok(c >= 1 && c <= MAX_OPTIONS, `each 5.3 question ≤ ${MAX_OPTIONS} options`);
  const total = optionBlocks.reduce((a, b) => a + b, 0);
  assert.equal(total, 5, `5.3 must still offer all 5 areas, found ${total}`);
});
