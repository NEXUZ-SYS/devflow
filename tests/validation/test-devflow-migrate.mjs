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

// ── Fix 3: legacy docs/adrs source ───────────────────────────────────────────

function v0LegacyDocsAdrs() {
  // v0.x fixture: ADRs only in .context/docs/adrs/ (legacy location)
  // .context/adrs does NOT exist; .context/docs/adrs/ DOES exist
  const root = mkdtempSync(join(tmpdir(), "migrate-docs-adrs-"));
  mkdirSync(join(root, ".context", "docs", "adrs"), { recursive: true });
  mkdirSync(join(root, ".context", "standards", "machine"), { recursive: true });
  mkdirSync(join(root, ".context", "stacks"), { recursive: true });
  mkdirSync(join(root, ".context", "templates"), { recursive: true });
  writeFileSync(join(root, ".context", "docs", "adrs", "001-legacy-v1.0.0.md"), "---\ntype: adr\n---\n# legacy\n");
  writeFileSync(join(root, ".context", "standards", "std-z.md"), "---\nid: std-z\n---\n# z\n");
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["add", "-A"], { cwd: root });
  execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "init"], { cwd: root });
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test("migrate: v0.x fixture com ADRs em docs/adrs migra para engineering/adrs", () => {
  // TDD: RED → written before fix; GREEN → fix in devflow-migrate.mjs
  const { root, cleanup } = v0LegacyDocsAdrs();
  execFileSync("node", [SCRIPT, `--project=${root}`, "--yes"], { stdio: "pipe" });
  // ADR must appear under engineering/adrs
  assert.ok(
    existsSync(join(root, ".context", "engineering", "adrs", "001-legacy-v1.0.0.md")),
    "ADR from docs/adrs must be migrated to engineering/adrs",
  );
  // Original docs/adrs must no longer exist at the old location
  assert.ok(
    !existsSync(join(root, ".context", "docs", "adrs")),
    "docs/adrs should have been moved, not just copied",
  );
  // Layout version must be written
  assert.equal(readFileSync(join(root, ".context", ".layout-version"), "utf-8").trim(), "2");
  cleanup();
});

test("migrate: docs/adrs fallback é idempotente (2ª execução não duplifica)", () => {
  const { root, cleanup } = v0LegacyDocsAdrs();
  execFileSync("node", [SCRIPT, `--project=${root}`, "--yes"], { stdio: "pipe" });
  // Second run must exit 0 without error (already at layout v2)
  execFileSync("node", [SCRIPT, `--project=${root}`, "--yes"], { stdio: "pipe" });
  assert.ok(existsSync(join(root, ".context", "engineering", "adrs", "001-legacy-v1.0.0.md")));
  cleanup();
});
