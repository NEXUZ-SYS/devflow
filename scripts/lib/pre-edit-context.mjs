#!/usr/bin/env node
// scripts/lib/pre-edit-context.mjs — normas e knowledge do arquivo editado (spec §4).
//
// Monta o additionalContext do PreToolUse: resumo (Princípios + Anti-patterns) dos standards
// aplicáveis ao arquivo e o knowledge on-demand relevante, cada corpo emoldurado por
// frameProjectData. Orçamento em unidades UTF-16 (a unidade em que o Claude Code mede):
// resumos de std até `digestChars`, o total até `maxChars`; blocos entram inteiros, nunca
// cortados. O que não cabe vira ponteiro ("leia <arquivo>"); o que nem o ponteiro cabe fica
// FORA dos ids e volta na próxima edição.
//
// Não grava o cache: quem marca é o hook, só no caminho de allow (entrega garantida). O
// cache é por sessão E por agente — `sessionKey` = "session_id:agent_id", com agent_id vazio
// no agente principal — para o subagente receber o que o principal já viu sem apagar a
// marcação do principal.
//
// CLI (SI-1: arquivo invocado com args, nunca `node -e`):
//   node pre-edit-context.mjs <projectRoot> <filePath> <sessionKey>  → 1ª linha: ids (vírgula); resto: texto
//   node pre-edit-context.mjs --mark <projectRoot> <sessionKey> <ids>
//   node pre-edit-context.mjs --clear <projectRoot>
import { writeFileSync, mkdirSync, rmSync, renameSync, lstatSync } from "node:fs";
import { join, resolve, isAbsolute } from "node:path";
import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import { findProjectRoot, loadEffectiveStandards, applicableStandards } from "./standards-engine.mjs";
import { extractStandardRules } from "./edit-nudge.mjs";
import { resolveLevel, maxLevel, RANK } from "./standards-level.mjs";
import { toRelPosix } from "./standards-baseline.mjs";
import { relevantOnDemandKnowledge } from "./knowledge-ondemand.mjs";
import { frameProjectData, safeName, displayPath } from "./untrusted-frame.mjs";
import { readRegularFileSafe } from "./safe-read.mjs";

export const MAX_CACHE_KEYS = 64;
export const MAX_CACHE_BYTES = 64 * 1024;
const FOOTER_ROOM = 120; // espaço guardado para o rodapé de itens adiados

export const preEditCachePath = (root) => join(root, ".context", "runtime", "pre-edit-cache.json");

const resolveRoot = (p) => findProjectRoot(p) || resolve(p);

