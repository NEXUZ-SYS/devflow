#!/usr/bin/env node
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
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
