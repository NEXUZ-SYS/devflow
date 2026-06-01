#!/usr/bin/env node
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const Y = readFileSync("skills/standards-builder/references/taxonomy-of-concerns.yaml", "utf-8");
const REQUIRED = [
  "security","performance","documentation","grounding","migration",
  "data-modeling","schemas","code-review",
  "accessibility","internationalization","caching","state-management",
];
test("taxonomia cobre os concerns dos standards default", () => {
  for (const id of REQUIRED) assert.match(Y, new RegExp(`id: ${id}\\b`), `falta concern: ${id}`);
});
