#!/usr/bin/env node
// tests/validation/test-doctor.mjs
// Unit tests for the context-doctor check registry + initial checks.
// Fully isolated: fixtures in tmpdir, all external commands (which/exec) injected
// as fakes — NEVER touches the real .mcp.json, palace, or PATH.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { CHECKS, runChecks, getCheck } from "../../scripts/lib/doctor.mjs";

function tmpRepo() {
  const dir = mkdtempSync(join(tmpdir(), "doctor-"));
  mkdirSync(join(dir, ".context"), { recursive: true });
  return dir;
}

// Default fake context: nothing resolves, no commands succeed.
function ctx(cwd, over = {}) {
  return {
    cwd,
    which: over.which || (() => false),
    exec: over.exec || (() => ({ status: 1, stdout: "", stderr: "" })),
    today: over.today || "2026-05-28",
  };
}

// ── Registry contract ──────────────────────────────────────────────
test("every check honors the result contract", async () => {
  const dir = tmpRepo();
  for (const check of CHECKS) {
    const r = await check.run(ctx(dir));
    for (const k of ["status", "diagnosis"]) assert.ok(k in r, `${check.id} missing ${k}`);
    assert.match(r.status, /^(OK|WARN|FAIL)$/, `${check.id} bad status ${r.status}`);
    assert.match(check.severity, /^(info|warn|critical)$/);
    assert.equal(typeof check.destructive, "boolean");
  }
});

test("runChecks aggregates and sorts FAIL before WARN before OK", async () => {
  const dir = tmpRepo();
  const results = await runChecks(ctx(dir));
  assert.ok(Array.isArray(results));
  const rank = { FAIL: 0, WARN: 1, OK: 2 };
  for (let i = 1; i < results.length; i++) {
    assert.ok(rank[results[i - 1].status] <= rank[results[i].status], "not sorted by severity");
  }
});

// ── mcp-config-valid ───────────────────────────────────────────────
test("mcp-config-valid: FAIL on invalid JSON", async () => {
  const dir = tmpRepo();
  writeFileSync(join(dir, ".mcp.json"), "{ not json");
  const r = await getCheck("mcp-config-valid").run(ctx(dir));
  assert.equal(r.status, "FAIL");
  assert.match(r.diagnosis.toLowerCase(), /json/);
});

test("mcp-config-valid: FAIL on nested mcpServers key", async () => {
  const dir = tmpRepo();
  writeFileSync(join(dir, ".mcp.json"), JSON.stringify({
    mcpServers: { a: { command: "x" }, mcpServers: { b: { command: "y" } } },
  }));
  const r = await getCheck("mcp-config-valid").run(ctx(dir, { which: () => true }));
  assert.equal(r.status, "FAIL");
  assert.match(r.diagnosis.toLowerCase(), /nested|aninhad/);
});

test("mcp-config-valid: FAIL when a stdio command is not on PATH (the python bug)", async () => {
  const dir = tmpRepo();
  writeFileSync(join(dir, ".mcp.json"), JSON.stringify({
    mcpServers: { mempalace: { command: "python", args: ["-m", "mempalace.mcp_server"] } },
  }));
  // which() returns false for everything → command unresolved
  const r = await getCheck("mcp-config-valid").run(ctx(dir));
  assert.equal(r.status, "FAIL");
  assert.match(r.diagnosis, /python/);
  assert.ok(r.repair, "should propose a repair");
});

test("mcp-config-valid: OK when command resolves and no nesting", async () => {
  const dir = tmpRepo();
  writeFileSync(join(dir, ".mcp.json"), JSON.stringify({
    mcpServers: { mempalace: { command: "mempalace-mcp", args: [] } },
  }));
  const r = await getCheck("mcp-config-valid").run(ctx(dir, { which: b => b === "mempalace-mcp" }));
  assert.equal(r.status, "OK");
});

test("mcp-config-valid: http/sse servers skip the PATH check", async () => {
  const dir = tmpRepo();
  writeFileSync(join(dir, ".mcp.json"), JSON.stringify({
    mcpServers: { odoo: { type: "http", url: "https://x/mcp" } },
  }));
  const r = await getCheck("mcp-config-valid").run(ctx(dir)); // which=false but no command
  assert.equal(r.status, "OK");
});

// ── mempalace-health ───────────────────────────────────────────────
test("mempalace-health: WARN + R3 repair on orphan repo.* wings", async () => {
  const dir = tmpRepo();
  const status = "WING: devflow\nWING: repo.XcdlpO\nWING: repo.ccC90H\n";
  const r = await getCheck("mempalace-health").run(ctx(dir, {
    which: b => b === "mempalace",
    exec: () => ({ status: 0, stdout: status, stderr: "" }),
  }));
  assert.equal(r.status, "WARN");
  assert.match(r.diagnosis, /repo\./);
});

test("mempalace-health: FAIL + repair on HNSW drift", async () => {
  const dir = tmpRepo();
  const out = "Quarantined corrupt HNSW segment /x (integrity check failed)\nWING: devflow\n";
  const r = await getCheck("mempalace-health").run(ctx(dir, {
    which: b => b === "mempalace",
    exec: () => ({ status: 0, stdout: out, stderr: "" }),
  }));
  assert.equal(r.status, "FAIL");
  assert.match((r.repair || "").toLowerCase(), /repair/);
});

