#!/usr/bin/env node
// tests/validation/test-glob.mjs
// Unit tests for scripts/lib/glob.mjs — micromatch substitute (subset only).
import { test } from "node:test";
import assert from "node:assert/strict";
import { matchGlob, validateSubset } from "../../scripts/lib/glob.mjs";

test("matchGlob: ** matches any depth", () => {
  assert.equal(matchGlob("**/*.ts", "src/lib/foo.ts"), true);
  assert.equal(matchGlob("**/*.ts", "foo.ts"), true);
  assert.equal(matchGlob("src/**", "src/lib/foo.ts"), true);
  assert.equal(matchGlob("src/**", "src/foo.ts"), true);
});

test("matchGlob: * matches single segment", () => {
  assert.equal(matchGlob("src/*.ts", "src/foo.ts"), true);
  assert.equal(matchGlob("src/*.ts", "src/lib/foo.ts"), false);
  assert.equal(matchGlob("*.ts", "foo.ts"), true);
  assert.equal(matchGlob("*.ts", "src/foo.ts"), false);
});

test("matchGlob: ? matches single char", () => {
  assert.equal(matchGlob("a?.ts", "ab.ts"), true);
  assert.equal(matchGlob("a?.ts", "abc.ts"), false);
  assert.equal(matchGlob("a?.ts", "a.ts"), false);
});

test("matchGlob: brace expansion {a,b}", () => {
  assert.equal(matchGlob("src/{a,b}.ts", "src/a.ts"), true);
  assert.equal(matchGlob("src/{a,b}.ts", "src/b.ts"), true);
  assert.equal(matchGlob("src/{a,b}.ts", "src/c.ts"), false);
  assert.equal(matchGlob("{src,test}/**/*.ts", "src/lib/foo.ts"), true);
  assert.equal(matchGlob("{src,test}/**/*.ts", "test/unit/foo.ts"), true);
});

test("matchGlob: literal special chars in path", () => {
  // Dot is literal, not regex wildcard
  assert.equal(matchGlob("src/foo.ts", "src/foo.ts"), true);
  assert.equal(matchGlob("src/foo.ts", "src/foo_ts"), false);
  assert.equal(matchGlob("src/foo.ts", "src/fooXts"), false);
});

test("validateSubset: rejects negation !", () => {
  assert.throws(() => validateSubset("!**/*.ts"), /negation.*not supported/i);
  assert.throws(() => validateSubset("!  **/*.ts"), /negation.*not supported/i);
});

test("validateSubset: rejects extglob +(...) @(...) *(...) ?(...) !(...)", () => {
  assert.throws(() => validateSubset("+(a|b).ts"), /extglob.*not supported/i);
  assert.throws(() => validateSubset("@(a|b).ts"), /extglob.*not supported/i);
  assert.throws(() => validateSubset("*(a|b).ts"), /extglob.*not supported/i);
  assert.throws(() => validateSubset("?(a|b).ts"), /extglob.*not supported/i);
  assert.throws(() => validateSubset("!(a|b).ts"), /extglob.*not supported/i);
});

test("validateSubset: accepts valid subset", () => {
  assert.doesNotThrow(() => validateSubset("**/*.ts"));
  assert.doesNotThrow(() => validateSubset("src/{a,b}/*.tsx"));
  assert.doesNotThrow(() => validateSubset("src/middleware.ts"));
  assert.doesNotThrow(() => validateSubset("?"));
});
