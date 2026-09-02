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

// Campos de EXECUÇÃO. Vivem por máquina em .context/runtime/ — nunca no
// arquivo versionado: numa cadência diária, uma máquina marcar "rodei hoje"
// silenciaria as outras, e o working tree acumularia diff a cada sessão.
const STATE_FIELDS = ["lastRun", "nextRun", "lastSuggested", "snoozeUntil"];

function stateFile(cwd) {
  return join(cwd, ".context", "runtime", "routines-state.json");
}

export function loadState(cwd) {
  try {
    return JSON.parse(readFileSync(stateFile(cwd), "utf-8"));
  } catch {
    return {};
  }
}

function saveState(cwd, state) {
  const path = stateFile(cwd);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(state, null, 2) + "\n");
}

// Ausência do arquivo de estado é o sinal de clone novo: .context/runtime/ é
// gitignored, logo não vem no clone. O gatilho de bootstrap sai daí, sem flag.
export function isFirstContact(cwd) {
  return !existsSync(stateFile(cwd));
}

export function loadRoutines(cwd) {
  const path = file(cwd);
  if (!existsSync(path)) return { routines: [], path };
  let data;
  try {
    data = JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return { routines: [], path };
  }
  const defs = Array.isArray(data.routines) ? data.routines : [];

  // Migração do formato antigo: campos de estado no arquivo versionado.
  // Reescreve o versionado UMA vez — esse diff é a própria correção.
  const state = loadState(cwd);
  let migrated = false;
  for (const r of defs) {
    for (const f of STATE_FIELDS) {
      if (f in r) {
        state[r.id] = state[r.id] || {};
        if (!(f in state[r.id])) state[r.id][f] = r[f];
        delete r[f];
        migrated = true;
      }
    }
  }
  if (migrated) {
    saveState(cwd, state);
    writeFileSync(path, JSON.stringify({ routines: defs }, null, 2) + "\n");
  }

  const routines = defs.map(r => ({ ...r, ...(state[r.id] || {}) }));
  return { routines, path };
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
// Um passo `check` nomeia um GRUPO, não a lista de ids: acrescentar um check
// no futuro não deve exigir editar o routines.json de cada projeto.
export const CHECK_GROUPS = {
  "plugin-env": ["plugin-declared-installed", "plugin-scope", "plugin-marketplace-known", "plugin-up-to-date"],
  "mempalace-env": ["mempalace-env"],
};

export function resolveCheckIds(value) {
  if (CHECK_GROUPS[value]) return [...CHECK_GROUPS[value]];
  return Object.values(CHECK_GROUPS).some(ids => ids.includes(value)) ? [value] : [];
}

// Classes de execução. Campo único em vez de dois booleanos: autoRun +
// requiresConfirmation admitiriam o estado contraditório "roda sozinha porém
// exige confirmação".
//   auto    — o hook executa sozinha na data agendada (só passos `check`)
//   confirm — na data agendada o sistema PERGUNTA; nunca roda sozinha
//   model   — precisa de um turno do agente
const EXECUTION = new Set(["auto", "confirm", "model"]);

export function classify(routine) {
  if (EXECUTION.has(routine?.execution)) return routine.execution;
  const prompts = routine?.prompts || [];
  if (!prompts.length) return "confirm";
  return prompts.every(p => p?.type === "check") ? "auto" : "confirm";
}

export { renderBlocks } from "./routines-render.mjs";

// snoozeUntil é EXCLUSIVO: no próprio dia a rotina já volta a valer.
function snoozed(routine, today) {
  return routine.snoozeUntil != null && !lte(routine.snoozeUntil, today);
}

// Elegibilidade de EXECUÇÃO. Distinta de shouldSuggest: sem a guarda de 1x/dia
// (lastSuggested), que só faz sentido para surfacing. Um item já mencionado
// hoje continua precisando rodar — sem esta separação, qualquer executor que
// rode depois do bloco de sugestão recebe lista vazia.
export function shouldRun(routine, today) {
  if (routine.enabled === false) return false;
  if (snoozed(routine, today)) return false;
  if (routine.nextRun != null && !lte(routine.nextRun, today)) return false;
  return true;
}

export function dueRoutines(routines, today) {
  return routines.filter(r => shouldRun(r, today));
}

export function shouldSuggest(routine, today) {
  if (!shouldRun(routine, today)) return false;
  if (routine.lastSuggested === today) return false; // 1x/dia — só surfacing
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

function updateState(cwd, id, fn) {
  const { routines } = loadRoutines(cwd);
  if (!routines.find(x => x.id === id)) return false;
  const state = loadState(cwd);
  state[id] = state[id] || {};
  fn(state[id]);
  saveState(cwd, state);
  return true;
}

export function markRun(cwd, id, today) {
  const { routines } = loadRoutines(cwd);
  const r = routines.find(x => x.id === id);
  if (!r) return false;
  return updateState(cwd, id, st => {
    st.lastRun = today;
    st.nextRun = nextRunFrom(today, r.frequency);
    st.snoozeUntil = null;
  });
}

export function snooze(cwd, id, days, today) {
  return updateState(cwd, id, st => { st.snoozeUntil = addDays(today, Number(days)); });
}

export function markSuggested(cwd, id, today) {
  return updateState(cwd, id, st => { st.lastSuggested = today; });
}

export function setEnabled(cwd, id, enabled) {
  return update(cwd, id, r => { r.enabled = !!enabled; });
}
