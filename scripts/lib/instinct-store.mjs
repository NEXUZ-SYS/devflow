// scripts/lib/instinct-store.mjs
import { open, unlink, readFile, writeFile, mkdir, readdir, rename } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { statusFor } from './instinct-confidence.mjs';
import { redact } from './instinct-redact.mjs';
import * as P from './instinct-paths.mjs';

const LOCK_EXPIRY_MS = 30000;

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
      trigger: redact(String(meta.trigger || '')),   // I4: instinct vai pro digest/recall → redigir
      action: redact(String(meta.action || '')),     // I4
      domain: meta.domain, scope: meta.scope, projectId: meta.projectId, projectName: meta.projectName,
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
