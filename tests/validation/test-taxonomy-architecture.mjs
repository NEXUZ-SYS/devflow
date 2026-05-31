#!/usr/bin/env node
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const Y = readFileSync("skills/standards-builder/references/taxonomy-of-concerns.yaml", "utf-8");

test("taxonomy inclui category architecture com concern layer-boundaries", () => {
  assert.match(Y, /category: architecture/);
  assert.match(Y, /id: layer-boundaries/);
});

test("taxonomy inclui concerns de contracts/process faltantes", () => {
  assert.match(Y, /id: api-conventions/);
  assert.match(Y, /id: domain-events/);
  assert.match(Y, /id: secret-conventions/);
  assert.match(Y, /id: commit-hygiene/);
});
