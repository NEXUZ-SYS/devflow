#!/usr/bin/env node
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
const SCRIPT = join(process.cwd(), "scripts", "devflow-standards.mjs");

function pluginFixture() {
  const plugin = mkdtempSync(join(tmpdir(), "eject-plugin-"));
  mkdirSync(join(plugin, "assets", "standards"), { recursive: true });
  writeFileSync(join(plugin, "assets", "standards", "std-security.md"), "---\nid: std-security\n---\n## Princípios\nx\n");
  return plugin;
}

test("eject copia default → projeto", () => {
  const root = mkdtempSync(join(tmpdir(), "eject-")); const plugin = pluginFixture();
  execFileSync("node", [SCRIPT, "eject", "std-security", `--project=${root}`], { stdio: "pipe", env: { ...process.env, CLAUDE_PLUGIN_ROOT: plugin } });
  const out = join(root, ".context", "engineering", "standards", "std-security.md");
  assert.ok(existsSync(out));
  assert.match(readFileSync(out, "utf-8"), /id: std-security/);
  rmSync(root,{recursive:true,force:true}); rmSync(plugin,{recursive:true,force:true});
});

test("eject aceita id sem prefixo (security)", () => {
  const root = mkdtempSync(join(tmpdir(), "eject2-")); const plugin = pluginFixture();
  execFileSync("node", [SCRIPT, "eject", "security", `--project=${root}`], { stdio: "pipe", env: { ...process.env, CLAUDE_PLUGIN_ROOT: plugin } });
  assert.ok(existsSync(join(root, ".context", "engineering", "standards", "std-security.md")));
  rmSync(root,{recursive:true,force:true}); rmSync(plugin,{recursive:true,force:true});
});

test("R5: eject rejeita id com traversal", () => {
  const root = mkdtempSync(join(tmpdir(), "eject3-")); const plugin = pluginFixture();
  let code = 0;
  try { execFileSync("node", [SCRIPT, "eject", "../../../etc/passwd", `--project=${root}`], { stdio: "pipe", env: { ...process.env, CLAUDE_PLUGIN_ROOT: plugin } }); }
  catch (e) { code = e.status; }
  assert.equal(code, 1);
  rmSync(root,{recursive:true,force:true}); rmSync(plugin,{recursive:true,force:true});
});
