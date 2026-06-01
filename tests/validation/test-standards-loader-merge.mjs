#!/usr/bin/env node
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadStandardsMerged } from "../../scripts/lib/standards-loader.mjs";

function std(id, src = "devflow-default") { return `---\nid: ${id}\ndescription: ${id}\nversion: 1.0.0\napplyTo: ["**/*.ts"]\nsource: ${src}\nenforcement:\n  linter: null\n---\n## Princípios\nx\n`; }
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "std-merge-"));
  const plugin = mkdtempSync(join(tmpdir(), "std-plugin-"));
  mkdirSync(join(plugin, "assets", "standards"), { recursive: true });
  mkdirSync(join(root, ".context", "engineering", "standards"), { recursive: true });
  writeFileSync(join(plugin, "assets", "standards", "std-security.md"), std("std-security"));
  writeFileSync(join(plugin, "assets", "standards", "std-caching.md"), std("std-caching"));
  return { root, plugin, cleanup: () => { rmSync(root,{recursive:true,force:true}); rmSync(plugin,{recursive:true,force:true}); } };
}

test("merge: defaults do plugin com origin=default", () => {
  const { root, plugin, cleanup } = fixture();
  const sec = loadStandardsMerged(root, plugin).find((s) => s.id === "std-security");
  assert.equal(sec.origin, "default"); cleanup();
});
test("merge: projeto sobrescreve default por id (origin=project, 1 só)", () => {
  const { root, plugin, cleanup } = fixture();
  writeFileSync(join(root, ".context", "engineering", "standards", "std-security.md"), std("std-security", "project"));
  const list = loadStandardsMerged(root, plugin);
  assert.equal(list.find((s) => s.id === "std-security").origin, "project");
  assert.equal(list.filter((s) => s.id === "std-security").length, 1); cleanup();
});
test("R1 disable: inline e block removem o std", () => {
  const { root, plugin, cleanup } = fixture();
  writeFileSync(join(root, ".context", "standards.local.yaml"), "disable: [std-caching]\n");
  assert.ok(!loadStandardsMerged(root, plugin).find((s) => s.id === "std-caching")); cleanup();
});
test("R9 fallback via env CLAUDE_PLUGIN_ROOT (sem 2º arg)", () => {
  const { root, plugin, cleanup } = fixture();
  process.env.CLAUDE_PLUGIN_ROOT = plugin;
  assert.ok(loadStandardsMerged(root).find((s) => s.id === "std-security"));
  delete process.env.CLAUDE_PLUGIN_ROOT; cleanup();
});
test("R7 symlink no dir de standards é ignorado (não lê fora)", () => {
  const { root, plugin, cleanup } = fixture();
  try { symlinkSync("/etc/hostname", join(root, ".context", "engineering", "standards", "std-evil.md")); } catch { cleanup(); return; }
  const list = loadStandardsMerged(root, plugin);
  assert.ok(!list.find((s) => s.id && s.origin === "project" && s.id !== "std-security" && s.id !== "std-caching" && /etc|hostname/i.test(JSON.stringify(s))));
  cleanup();
});