test("mempalace-health: OK when CLI absent (nothing to check)", async () => {
  const dir = tmpRepo();
  const r = await getCheck("mempalace-health").run(ctx(dir)); // which=false
  assert.equal(r.status, "OK");
});

// ── git-hooks (R5: autoMine set but hook missing) ──────────────────
test("git-hooks: WARN when autoMine post-merge but hook not installed", async () => {
  const dir = tmpRepo();
  writeFileSync(join(dir, ".context", ".devflow.yaml"),
    "mempalace:\n  enabled: true\n  autoMine: post-merge\n");
  // no .git/hooks/post-merge present
  const r = await getCheck("git-hooks").run(ctx(dir));
  assert.equal(r.status, "WARN");
  assert.match((r.repair || ""), /install-hook/);
});

// ── devflow-config ─────────────────────────────────────────────────
test("devflow-config: WARN when .devflow.yaml absent", async () => {
  const dir = tmpRepo(); // .context exists but no .devflow.yaml
  const r = await getCheck("devflow-config").run(ctx(dir));
  assert.equal(r.status, "WARN");
});

// ── grounding-mcp ──────────────────────────────────────────────────
function writeCfg(dir, body) {
  writeFileSync(join(dir, ".context", ".devflow.yaml"), body);
}

test("grounding-mcp: OK when grounding absent", async () => {
  const dir = tmpRepo();
  writeCfg(dir, "git:\n  strategy: branch-flow\n");
  const r = await getCheck("grounding-mcp").run(ctx(dir));
  assert.equal(r.status, "OK");
});

test("grounding-mcp: OK when mode=off", async () => {
  const dir = tmpRepo();
  writeCfg(dir, "grounding:\n  mode: off\n");
  const r = await getCheck("grounding-mcp").run(ctx(dir));
  assert.equal(r.status, "OK");
});

test("grounding-mcp: WARN when active but docsMcpServer not in .mcp.json", async () => {
  const dir = tmpRepo();
  writeCfg(dir, "grounding:\n  mode: docs-only\n  docsMcpServer: docs-mcp-server\n");
  const r = await getCheck("grounding-mcp").run(ctx(dir));
  assert.equal(r.status, "WARN");
  assert.match(r.diagnosis, /docs-mcp-server|fail-closed|grounding/i);
});

test("grounding-mcp: WARN when server configured under a different name", async () => {
  const dir = tmpRepo();
  writeCfg(dir, "grounding:\n  mode: docs-first\n  docsMcpServer: docs-mcp-server\n");
  writeFileSync(join(dir, ".mcp.json"), JSON.stringify({ mcpServers: { other: { command: "npx" } } }));
  const r = await getCheck("grounding-mcp").run(ctx(dir));
  assert.equal(r.status, "WARN");
});

test("grounding-mcp: OK when active and docsMcpServer present in .mcp.json", async () => {
  const dir = tmpRepo();
  writeCfg(dir, "grounding:\n  mode: docs-only\n  docsMcpServer: docs-mcp-server\n");
  writeFileSync(join(dir, ".mcp.json"), JSON.stringify({ mcpServers: { "docs-mcp-server": { command: "npx" } } }));
  const r = await getCheck("grounding-mcp").run(ctx(dir));
  assert.equal(r.status, "OK");
});

// ── permissions-health (GAP-PERM-ROOT proactive detection) ─────────
test("permissions-health: registered in CHECKS", () => {
  assert.ok(getCheck("permissions-health"), "permissions-health must be registered");
});

test("permissions-health: OK when no permissions.yaml (operates in mode:prompt)", async () => {
  const dir = tmpRepo();
  const r = await getCheck("permissions-health").run(ctx(dir));
  assert.equal(r.status, "OK");
});

test("permissions-health: OK on valid devflow-permissions/v0", async () => {
  const dir = tmpRepo();
  writeFileSync(
    join(dir, ".context", "permissions.yaml"),
    'spec: devflow-permissions/v0\ndeny:\n  fs: ["**/.env*"]\nmode: prompt\n'
  );
  const r = await getCheck("permissions-health").run(ctx(dir));
  assert.equal(r.status, "OK");
});

test("permissions-health: FAIL on legacy format (version/list/mode-object)", async () => {
  const dir = tmpRepo();
  writeFileSync(
    join(dir, ".context", "permissions.yaml"),
    'version: 0\ndeny:\n  - path: "**/.env*"\nmode:\n  default: ask\n'
  );
  const r = await getCheck("permissions-health").run(ctx(dir));
  assert.equal(r.status, "FAIL");
  assert.match(r.diagnosis.toLowerCase(), /legado|deny|mode|v0|lockout/);
  assert.match((r.repair || "").toLowerCase(), /devflow config|devflow init|v0/);
});

test("permissions-health: FAIL on unparseable yaml (distinct from legacy)", async () => {
  const dir = tmpRepo();
  writeFileSync(join(dir, ".context", "permissions.yaml"), "spec: *boom\n");
  const r = await getCheck("permissions-health").run(ctx(dir));
  assert.equal(r.status, "FAIL");
  assert.ok(r.repair, "should propose a repair");
});

// Cleanup note: tmpdirs are left to the OS; tests never delete the real palace.
