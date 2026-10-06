// scripts/lib/standards-streak.mjs — anti-loop do bloqueio por sessão (ADR-015, T15).
// O estado vive em .context/runtime/ e é forjável pelo agente. Por construção, o pior efeito de
// forjá-lo é trocar o TEXTO do bloqueio: quem consome só usa a contagem para escolher a mensagem.
import { writeFileSync, mkdirSync, rmSync, renameSync, lstatSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { readRegularFileSafe } from "./safe-read.mjs";

export const STREAK_LIMIT = 3;
export const MAX_SESSIONS = 64;
export const MAX_FPS = 256;
export const MAX_STATE_BYTES = 64 * 1024; // teto de leitura
const WRITE_BUDGET = 60 * 1024; // folga sob o teto de leitura, para o arquivo nunca ficar ilegível
const MAX_COUNT = 1_000_000;
const MAX_PATH = 512;

export const streakPath = (root) => join(root, ".context", "runtime", "standards-block-streak.json");

function isRealDir(p) {
  const st = lstatSync(p, { throwIfNoEntry: false });
  return Boolean(st && st.isDirectory() && !st.isSymbolicLink());
}
function runtimeUsable(root, { create }) {
  const ctx = join(root, ".context");
  if (!isRealDir(ctx)) return false;
  const rt = join(ctx, "runtime");
  const st = lstatSync(rt, { throwIfNoEntry: false });
  if (!st) {
    if (!create) return false;
    try { mkdirSync(rt); } catch { return false; }
    return isRealDir(rt);
  }
  return st.isDirectory() && !st.isSymbolicLink();
}

const hasSession = (key) => String(key ?? "").split(":")[0].length > 0;

/** Lê o estado como Map<sessão, Map<fp, {n, path}>>; qualquer defeito vira "vazio". */
function readState(root) {
  const keys = new Map();
  const raw = readRegularFileSafe(streakPath(root), MAX_STATE_BYTES);
  if (raw === null) return keys;
  try {
    const st = JSON.parse(raw);
    if (!st || typeof st.keys !== "object" || st.keys === null || Array.isArray(st.keys)) return keys;
    for (const [k, v] of Object.entries(st.keys)) {
      if (!v || typeof v !== "object" || Array.isArray(v)) continue;
      const fps = new Map();
      for (const [fp, e] of Object.entries(v)) {
        if (!e || typeof e.path !== "string" || !Number.isFinite(e.n) || e.n < 1) continue;
        fps.set(fp, { n: Math.min(Math.floor(e.n), MAX_COUNT), path: e.path.slice(0, MAX_PATH) });
      }
      keys.set(k, fps);
    }
  } catch { /* estado ilegível = sem histórico */ }
  return keys;
}

function serialize(keys) {
  const obj = {};
  for (const [k, fps] of keys) obj[k] = Object.fromEntries(fps);
  return JSON.stringify({ keys: obj });
}

/**
 * Registra os bloqueios de `file` na sessão e devolve a contagem seguida por impressão digital
 * (só as do arquivo). Zera apenas as impressões digitais do MESMO arquivo que deixaram de
 * bloquear. Sem `session_id` na chave, ou com `.context/runtime` inutilizável (symlink), não há
 * streak: devolve Map vazio e não grava.
 *
 * O hook síncrono chama isto em toda edição. Sem bloqueio a registrar e sem sequência anterior
 * deste arquivo a zerar, sai sem criar `.context/runtime/` e sem gravar.
 */
export function recordBlocks(root, sessionKey, file, findings) {
  const none = new Map();
  if (!root || !hasSession(sessionKey)) return none;
  try {
    const hits = (findings || []).filter((f) => f && typeof f.fp === "string");
    if (!runtimeUsable(root, { create: hits.length > 0 })) return none;
    const keys = readState(root);
    const key = String(sessionKey);
    const prev = keys.get(key) || new Map();
    if (!hits.length && ![...prev.values()].some((e) => e.path === file)) return none;
    const next = new Map();
    for (const [fp, e] of prev) if (e.path !== file) next.set(fp, e);
    for (const f of hits) {
      const before = prev.get(f.fp);
      next.delete(f.fp);
      next.set(f.fp, { n: Math.min(((before && before.path === file ? before.n : 0) || 0) + 1, MAX_COUNT), path: String(file).slice(0, MAX_PATH) });
    }
    while (next.size > MAX_FPS) next.delete(next.keys().next().value);
    keys.delete(key);
    if (next.size) keys.set(key, next);
    while (keys.size > MAX_SESSIONS) keys.delete(keys.keys().next().value);
    let body = serialize(keys);
    while (body.length > WRITE_BUDGET && (keys.size > 1 || next.size > 1)) {
      if (keys.size > 1) keys.delete(keys.keys().next().value);
      else next.delete(next.keys().next().value);
      body = serialize(keys);
    }
    const target = streakPath(root);
    const tmp = `${target}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
    try {
      writeFileSync(tmp, body, { flag: "wx" });
      renameSync(tmp, target);
    } catch {
      rmSync(tmp, { force: true });
    }
    return new Map([...next].filter(([, e]) => e.path === file).map(([fp, e]) => [fp, e.n]));
  } catch {
    return none;
  }
}
