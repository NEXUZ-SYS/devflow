#!/usr/bin/env node
// tests/validation/test-adr-path-resolver.mjs
// Unit tests for scripts/lib/path-resolver.mjs — DDC-aware ADR path resolver.
//
// NOTE on intentional test update (2026-05-30):
//   The canonical write path changed from `.context/adrs` (v1.0 canonical) to
//   `.context/engineering/adrs` (DDC layout v2 canonical, via context-paths.mjs).
//   The old `.context/adrs` and `.context/docs/adrs` are now legacy fallbacks.
//   These test expectations were updated to match the new canonical. The return
//   shape `{ write, readPaths, isLegacy }` is UNCHANGED.
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

// OLD: only .context/adrs exists (now a legacy path)
// NEW expectation: write = .context/engineering/adrs (canonical);
//   readPaths = [canonical, .context/adrs (legacy, on disk)]; isLegacy = true
test("resolveAdrPath: only v1-legacy path (.context/adrs) exists", () => {
  const { root, cleanup } = fixture();
  mkdirSync(join(root, ".context", "adrs"), { recursive: true });
  const r = resolveAdrPath(root);
  assert.equal(r.write, join(root, ".context", "engineering", "adrs"));
  assert.equal(r.readPaths[0], join(root, ".context", "engineering", "adrs"),
    "canonical always first in readPaths");
  assert.equal(r.readPaths[1], join(root, ".context", "adrs"),
    "legacy .context/adrs included when present");
  assert.equal(r.readPaths.length, 2);
  assert.equal(r.isLegacy, true, "canonical absent + legacy present → isLegacy");
  cleanup();
});

// OLD: only .context/docs/adrs exists (still legacy)
// NEW expectation: write = .context/engineering/adrs; isLegacy = true;
//   readPaths = [canonical, .context/docs/adrs]
test("resolveAdrPath: only deep-legacy path (.context/docs/adrs) exists", () => {
  const { root, cleanup } = fixture();
  mkdirSync(join(root, ".context", "docs", "adrs"), { recursive: true });
  const r = resolveAdrPath(root);
  assert.equal(r.write, join(root, ".context", "engineering", "adrs"));
  assert.equal(r.readPaths[0], join(root, ".context", "engineering", "adrs"),
    "canonical always first");
  assert.equal(r.readPaths[1], join(root, ".context", "docs", "adrs"),
    "deep-legacy included when present");
  assert.equal(r.isLegacy, true);
  cleanup();
});

// OLD: both .context/adrs and .context/docs/adrs exist
// NEW expectation: canonical (.context/engineering/adrs) absent;
//   readPaths = [canonical, .context/adrs, .context/docs/adrs]; isLegacy = true
test("resolveAdrPath: both legacy paths exist (canonical absent)", () => {
  const { root, cleanup } = fixture();
  mkdirSync(join(root, ".context", "adrs"), { recursive: true });
  mkdirSync(join(root, ".context", "docs", "adrs"), { recursive: true });
  const r = resolveAdrPath(root);
  assert.equal(r.write, join(root, ".context", "engineering", "adrs"));
  assert.equal(r.readPaths.length, 3);
  assert.equal(r.readPaths[0], join(root, ".context", "engineering", "adrs"),
    "canonical always first");
  assert.equal(r.readPaths[1], join(root, ".context", "adrs"));
  assert.equal(r.readPaths[2], join(root, ".context", "docs", "adrs"));
  assert.equal(r.isLegacy, true, "canonical absent + legacy present → isLegacy");
  cleanup();
});

// Canonical path exists — the fully migrated state
test("resolveAdrPath: canonical engineering/adrs exists (migrated project)", () => {
  const { root, cleanup } = fixture();
  mkdirSync(join(root, ".context", "engineering", "adrs"), { recursive: true });
  const r = resolveAdrPath(root);
  assert.equal(r.write, join(root, ".context", "engineering", "adrs"));
  assert.equal(r.readPaths[0], join(root, ".context", "engineering", "adrs"));
  assert.equal(r.readPaths.length, 1, "no legacy paths present");
  assert.equal(r.isLegacy, false);
  cleanup();
});

// Old "neither path exists" — still valid: canonical returned as write, readPaths=[canonical]
test("resolveAdrPath: neither path exists", () => {
  const { root, cleanup } = fixture();
  mkdirSync(join(root, ".context"), { recursive: true });
  const r = resolveAdrPath(root);
  assert.equal(r.write, join(root, ".context", "engineering", "adrs"));
  assert.deepEqual(r.readPaths, [join(root, ".context", "engineering", "adrs")],
    "canonical always in readPaths even when not on disk");
  assert.equal(r.isLegacy, false);
  cleanup();
});
