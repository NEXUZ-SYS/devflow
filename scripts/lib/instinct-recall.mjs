// scripts/lib/instinct-recall.mjs
import { loadIndex } from './instinct-store.mjs';
import { RECALL_MIN } from './instinct-confidence.mjs';

// F6: o digest é injetado dentro de <DEVFLOW_CONTEXT> → trigger/action são DADOS,
// nunca instrução. Remove angle-brackets (não reabrem/fecham tags de contexto) e
// achata newlines (não injeta linhas/diretivas no prompt).
const safeField = (s) => String(s ?? '').replace(/[<>]/g, '').replace(/[\r\n]+/g, ' ').trim();

export async function buildDigest(projectId, { maxChars = 2000, minConfidence = RECALL_MIN } = {}) {
  const [proj, glob] = await Promise.all([loadIndex(projectId, 'project'), loadIndex(projectId, 'global')]);
  const rows = [...proj.map((r) => ({ ...r, s: 'projeto' })), ...glob.map((r) => ({ ...r, s: 'global' }))]
    .filter((r) => r.status === 'active' && r.confidence >= minConfidence)
    .sort((a, b) => b.confidence - a.confidence);
  if (!rows.length) return '';
  let out = '## Instincts aprendidos (DevFlow)\n';
  for (const r of rows) {
    const line = `- [${r.s} ${r.confidence}] ${safeField(r.trigger)} → ${safeField(r.action)}\n`;
    if (out.length + line.length > maxChars) break;
    out += line;
  }
  return out;
}
