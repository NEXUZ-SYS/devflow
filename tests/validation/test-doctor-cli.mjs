#!/usr/bin/env node
// tests/validation/test-doctor-cli.mjs
// E2E for the doctor CLI: runs the real script against tmp fixtures.
// The CLI uses the real PATH for `which`, but fixtures are crafted so the
// outcome is deterministic regardless of what's installed. Never touches the
// real .mcp.json or palace (cwd is a tmp repo).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

const CLI = join(process.cwd(), "scripts", "doctor.mjs");

function run(cwd, args = []) {
  try {
    const stdout = execFileSync("node", [CLI, ...args], { cwd, encoding: "utf-8" });
    return { status: 0, stdout };
  } catch (e) {
    return { status: e.status ?? 1, stdout: e.stdout?.toString() || "" };
  }
}

function tmpRepo() {
  const dir = mkdtempSync(join(tmpdir(), "doctor-cli-"));
  mkdirSync(join(dir, ".context"), { recursive: true });
  return dir;
}

test("CLI --json: broken .mcp.json (invalid JSON) reports FAIL and exits non-zero", () => {
  const dir = tmpRepo();
  writeFileSync(join(dir, ".mcp.json"), "{ broken");
  const { status, stdout } = run(dir, ["--json"]);
  assert.equal(status, 1, "FAIL must produce non-zero exit");
  const parsed = JSON.parse(stdout);
  const mcp = parsed.results.find(r => r.id === "mcp-config-valid");
  assert.equal(mcp.status, "FAIL");
});

test("CLI human report renders severity counts", () => {
  const dir = tmpRepo();
  writeFileSync(join(dir, ".mcp.json"), JSON.stringify({
    mcpServers: { mempalace: { command: "definitely-not-on-path-xyz", args: [] } },
  }));
  const { stdout } = run(dir);
  assert.match(stdout, /DevFlow Doctor/);
  assert.match(stdout, /FAIL/);
  assert.match(stdout, /Repair:/);
});

test("CLI --check runs a single check", () => {
  const dir = tmpRepo(); // no .devflow.yaml → devflow-config WARN
  const { stdout } = run(dir, ["--check", "devflow-config", "--json"]);
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.results.length, 1);
  assert.equal(parsed.results[0].id, "devflow-config");
});
