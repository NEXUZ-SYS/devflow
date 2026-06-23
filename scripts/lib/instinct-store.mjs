// scripts/lib/instinct-store.mjs
import { open, unlink, readFile, writeFile, mkdir, readdir, rename } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { statusFor } from './instinct-confidence.mjs';
import { redact } from './instinct-redact.mjs';
import * as P from './instinct-paths.mjs';

const LOCK_EXPIRY_MS = 30000;

// F3: id vira sempre um slug seguro (sem ./, sem traversal) — usado no nome do .md.
// Determinístico: mesmo input → mesmo slug (preserva identidade p/ promoção).
export function safeId(id) {
  const s = String(id || '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
  return s || 'unnamed';
}
// F7: campos bare do frontmatter (não JSON-quoted) nunca podem conter newline/control.
const oneLine = (s) => String(s ?? '').replace(/[\r\n\t]+/g, ' ').trim();

export async function withLock(dir, fn, retries = 5) {
  await mkdir(dir, { recursive: true });
  const lockFile = join(dir, '.lock');
  for (let attempt = 0; attempt < retries; attempt++) {
    let handle;
    try {
      handle = await open(lockFile, 'wx');
      await handle.writeFile(JSON.stringify({ pid: process.pid, ts: Date.now() }));
      try { return await fn(); }
      finally { await handle.close(); await unlink(lockFile).catch(() => {}); }
    } catch (err) {
      if (handle) await handle.close().catch(() => {});
      if (err.code !== 'EEXIST') throw err;
      if (await isLockStale(lockFile)) { await unlink(lockFile).catch(() => {}); continue; }
      await new Promise((r) => setTimeout(r, 50 + Math.random() * 100 * (attempt + 1)));
    }
  }
  throw new Error(`could not acquire lock on ${lockFile}`);
}

async function isLockStale(lockFile) {
  try {
    const { pid, ts } = JSON.parse(await readFile(lockFile, 'utf-8'));
    if (Date.now() - ts > LOCK_EXPIRY_MS) return true;
    try { process.kill(pid, 0); return false; } catch { return true; }
  } catch { return true; }
}

const ser = (i) => `---
id: ${i.id}
trigger: ${JSON.stringify(i.trigger)}
action: ${JSON.stringify(i.action)}
confidence: ${i.confidence}
domain: ${i.domain}
scope: ${i.scope}
project_id: ${i.projectId}
project_name: ${i.projectName}
observations: ${i.observations}
status: ${i.status}
updated: ${i.updated}
---
## Evidência
- Observado ${i.observations}x
`;

function parse(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;                  // I1: arquivo sem frontmatter → caller pula
  const fm = {};
  for (const line of m[1].split('\n')) {
    const k = line.slice(0, line.indexOf(':')).trim();
    let v = line.slice(line.indexOf(':') + 1).trim();
    if (v.startsWith('"')) v = JSON.parse(v);
    fm[k] = v;
  }
  return fm;
}

export async function upsertInstinct(id, meta, delta, opts = {}) {
  id = safeId(id);   // F3: nunca deixa o id virar path traversal no nome do .md
  // C2: lock sobre o diretório-alvo real (global trava o dir global, não projects/undefined)
  const targetDir = meta.scope === 'global' ? P.globalDir() : P.instinctsDir(meta.projectId);
  const lockDir = meta.scope === 'global' ? dirname(P.globalDir()) : P.projectDir(meta.projectId);
  return withLock(lockDir, async () => {
    await mkdir(targetDir, { recursive: true });
    const file = join(targetDir, `${id}.md`);
    let confidence = 0.3, observations = 0;
    try {
      const fm = parse(await readFile(file, 'utf-8'));
      if (fm) { confidence = Number(fm.confidence); observations = Number(fm.observations); }
    } catch {}
    confidence = opts.absoluteConfidence != null
      ? Math.round(Math.min(0.9, opts.absoluteConfidence) * 10) / 10   // promote: confiança agregada
      : Math.round(Math.min(0.9, confidence + delta) * 10) / 10;
    observations += 1;
    const inst = { id,
      trigger: redact(String(meta.trigger || '').slice(0, 500)),   // I4 + F8: cap antes de redigir
      action: redact(String(meta.action || '').slice(0, 500)),     // I4 + F8
      domain: oneLine(meta.domain), scope: oneLine(meta.scope), projectId: oneLine(meta.projectId), projectName: oneLine(meta.projectName), // F7

      observations, confidence, status: statusFor(confidence),
      updated: new Date().toISOString().slice(0, 10) };
    // I2: escrita atômica tmp+rename (igual à rotação e ao rebuildIndex)
    const tmp = `${file}.tmp`;
    await writeFile(tmp, ser(inst));
    await rename(tmp, file);
    await rebuildIndex(meta.projectId, meta.scope);
    return inst;
  });
}

export async function rebuildIndex(projectId, scope) {
  const dir = scope === 'global' ? P.globalDir() : P.instinctsDir(projectId);
  let files = [];
  try { files = (await readdir(dir)).filter((f) => f.endsWith('.md')); } catch {}
  const idx = [];
  for (const f of files) {
    let fm;
    try { fm = parse(await readFile(join(dir, f), 'utf-8')); } catch { fm = null; }
    if (!fm) continue;                  // I1.2: pula .md corrompido em vez de abortar a varredura
    idx.push({ id: fm.id, trigger: fm.trigger, action: fm.action,
      confidence: Number(fm.confidence), status: fm.status });
  }
  const out = P.indexFile(projectId, scope);
  const tmp = `${out}.tmp`;
  await writeFile(tmp, JSON.stringify(idx, null, 2));
  await rename(tmp, out);
}

export async function loadIndex(projectId, scope) {
  try { return JSON.parse(await readFile(P.indexFile(projectId, scope), 'utf-8')); }
  catch { return []; }
}

export async function promoteAcrossProjects(minProjects = 2) {
  const root = join(P.baseDir(), 'projects');
  let projects = []; try { projects = await readdir(root); } catch { return []; }
  const byId = new Map();
  for (const pid of projects) {
    let files = []; try { files = (await readdir(P.instinctsDir(pid))).filter((f) => f.endsWith('.md')); } catch {}
    for (const f of files) {
      let fm; try { fm = parse(await readFile(join(P.instinctsDir(pid), f), 'utf-8')); } catch { fm = null; }
      if (!fm) continue;
      const c = byId.get(fm.id) || { meta: fm, projects: new Set(), confidence: 0 };
      c.projects.add(pid); c.confidence = Math.max(c.confidence, Number(fm.confidence));
      byId.set(fm.id, c);
    }
  }
  const promoted = [];
  for (const [id, c] of byId) {
    if (c.projects.size >= minProjects) {
      await upsertInstinct(id, { trigger: c.meta.trigger, action: c.meta.action, domain: c.meta.domain,
        scope: 'global', projectName: 'global' }, 0, { absoluteConfidence: c.confidence });
      promoted.push(id);
    }
  }
  return promoted;
}

export async function pruneStale(projectId, maxAgeDays = 30) {
  const dir = P.instinctsDir(projectId);
  let files = []; try { files = (await readdir(dir)).filter((f) => f.endsWith('.md')); } catch { return []; }
  const cutoff = Date.now() - maxAgeDays * 86400000;
  const removed = [];
  await withLock(P.projectDir(projectId), async () => {
    for (const f of files) {
      let fm; try { fm = parse(await readFile(join(dir, f), 'utf-8')); } catch { fm = null; }
      if (!fm) continue;
      const old = new Date(fm.updated).getTime() < cutoff;
      if (fm.status === 'pending' && Number(fm.confidence) < 0.3 && old) {
        await unlink(join(dir, f)); removed.push(fm.id);
      }
    }
  });
  await rebuildIndex(projectId, 'project');
  return removed;
}

// Helper de teste: serializa um instinct arbitrário (via ser+tmp+rename) e reindexar.
export async function _writeRaw(projectId, id, fields) {
  id = safeId(id);   // F3
  const dir = P.instinctsDir(projectId);
  await mkdir(dir, { recursive: true });
  const file = join(dir, `${id}.md`);
  const tmp = `${file}.tmp`;
  await writeFile(tmp, ser({ id, ...fields }));
  await rename(tmp, file);
  await rebuildIndex(projectId, 'project');
}

export async function touchRegistry(projectId, { name, remote }) {
  const file = P.projectsRegistry();
  return withLock(P.baseDir(), async () => {
    await mkdir(P.baseDir(), { recursive: true });
    let reg = {}; try { reg = JSON.parse(await readFile(file, 'utf-8')); } catch {}
    reg[projectId] = { name, remote: P.normalizeRemote(remote || ''), last_seen: new Date().toISOString().slice(0, 10) };
    const tmp = `${file}.tmp`;
    await writeFile(tmp, JSON.stringify(reg, null, 2)); await rename(tmp, file);
  });
}
