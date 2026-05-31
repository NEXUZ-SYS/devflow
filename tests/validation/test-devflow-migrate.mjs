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

// ── Merge semantics (TDD: RED written before implementation) ──────────────────

function mergeFixture() {
  // Source: .context/adrs/001-a.md  (v1 top-level)
  // Dest already exists: .context/engineering/adrs/006-b.md
  // Other subsystems at top-level only (no pre-existing dest → whole-dir move)
  const root = mkdtempSync(join(tmpdir(), "migrate-merge-"));
  mkdirSync(join(root, ".context", "adrs"), { recursive: true });
  mkdirSync(join(root, ".context", "engineering", "adrs"), { recursive: true });
  mkdirSync(join(root, ".context", "standards"), { recursive: true });
  mkdirSync(join(root, ".context", "stacks"), { recursive: true });
  mkdirSync(join(root, ".context", "templates"), { recursive: true });
  writeFileSync(join(root, ".context", "adrs", "001-a.md"), "# ADR 001\n");
  writeFileSync(join(root, ".context", "engineering", "adrs", "006-b.md"), "# ADR 006\n");
  writeFileSync(join(root, ".context", "standards", "std-s.md"), "# std-s\n");
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["add", "-A"], { cwd: root });
  execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "init"], { cwd: root });
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test("migrate: MERGE — entradas de fonte movidas para dest existente; fonte removida", () => {
  // TDD RED: tests written before merge logic exists in devflow-migrate.mjs
  const { root, cleanup } = mergeFixture();
  execFileSync("node", [SCRIPT, `--project=${root}`, "--yes"], { stdio: "pipe" });
  // Both the pre-existing dest entry and the newly merged entry must be present
  assert.ok(
    existsSync(join(root, ".context", "engineering", "adrs", "001-a.md")),
    "001-a.md deve ter sido movido para engineering/adrs",
  );
  assert.ok(
    existsSync(join(root, ".context", "engineering", "adrs", "006-b.md")),
    "006-b.md original deve permanecer intacto",
  );
  // Source dir must be gone after a full merge (no conflicts here)
  assert.ok(
    !existsSync(join(root, ".context", "adrs")),
    ".context/adrs deve ter sido removido após merge completo",
  );
  // Other subsystems (no pre-existing dest) are moved whole
  assert.ok(existsSync(join(root, ".context", "engineering", "standards", "std-s.md")));
  assert.ok(existsSync(join(root, ".context", "engineering", "stacks")));
  assert.ok(existsSync(join(root, ".context", "engineering", "templates")));
  cleanup();
});

function collisionFixture() {
  // .context/standards/std-x.md AND .context/engineering/standards/std-x.md
  // both exist with DIFFERENT content — collision
  const root = mkdtempSync(join(tmpdir(), "migrate-collision-"));
  mkdirSync(join(root, ".context", "standards"), { recursive: true });
  mkdirSync(join(root, ".context", "engineering", "standards"), { recursive: true });
  mkdirSync(join(root, ".context", "adrs"), { recursive: true });
  mkdirSync(join(root, ".context", "stacks"), { recursive: true });
  mkdirSync(join(root, ".context", "templates"), { recursive: true });
  writeFileSync(join(root, ".context", "standards", "std-x.md"), "# SOURCE version\n");
  writeFileSync(join(root, ".context", "engineering", "standards", "std-x.md"), "# DEST version\n");
  writeFileSync(join(root, ".context", "adrs", "001-a.md"), "# ADR 001\n");
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["add", "-A"], { cwd: root });
  execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "init"], { cwd: root });
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test("migrate: COLLISION — dest mantém versão original; run não crasha (exit 0)", () => {
  // TDD RED: collision logic does not exist yet
  const { root, cleanup } = collisionFixture();
  // Must not throw (exit 0)
  execFileSync("node", [SCRIPT, `--project=${root}`, "--yes"], { stdio: "pipe" });
  // Dest keeps its ORIGINAL content — must NOT be overwritten
  const destContent = readFileSync(
    join(root, ".context", "engineering", "standards", "std-x.md"),
    "utf-8",
  );
  assert.equal(destContent, "# DEST version\n", "dest não deve ser sobrescrito em colisão");
  // Source copy must remain in place (since it was not moved)
  assert.ok(
    existsSync(join(root, ".context", "standards", "std-x.md")),
    "cópia de origem deve permanecer ao lado em colisão",
  );
  cleanup();
});

test("migrate: IDEMPOTÊNCIA após merge completo — 2ª execução é no-op", () => {
  // TDD RED: idempotency after merge (source gone, layout-version written)
  const { root, cleanup } = mergeFixture();
  // First run
  execFileSync("node", [SCRIPT, `--project=${root}`, "--yes"], { stdio: "pipe" });
  // Second run must exit 0 cleanly (idempotency guard kicks in)
  execFileSync("node", [SCRIPT, `--project=${root}`, "--yes"], { stdio: "pipe" });
  assert.ok(existsSync(join(root, ".context", "engineering", "adrs", "001-a.md")));
  assert.ok(existsSync(join(root, ".context", "engineering", "adrs", "006-b.md")));
  cleanup();
});
