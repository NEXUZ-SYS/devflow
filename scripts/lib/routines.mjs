// scripts/lib/routines.mjs
// File-based maintenance scheduler for DevFlow. Routines live in
// `.context/routines.json` (machine-mutated state → JSON for safe round-trip).
// The engine is evaluated at SessionStart; it SUGGESTS due routines but never
// executes them. All date logic takes an explicit `today` (YYYY-MM-DD) — no
// wall-clock — so behavior is deterministic and testable.
//
// Routine schema:
//   { id, description, enabled, frequency ("Nd"|"Nw"|"Nm"),
//     lastRun, nextRun, lastSuggested, snoozeUntil,
//     prompts: [ { type: "command"|"skill"|"agent", value, args? } ] }

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

function file(cwd) {
  return join(cwd, ".context", "routines.json");
}

export function loadRoutines(cwd) {
  const path = file(cwd);
  if (!existsSync(path)) return { routines: [], path };
  try {
    const data = JSON.parse(readFileSync(path, "utf-8"));
    return { routines: Array.isArray(data.routines) ? data.routines : [], path };
  } catch {
    return { routines: [], path };
  }
}

export function saveRoutines(cwd, routines) {
  const path = file(cwd);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ routines }, null, 2) + "\n");
}

// ── date helpers (UTC, explicit args — no Date.now) ─────────────────
function parse(d) {
  const [y, m, day] = d.split("-").map(Number);
  return { y, m, day };
}
function toStr(y, m, day) {
  const p = n => String(n).padStart(2, "0");
  return `${y}-${p(m)}-${p(day)}`;
}
function addDays(d, n) {
  const dt = new Date(Date.UTC(...Object.values(parse(d)).map((v, i) => (i === 1 ? v - 1 : v))));
  dt.setUTCDate(dt.getUTCDate() + n);
  return toStr(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}
function addMonths(d, n) {
  const { y, m, day } = parse(d);
  const total = (y * 12 + (m - 1)) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const lastDay = new Date(Date.UTC(ny, nm, 0)).getUTCDate(); // day 0 of next month = last day
  return toStr(ny, nm, Math.min(day, lastDay));
}

export function nextRunFrom(fromDate, frequency) {
  const m = /^(\d+)([dwm])$/.exec(String(frequency || "").trim());
  if (!m) return fromDate;
  const n = Number(m[1]);
  if (m[2] === "d") return addDays(fromDate, n);
  if (m[2] === "w") return addDays(fromDate, n * 7);
  return addMonths(fromDate, n);
}

function lte(a, b) {
  return a <= b; // YYYY-MM-DD is lexicographically ordered
}

// ── scheduling ──────────────────────────────────────────────────────
export function dueRoutines(routines, today) {
  return routines.filter(r => r.enabled !== false && (r.nextRun == null || lte(r.nextRun, today)));
}

export function shouldSuggest(routine, today) {
  if (routine.enabled === false) return false;
  if (routine.snoozeUntil && !lte(routine.snoozeUntil, today)) return false; // still snoozed (until is exclusive)
  if (routine.nextRun != null && !lte(routine.nextRun, today)) return false; // not due
  if (routine.lastSuggested === today) return false; // already suggested today (1x/day)
  return true;
}

// ── mutations ───────────────────────────────────────────────────────
function update(cwd, id, fn) {
  const { routines } = loadRoutines(cwd);
  const r = routines.find(x => x.id === id);
  if (!r) return false;
  fn(r);
  saveRoutines(cwd, routines);
  return true;
}

export function markRun(cwd, id, today) {
  return update(cwd, id, r => {
    r.lastRun = today;
    r.nextRun = nextRunFrom(today, r.frequency);
    r.snoozeUntil = null;
  });
}

export function snooze(cwd, id, days, today) {
  return update(cwd, id, r => { r.snoozeUntil = addDays(today, Number(days)); });
}

export function markSuggested(cwd, id, today) {
  return update(cwd, id, r => { r.lastSuggested = today; });
}

export function setEnabled(cwd, id, enabled) {
  return update(cwd, id, r => { r.enabled = !!enabled; });
}
