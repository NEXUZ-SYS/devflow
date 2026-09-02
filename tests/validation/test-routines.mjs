#!/usr/bin/env node
// tests/validation/test-routines.mjs
// Unit tests for the routines scheduling engine. All dates are injected
// (no wall-clock) so tests are deterministic. Fixtures live in tmpdirs;
// the engine never touches anything outside cwd.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  loadRoutines, saveRoutines, nextRunFrom, dueRoutines,
  markRun, snooze, shouldSuggest, markSuggested, shouldRun,
} from "../../scripts/lib/routines.mjs";

function repoWith(routines) {
  const dir = mkdtempSync(join(tmpdir(), "routines-"));
  mkdirSync(join(dir, ".context"), { recursive: true });
  writeFileSync(join(dir, ".context", "routines.json"), JSON.stringify({ routines }, null, 2));
  return dir;
}

// ── date math ───────────────────────────────────────────────────────
test("nextRunFrom handles Nd/Nw/Nm", () => {
  assert.equal(nextRunFrom("2026-05-28", "7d"), "2026-06-04");
  assert.equal(nextRunFrom("2026-05-28", "2w"), "2026-06-11");
  assert.equal(nextRunFrom("2026-01-31", "1m"), "2026-02-28"); // clamps to month end
});

// ── due detection ───────────────────────────────────────────────────
test("dueRoutines: nextRun null or <= today and enabled", () => {
  const dir = repoWith([
    { id: "a", enabled: true, frequency: "7d", nextRun: null },
    { id: "b", enabled: true, frequency: "7d", nextRun: "2026-06-01" }, // future
    { id: "c", enabled: false, frequency: "7d", nextRun: "2020-01-01" }, // disabled
    { id: "d", enabled: true, frequency: "7d", nextRun: "2026-05-28" }, // == today
  ]);
  const { routines } = loadRoutines(dir);
  const due = dueRoutines(routines, "2026-05-28").map(r => r.id);
  assert.deepEqual(due.sort(), ["a", "d"]);
});

// ── run records lastRun + recomputes nextRun ────────────────────────
test("markRun sets lastRun=today and nextRun=today+frequency", () => {
  const dir = repoWith([{ id: "a", enabled: true, frequency: "7d", nextRun: null }]);
  markRun(dir, "a", "2026-05-28");
  const { routines } = loadRoutines(dir);
  const r = routines.find(x => x.id === "a");
  assert.equal(r.lastRun, "2026-05-28");
  assert.equal(r.nextRun, "2026-06-04");
});

// ── snooze ──────────────────────────────────────────────────────────
test("snooze sets snoozeUntil and suppresses due/suggest until then", () => {
  const dir = repoWith([{ id: "a", enabled: true, frequency: "7d", nextRun: null }]);
  snooze(dir, "a", 3, "2026-05-28");
  const { routines } = loadRoutines(dir);
  const r = routines.find(x => x.id === "a");
  assert.equal(r.snoozeUntil, "2026-05-31");
  // still snoozed today → not suggestible
  assert.equal(shouldSuggest(r, "2026-05-29"), false);
  // after snooze window → suggestible again
  assert.equal(shouldSuggest({ ...r }, "2026-06-01"), true);
});

// ── 1x/day suggestion guard ─────────────────────────────────────────
test("shouldSuggest is true once then false same day after markSuggested", () => {
  const dir = repoWith([{ id: "a", enabled: true, frequency: "7d", nextRun: null }]);
  let { routines } = loadRoutines(dir);
  let r = routines.find(x => x.id === "a");
  assert.equal(shouldSuggest(r, "2026-05-28"), true);
  markSuggested(dir, "a", "2026-05-28");
  ({ routines } = loadRoutines(dir));
  r = routines.find(x => x.id === "a");
  assert.equal(shouldSuggest(r, "2026-05-28"), false); // already suggested today
  assert.equal(shouldSuggest(r, "2026-05-29"), true);  // next day OK
});

// ── missing file is tolerated ───────────────────────────────────────
test("loadRoutines returns empty list when file absent", () => {
  const dir = mkdtempSync(join(tmpdir(), "routines-empty-"));
  const { routines } = loadRoutines(dir);
  assert.deepEqual(routines, []);
});

// ── shouldRun: elegibilidade de EXECUÇÃO (≠ de sugestão) ──────────────
test("shouldRun ignora a guarda de 1x/dia do shouldSuggest", () => {
  const r = { id: "a", enabled: true, nextRun: null, lastSuggested: "2026-09-01" };
  assert.equal(shouldSuggest(r, "2026-09-01"), false, "suggest: já sugerida hoje");
  assert.equal(shouldRun(r, "2026-09-01"), true, "run: sugestão não bloqueia execução");
});

test("shouldRun respeita enabled:false", () => {
  assert.equal(shouldRun({ id: "a", enabled: false, nextRun: null }, "2026-09-01"), false);
});

test("shouldRun respeita nextRun no futuro", () => {
  const r = { id: "a", enabled: true, nextRun: "2026-09-08" };
  assert.equal(shouldRun(r, "2026-09-01"), false);
  assert.equal(shouldRun(r, "2026-09-08"), true, "vencimento é inclusivo");
});

test("shouldRun respeita snoozeUntil", () => {
  const r = { id: "a", enabled: true, nextRun: null, snoozeUntil: "2026-09-05" };
  assert.equal(shouldRun(r, "2026-09-01"), false, "sob snooze");
  assert.equal(shouldRun(r, "2026-09-05"), true, "snoozeUntil é exclusivo");
});

test("dueRoutines honra snoozeUntil (regressão do defeito latente)", () => {
  const rs = [{ id: "a", enabled: true, nextRun: null, snoozeUntil: "2026-09-05" }];
  assert.deepEqual(dueRoutines(rs, "2026-09-01").map(r => r.id), [],
    "rotina adiada não pode aparecer como vencida");
  assert.deepEqual(dueRoutines(rs, "2026-09-05").map(r => r.id), ["a"]);
});
