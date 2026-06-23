// scripts/lib/instinct-observations.mjs
import { appendFile, readFile, writeFile, rename, stat, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { withLock } from './instinct-store.mjs';
import { redact } from './instinct-redact.mjs';
import * as P from './instinct-paths.mjs';

const maxBytes = () => Number(process.env.DEVFLOW_INSTINCT_MAX_BYTES) || 256 * 1024;
export const MAX_BYTES = maxBytes();   // valor default (interface); a checagem usa maxBytes() dinâmico
const ckptFile = (id) => join(P.projectDir(id), '.consumed-offset');

export async function appendObservation(projectId, o) {
  const file = P.observationsFile(projectId);
  const rec = { ts: new Date().toISOString(), tool: o.tool,
    target: redact(String(o.target || '').slice(0, 500)),  // F8: slice ANTES de redact (limita input do regex)
    outcome: o.outcome || 'ok', signal: o.signal };
  const line = JSON.stringify(rec) + '\n';
  await withLock(P.projectDir(projectId), async () => {
    await mkdir(P.projectDir(projectId), { recursive: true });
    await appendFile(file, line);
    let size = 0; try { size = (await stat(file)).size; } catch {}
    if (size > maxBytes()) {
      const lines = (await readFile(file, 'utf-8')).split('\n').filter(Boolean);
      let offset = 0;
      try { offset = Number(await readFile(ckptFile(projectId), 'utf-8')) || 0; } catch {}
      // C4: descarta SÓ linhas já consumidas (nunca não-mineradas); no máximo metade
      const dropCount = Math.min(offset, Math.floor(lines.length / 2));
      const keep = lines.slice(dropCount);
      const tmp = `${file}.tmp`;
      await writeFile(tmp, keep.length ? keep.join('\n') + '\n' : '');
      await rename(tmp, file);
      // checkpoint reposicionado: consumidas-e-mantidas não reprocessam
      await writeFile(ckptFile(projectId), String(offset - dropCount));
    }
  });
}

export async function readUnconsumed(projectId) {
  let offset = 0;
  try { offset = Number(await readFile(ckptFile(projectId), 'utf-8')) || 0; } catch {}
  let lines = [];
  try { lines = (await readFile(P.observationsFile(projectId), 'utf-8')).split('\n').filter(Boolean); } catch {}
  const fresh = lines.slice(offset);
  return { observations: fresh.map((l) => JSON.parse(l)), offset: lines.length };
}

export async function setCheckpoint(projectId, offset) {
  await mkdir(P.projectDir(projectId), { recursive: true });
  await writeFile(ckptFile(projectId), String(offset));
}
