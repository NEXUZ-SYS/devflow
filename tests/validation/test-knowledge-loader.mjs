#!/usr/bin/env node
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadKnowledgeIndex, loadAlwaysActive } from "../../scripts/lib/knowledge-loader.mjs";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "know-loader-"));
  mkdirSync(join(root, ".context", "business"), { recursive: true });
  mkdirSync(join(root, ".context", "engineering"), { recursive: true });
  const doc = (layer, name, activation) =>
    `---\ntype: knowledge\nlayer: ${layer}\nname: ${name}\ndescription: ${name} desc\nactivation: ${activation}\nowner: x\nversion: 1.0.0\n---\ncorpo de ${name}\n`;
  writeFileSync(join(root, ".context", "business", "vision.md"), doc("business", "vision", "always"));
  writeFileSync(join(root, ".context", "engineering", "architecture-overview.md"), doc("engineering", "architecture-overview", "on-demand"));
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test("loadKnowledgeIndex: 1 entry por doc com metadados", () => {
  const { root, cleanup } = fixture();
  const idx = loadKnowledgeIndex(root);
  const byName = Object.fromEntries(idx.map((e) => [e.name, e]));
  assert.equal(byName["vision"].layer, "business");
  assert.equal(byName["vision"].activation, "always");
  assert.equal(byName["architecture-overview"].activation, "on-demand");
  cleanup();
});

test("loadAlwaysActive: só docs activation:always com corpo", () => {
  const { root, cleanup } = fixture();
  const active = loadAlwaysActive(root);
  assert.equal(active.length, 1);
  assert.equal(active[0].name, "vision");
  assert.match(active[0].body, /corpo de vision/);
  cleanup();
});

// ── Fix 2: symlink guard ──────────────────────────────────────────────────────

test("loadKnowledgeIndex: symlink inside layer dir is skipped (no crash, no escape)", () => {
  // Create a tmpdir outside the project root (simulates escaping outside .context/)
  const outsideDir = mkdtempSync(join(tmpdir(), "outside-"));
  writeFileSync(join(outsideDir, "secret.md"), "---\ntype: knowledge\nlayer: business\nname: secret\ndescription: should not be indexed\nactivation: always\nowner: x\nversion: 1.0.0\n---\nSECRET CONTENT\n");

  const { root } = fixture();
  // Place a symlink inside the business layer pointing to the outside dir
  symlinkSync(outsideDir, join(root, ".context", "business", "escape-link"));

  // Must not crash (no infinite recursion or ELOOP) and must not index the symlinked content
  let idx;
  assert.doesNotThrow(() => {
    idx = loadKnowledgeIndex(root);
  }, "walkMd must not crash on a symlink");

  const names = idx.map((e) => e.name);
  assert.ok(!names.includes("secret"), `symlinked file 'secret' must not appear in index; got: ${JSON.stringify(names)}`);

  rmSync(root, { recursive: true, force: true });
  rmSync(outsideDir, { recursive: true, force: true });
});

test("loadKnowledgeIndex: circular symlink does not cause infinite recursion", () => {
  const root = mkdtempSync(join(tmpdir(), "know-circular-"));
  mkdirSync(join(root, ".context", "business"), { recursive: true });
  // Create a circular symlink: business/loop -> business/
  symlinkSync(join(root, ".context", "business"), join(root, ".context", "business", "loop"));

  assert.doesNotThrow(() => {
    loadKnowledgeIndex(root);
  }, "walkMd must not infinite-loop on circular symlink");

  rmSync(root, { recursive: true, force: true });
});