// Diretório real (não symlink). Um `.context/runtime` apontando para fora do projeto não
// pode virar caminho de escrita nem de remoção.
function isRealDir(p) {
  const st = lstatSync(p, { throwIfNoEntry: false });
  return Boolean(st && st.isDirectory() && !st.isSymbolicLink());
}
function runtimeUsable(root, { create = false } = {}) {
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

// Cache: { keys: { [sessionKey]: string[] } }. Map preserva a ordem de inserção: a chave
// mais antiga (a menos recentemente marcada) é a primeira a sair quando passa do teto.
function readCache(root) {
  const keys = new Map();
  if (!runtimeUsable(root)) return keys;
  // FIFO, symlink, device ou arquivo grande: vale como vazio (não trava, não segue link).
  const raw = readRegularFileSafe(preEditCachePath(root), MAX_CACHE_BYTES);
  if (raw === null) return keys;
  try {
    const c = JSON.parse(raw);
    if (c && typeof c.keys === "object" && c.keys !== null && !Array.isArray(c.keys)) {
      for (const [k, v] of Object.entries(c.keys)) {
        if (Array.isArray(v)) keys.set(k, v.filter((x) => typeof x === "string"));
      }
    }
  } catch { /* ausente, corrompido ou formato antigo: vale como vazio */ }
  return keys;
}

// Sem session_id (chave vazia ou ":agente") não há cache: a chave seria compartilhada por
// toda execução sem sessão e silenciaria as normas de quem não as recebeu.
export function hasSession(sessionKey) {
  const k = String(sessionKey ?? "");
  const i = k.indexOf(":");
  return (i < 0 ? k : k.slice(0, i)).length > 0;
}

export function markInjected(projectRoot, sessionKey, ids) {
  if (!hasSession(sessionKey)) return;
  const root = resolveRoot(projectRoot);
  const list = (ids || []).filter((x) => typeof x === "string" && x);
  if (list.length === 0 || !runtimeUsable(root, { create: true })) return;
  const keys = readCache(root);
  const key = String(sessionKey ?? "");
  const prev = keys.get(key) || [];
  keys.delete(key);
  keys.set(key, [...new Set([...prev, ...list])]);
  while (keys.size > MAX_CACHE_KEYS) keys.delete(keys.keys().next().value);
  // Escrita atômica: o rename troca a entrada do diretório (inclusive um symlink plantado
  // no lugar do arquivo) em vez de escrever através dela.
  const target = preEditCachePath(root);
  const tmp = `${target}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  try {
    writeFileSync(tmp, JSON.stringify({ keys: Object.fromEntries(keys) }), { flag: "wx" });
    renameSync(tmp, target);
  } catch {
    rmSync(tmp, { force: true });
  }
}

export function clearPreEditCache(projectRoot) {
  const root = resolveRoot(projectRoot);
  if (runtimeUsable(root)) rmSync(preEditCachePath(root), { force: true });
}

const stdId = (id) => `std:${encodeURIComponent(id)}`;
const knId = (name) => `kn:${encodeURIComponent(name)}`;

export function buildPreEditContext({ projectRoot, filePath, sessionKey = "", maxChars = 9000, digestChars = 6000 }) {
  const empty = { text: "", ids: [] };
  if (!projectRoot || !filePath) return empty;
  const root = resolveRoot(projectRoot);
  // Sem .context não há projeto DevFlow: nada de normas (nem cache a gravar).
  if (!isRealDir(join(root, ".context"))) return empty;
  const abs = isAbsolute(String(filePath)) ? String(filePath) : resolve(root, String(filePath));
  const rel = toRelPosix(root, abs);
  if (!rel) return empty;

  const seen = new Set(hasSession(sessionKey) ? readCache(root).get(String(sessionKey)) || [] : []);
  const limit = Math.max(0, maxChars);
  const digestLimit = Math.min(digestChars, limit - FOOTER_ROOM);
  const bodyLimit = limit - FOOTER_ROOM;
  const ids = [];
  let out = "";
  let deferred = 0;
  // `.length` de string JS é em unidades UTF-16; blocos entram inteiros (nenhum corte parte
  // par substituto).
  const add = (block, budget) => {
    if (out.length + block.length > budget) return false;
    out += block;
    return true;
  };

  // 1. Resumos de std, do nível mais alto para o mais baixo.
  const stds = applicableStandards(root, rel, loadEffectiveStandards(root))
    .filter((s) => s && s.id && !seen.has(stdId(s.id)))
    .sort((a, b) => (RANK[maxLevel(b)] - RANK[maxLevel(a)]) || String(a.id).localeCompare(String(b.id)));
  const overflow = [];
  for (const s of stds) {
    const head = `## ${safeName(s.id)} (${resolveLevel(s, "")})`;
    const where = displayPath(root, s.filePath) || safeName(s.id);
    const { principios, antiPatterns } = extractStandardRules(s.body || "");
    const body = `${principios ? `Princípios:\n${principios}\n` : ""}${antiPatterns ? `Anti-patterns:\n${antiPatterns}\n` : ""}`;
    const full = body ? `${head}\n${frameProjectData(s.id, body, { file: where })}` : null;
    if (full && add(full, digestLimit)) ids.push(stdId(s.id));
    else overflow.push({ s, pointer: `${head} — ${full ? "resumo excede o limite" : "sem resumo"}; leia ${where}\n` });
  }

  // 2. Knowledge on-demand (antes dos ponteiros de std, para não ser espremido por eles).
  let docs = [];
  try { docs = relevantOnDemandKnowledge(root, filePath); } catch { docs = []; }
  for (const k of docs.filter((d) => !seen.has(knId(d.name)))) {
    const name = safeName(k.name);
    const where = displayPath(root, k.file);
    if (add(`## knowledge: ${name}\n${frameProjectData(k.name, k.body, { file: where })}`, bodyLimit) ||
        add(`## knowledge: ${name} — excede o limite; leia ${where}\n`, bodyLimit)) {
      ids.push(knId(k.name));
    } else deferred++;
  }

  // 3. Ponteiros dos stds cujo resumo não coube.
  for (const { s, pointer } of overflow) {
    if (add(pointer, bodyLimit)) ids.push(stdId(s.id));
    else deferred++;
  }

  if (deferred > 0) add(`(+${deferred} norma(s)/knowledge adiado(s) para a próxima edição)\n`, limit);
  return { text: ids.length ? out : "", ids };
}

function main(argv) {
  const [a, b, c, d] = argv;
  if (a === "--clear") { if (b) clearPreEditCache(b); return; }
  if (a === "--mark") { if (b) markInjected(b, c ?? "", String(d || "").split(",").filter(Boolean)); return; }
  if (!a || !b) return;
  const { text, ids } = buildPreEditContext({ projectRoot: a, filePath: b, sessionKey: c ?? "" });
  if (text) process.stdout.write(`${ids.join(",")}\n${text}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(process.argv.slice(2)); } catch { /* hook falha aberto: sem contexto */ }
}
