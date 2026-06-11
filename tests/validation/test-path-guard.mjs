#!/usr/bin/env node
// tests/validation/test-path-guard.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { isWithinDir } from "../../scripts/lib/path-guard.mjs";

test("isWithinDir: arquivo dentro do dir → true", () => {
  assert.equal(isWithinDir("/a/b/c.md", "/a/b"), true);
});

test("isWithinDir: caminho igual ao dir → true", () => {
  assert.equal(isWithinDir("/a/b", "/a/b"), true);
});

test("isWithinDir: prefix-attack (/a/bevil) → false", () => {
  assert.equal(isWithinDir("/a/bevil/x.md", "/a/b"), false);
});

test("isWithinDir: traversal que escapa → false", () => {
  assert.equal(isWithinDir("/a/b/../../etc/passwd", "/a/b"), false);
});
