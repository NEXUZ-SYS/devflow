#!/usr/bin/env node
// tests/validation/test-adr-path-resolver.mjs
// Unit tests for scripts/lib/path-resolver.mjs — Semana 0 dual-read helper.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolveAdrPath } from "../../scripts/lib/path-resolver.mjs";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "adr-path-"));
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test("resolveAdrPath: only new path exists", () => {
  const { root, cleanup } = fixture();
  mkdirSync(join(root, ".context", "adrs"), { recursive: true });
  const r = resolveAdrPath(root);
  assert.equal(r.write, join(root, ".context", "adrs"));
  assert.deepEqual(r.readPaths, [join(root, ".context", "adrs")]);
  assert.equal(r.isLegacy, false);
  cleanup();
});

test("resolveAdrPath: only legacy path exists", () => {
  const { root, cleanup } = fixture();
  mkdirSync(join(root, ".context", "docs", "adrs"), { recursive: true });
  const r = resolveAdrPath(root);
  assert.equal(r.write, join(root, ".context", "adrs"));
  assert.deepEqual(r.readPaths, [join(root, ".context", "docs", "adrs")]);
  assert.equal(r.isLegacy, true);
  cleanup();
});

test("resolveAdrPath: both paths exist (new takes precedence in readPaths order)", () => {
  const { root, cleanup } = fixture();
  mkdirSync(join(root, ".context", "adrs"), { recursive: true });
  mkdirSync(join(root, ".context", "docs", "adrs"), { recursive: true });
  const r = resolveAdrPath(root);
  assert.equal(r.readPaths.length, 2);
  assert.equal(r.readPaths[0], join(root, ".context", "adrs"));
  assert.equal(r.readPaths[1], join(root, ".context", "docs", "adrs"));
  assert.equal(r.isLegacy, false);
  cleanup();
});

test("resolveAdrPath: neither path exists", () => {
  const { root, cleanup } = fixture();
  mkdirSync(join(root, ".context"), { recursive: true });
  const r = resolveAdrPath(root);
  assert.deepEqual(r.readPaths, []);
  assert.equal(r.isLegacy, false);
  assert.equal(r.write, join(root, ".context", "adrs"));
  cleanup();
});
