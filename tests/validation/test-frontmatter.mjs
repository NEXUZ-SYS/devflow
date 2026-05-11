#!/usr/bin/env node
// tests/validation/test-frontmatter.mjs
// Unit tests for scripts/lib/frontmatter.mjs — gray-matter substitute (YAML subset).
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFrontmatter } from "../../scripts/lib/frontmatter.mjs";

test("parseFrontmatter: extracts YAML fields", () => {
  const src = "---\nname: foo\nstatus: Aprovado\nversion: 1.0.0\n---\n# Body\n";
  const r = parseFrontmatter(src);
  assert.equal(r.data.name, "foo");
  assert.equal(r.data.status, "Aprovado");
  assert.equal(r.data.version, "1.0.0");
  assert.match(r.body, /^# Body/);
});

test("parseFrontmatter: handles list fields", () => {
  const src = "---\nsupersedes: []\nrefines:\n  - ADR-001\n  - ADR-002\n---\nbody\n";
  const r = parseFrontmatter(src);
  assert.deepEqual(r.data.supersedes, []);
  assert.deepEqual(r.data.refines, ["ADR-001", "ADR-002"]);
});

test("parseFrontmatter: handles nested map (one level)", () => {
  const src = "---\nenforcement:\n  linter: foo.js\n  archTest: bar.ts\n---\nbody\n";
  const r = parseFrontmatter(src);
  assert.equal(r.data.enforcement.linter, "foo.js");
  assert.equal(r.data.enforcement.archTest, "bar.ts");
});

test("parseFrontmatter: no frontmatter returns empty data and full body", () => {
  const r = parseFrontmatter("# Plain markdown\n\nNo fm here.\n");
  assert.deepEqual(r.data, {});
  assert.match(r.body, /^# Plain/);
});

test("parseFrontmatter: rejects YAML anchors and refs", () => {
  assert.throws(
    () => parseFrontmatter("---\nfoo: &anchor x\n---\n"),
    /anchor.*not supported/i
  );
  assert.throws(
    () => parseFrontmatter("---\nfoo: *ref\n---\n"),
    /reference.*not supported/i
  );
});

test("parseFrontmatter: handles quoted strings with special chars", () => {
  const src = '---\nsummary: "value with: colon"\ntitle: \'single quoted\'\n---\nbody\n';
  const r = parseFrontmatter(src);
  assert.equal(r.data.summary, "value with: colon");
  assert.equal(r.data.title, "single quoted");
});

test("parseFrontmatter: handles null and boolean values", () => {
  const src = "---\nprotocol_contract: null\nautonomous: true\nweakStandardWarning: false\n---\nbody\n";
  const r = parseFrontmatter(src);
  assert.equal(r.data.protocol_contract, null);
  assert.equal(r.data.autonomous, true);
  assert.equal(r.data.weakStandardWarning, false);
});
