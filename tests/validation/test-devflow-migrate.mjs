#!/usr/bin/env node
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

const SCRIPT = join(process.cwd(), "scripts", "devflow-migrate.mjs");

function v1Project() {
  const root = mkdtempSync(join(tmpdir(), "migrate-"));
  mkdirSync(join(root, ".context", "adrs"), { recursive: true });
  mkdirSync(join(root, ".context", "standards", "machine"), { recursive: true });
  mkdirSync(join(root, ".context", "stacks"), { recursive: true });
  mkdirSync(join(root, ".context", "templates"), { recursive: true });
  mkdirSync(join(root, ".context", "docs"), { recursive: true });
  writeFileSync(join(root, ".context", "adrs", "001-x-v1.0.0.md"), "---\ntype: adr\n---\n# x\n");
  writeFileSync(join(root, ".context", "standards", "std-y.md"), "---\nid: std-y\n---\n# y\n");
  writeFileSync(join(root, ".context", "docs", "project-overview.md"), "---\ntype: doc\n---\n# overview\n");
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["add", "-A"], { cwd: root });
  execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "init"], { cwd: root });
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test("migrate: move subsistemas para engineering/ e cria camadas", () => {
  const { root, cleanup } = v1Project();
  execFileSync("node", [SCRIPT, `--project=${root}`, "--yes"], { stdio: "pipe" });
  assert.ok(existsSync(join(root, ".context", "engineering", "adrs", "001-x-v1.0.0.md")));
  assert.ok(existsSync(join(root, ".context", "engineering", "standards", "std-y.md")));
  assert.ok(existsSync(join(root, ".context", "engineering", "stacks")));
  assert.ok(existsSync(join(root, ".context", "engineering", "templates")));
  assert.ok(existsSync(join(root, ".context", "business")));
  assert.ok(existsSync(join(root, ".context", "product")));
  assert.ok(existsSync(join(root, ".context", "operations")));
  assert.ok(existsSync(join(root, ".context", "docs", "project-overview.md")));
  assert.equal(readFileSync(join(root, ".context", ".layout-version"), "utf-8").trim(), "2");
  cleanup();
});

test("migrate: idempotente (2ª execução é no-op sem erro)", () => {
  const { root, cleanup } = v1Project();
  execFileSync("node", [SCRIPT, `--project=${root}`, "--yes"], { stdio: "pipe" });
  execFileSync("node", [SCRIPT, `--project=${root}`, "--yes"], { stdio: "pipe" });
  assert.ok(existsSync(join(root, ".context", "engineering", "adrs", "001-x-v1.0.0.md")));
  cleanup();
});
