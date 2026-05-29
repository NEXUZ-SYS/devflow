#!/usr/bin/env node
// tests/validation/test-routines-cli.mjs
// E2E for the routines CLI against tmp fixtures with an injected --today.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

const CLI = join(process.cwd(), "scripts", "routines.mjs");

function run(cwd, args) {
  try {
    const stdout = execFileSync("node", [CLI, ...args], { cwd, encoding: "utf-8" });
    return { status: 0, stdout };
  } catch (e) {
    return { status: e.status ?? 1, stdout: e.stdout?.toString() || "" };
  }
}

function repo() {
  const dir = mkdtempSync(join(tmpdir(), "rt-cli-"));
  mkdirSync(join(dir, ".context"), { recursive: true });
  writeFileSync(join(dir, ".context", "routines.json"), JSON.stringify({
    routines: [
      { id: "context-maintenance", description: "doctor", enabled: true, frequency: "7d", nextRun: null,
        prompts: [{ type: "command", value: "/devflow:devflow-doctor" }] },
    ],
  }, null, 2));
  return dir;
}

test("due --json lists overdue routines", () => {
  const dir = repo();
  const { stdout } = run(dir, ["due", "--json", "--today", "2026-05-28"]);
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.due.length, 1);
  assert.equal(parsed.due[0].id, "context-maintenance");
});

test("snooze updates snoozeUntil and removes it from due", () => {
  const dir = repo();
  run(dir, ["snooze", "context-maintenance", "5", "--today", "2026-05-28"]);
  const data = JSON.parse(readFileSync(join(dir, ".context", "routines.json"), "utf-8"));
  assert.equal(data.routines[0].snoozeUntil, "2026-06-02");
  const { stdout } = run(dir, ["due", "--json", "--today", "2026-05-29"]);
  assert.equal(JSON.parse(stdout).due.length, 0);
});

test("mark-run records lastRun and recomputes nextRun", () => {
  const dir = repo();
  run(dir, ["mark-run", "context-maintenance", "--today", "2026-05-28"]);
  const data = JSON.parse(readFileSync(join(dir, ".context", "routines.json"), "utf-8"));
  assert.equal(data.routines[0].lastRun, "2026-05-28");
  assert.equal(data.routines[0].nextRun, "2026-06-04");
});

test("disable removes from due", () => {
  const dir = repo();
  run(dir, ["disable", "context-maintenance"]);
  const { stdout } = run(dir, ["due", "--json", "--today", "2026-05-28"]);
  assert.equal(JSON.parse(stdout).due.length, 0);
});

test("list --json shows all routines with state", () => {
  const dir = repo();
  const { stdout } = run(dir, ["list", "--json", "--today", "2026-05-28"]);
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.routines.length, 1);
  assert.equal(parsed.routines[0].due, true);
});
