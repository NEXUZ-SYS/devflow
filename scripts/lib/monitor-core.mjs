// Estado da faixa do monitor de roteamento (puro: sem `$`, sem node:*). Spec: 2026-10-09-router-monitor-toolbar.
export const MAX_ROWS = 50;
export const MAX_KEYS = 500;
export const PROMPT_SCAN = 2048;
export const STALE_MS = 30_000;

const DONE = new Set(["completed", "failed", "killed"]);
const TASK_RE = /\bTask (\d+[a-z]?)\b/;
const STORY_RE = /^\s*(?:[-*]\s+)?Current story:\s*(S\d+)\b/m;
const IMPLEMENT_RE = /^\s*(?:Implement|Fix)\b/i;
const REVIEW_RE = /^\s*(?:Re-?review|Review)\b/i;

export function createMonitorState() {
  return { rows: [], retries: {} };
}

export function extractTaskId({ description, prompt } = {}) {
  const d = typeof description === "string" ? description.match(TASK_RE) : null;
  if (d) return `Task ${d[1]}`;
  const p = typeof prompt === "string" ? prompt.slice(0, PROMPT_SCAN).match(STORY_RE) : null;
  return p ? p[1] : null;
}

// O SDD despacha implementer e reviewer como general-purpose: o papel separa as chaves.
export function extractRole(description) {
  if (typeof description !== "string") return null;
  if (IMPLEMENT_RE.test(description)) return "implement";
  if (REVIEW_RE.test(description)) return "review";
  return null;
}

function bumpRetry(state, key) {
  const seen = state.retries[key] ?? 0;
  delete state.retries[key]; // reinsere no fim: a ordem de inserção é a idade
  state.retries[key] = seen + 1;
  const keys = Object.keys(state.retries);
  for (let i = 0; i < keys.length - MAX_KEYS; i++) delete state.retries[keys[i]];
  return seen;
}

export function onSpawned(state, { agentId, subagentType, description, prompt, model, now }) {
  if (typeof agentId !== "string" || !agentId) return null;
  const type = typeof subagentType === "string" && subagentType ? subagentType : "agente";
  const taskId = extractTaskId({ description, prompt });
  const role = taskId ? extractRole(description) : null;
  const retries = taskId ? bumpRetry(state, `${type}::${role ?? "-"}::${taskId}`) : null;
  const label = taskId ? `${type} · ${taskId}${role ? ` · ${role}` : ""}` : type;
  const row = {
    id: agentId, label, startedAt: now, lastEventAt: now,
    model: typeof model === "string" && model ? model : null, effort: null, streak: 0, retries,
  };
  state.rows = state.rows.filter((r) => r.id !== agentId);
  state.rows.push(row);
  while (state.rows.length > MAX_ROWS) {
    const i = state.rows.findIndex((r) => r.id !== "main");
    state.rows.splice(i < 0 ? 0 : i, 1);
  }
  return row;
}

export function openMain(state, { now }) {
  state.rows = state.rows.filter((r) => r.id !== "main");
  state.rows.unshift({ id: "main", label: "sessão", startedAt: now, lastEventAt: now, model: null, effort: null, streak: 0, retries: null });
}

export function closeMain(state) {
  const n = state.rows.length;
  state.rows = state.rows.filter((r) => r.id !== "main");
  return state.rows.length !== n;
}

export function onTool(state, { loopId, isError, now }) {
  const row = state.rows.find((r) => r.id === loopId);
  if (!row) return false;
  row.streak = isError ? row.streak + 1 : 0;
  row.lastEventAt = now;
  return true;
}

export function onStep(state, { loopId, model, effort, now }) {
  const row = state.rows.find((r) => r.id === loopId);
  if (!row) return false;
  let changed = false;
  if (typeof model === "string" && model && model !== row.model) { row.model = model; changed = true; }
  if (typeof effort === "string" && effort && effort !== row.effort) { row.effort = effort; changed = true; }
  row.lastEventAt = now;
  return changed;
}

export function reap(state, { list, now }) {
  const before = state.rows.length;
  const status = Array.isArray(list) ? new Map(list.map((a) => [a?.id, a?.status])) : null;
  state.rows = state.rows.filter((r) => {
    if (r.id === "main") return true;
    if (status) return status.has(r.id) && !DONE.has(status.get(r.id));
    return now - r.lastEventAt <= STALE_MS;
  });
  return state.rows.length !== before;
}

export const isLive = (state) => state.rows.length > 0;
