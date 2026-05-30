#!/usr/bin/env node
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { contextPaths, resolveReadPaths, LAYOUT_VERSION } from "../../scripts/lib/context-paths.mjs";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "ctx-paths-"));
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test("contextPaths: canonical paths sob engineering/", () => {
  const { root, cleanup } = fixture();
  const p = contextPaths(root);
  assert.equal(p.adrs, join(root, ".context", "engineering", "adrs"));
  assert.equal(p.standards, join(root, ".context", "engineering", "standards"));
  assert.equal(p.standardsMachine, join(root, ".context", "engineering", "standards", "machine"));
  assert.equal(p.stacks, join(root, ".context", "engineering", "stacks"));
  assert.equal(p.templates, join(root, ".context", "engineering", "templates"));
  assert.equal(p.business, join(root, ".context", "business"));
  assert.equal(p.product, join(root, ".context", "product"));
  assert.equal(p.operations, join(root, ".context", "operations"));
  assert.equal(p.engineering, join(root, ".context", "engineering"));
  assert.equal(p.layoutVersionFile, join(root, ".context", ".layout-version"));
  cleanup();
});

test("LAYOUT_VERSION é 2", () => {
  assert.equal(LAYOUT_VERSION, 2);
});

test("resolveReadPaths: ADR tolera legado docs/adrs e topo adrs", () => {
  const { root, cleanup } = fixture();
  mkdirSync(join(root, ".context", "docs", "adrs"), { recursive: true });
  mkdirSync(join(root, ".context", "adrs"), { recursive: true });
  mkdirSync(join(root, ".context", "engineering", "adrs"), { recursive: true });
  const reads = resolveReadPaths(root, "adrs");
  assert.equal(reads[0], join(root, ".context", "engineering", "adrs"));
  assert.ok(reads.includes(join(root, ".context", "adrs")));
  assert.ok(reads.includes(join(root, ".context", "docs", "adrs")));
  cleanup();
});

test("resolveReadPaths: só canonical quando legados ausentes", () => {
  const { root, cleanup } = fixture();
  mkdirSync(join(root, ".context", "engineering", "standards"), { recursive: true });
  const reads = resolveReadPaths(root, "standards");
  assert.deepEqual(reads, [join(root, ".context", "engineering", "standards")]);
  cleanup();
});

test("resolveReadPaths: chave desconhecida lança erro", () => {
  assert.throws(() => resolveReadPaths("/tmp", "nonexistent"), /unknown key 'nonexistent'/);
});
