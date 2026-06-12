// scripts/lib/adr-pending.mjs
// adr-pending — estado efêmero de "decisões candidatas a ADR" capturadas na
// Execution e varridas no Confirmation. Vive em
// <root>/.context/workflow/.adr-pending.json (envelope { schema, candidates }).
// Efêmero e gitignored. Zero deps.
//
// NOTA de concorrência: read-modify-write não-atômico. Sob dispatch paralelo de
// subagents, dois appends concorrentes podem perder um candidato (last-write-wins,
// degradação graciosa — o git diff do Confirmation é a segunda rede). Aceitável
// para estado best-effort; não usar para dados que não possam ser perdidos.

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

const SCHEMA = 1;

function pendingPath(root) {
  return join(root, '.context', 'workflow', '.adr-pending.json');
}

export function normalizePhrase(s) {
  return String(s ?? '')
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toLowerCase().trim().replace(/\s+/g, ' ');
}

export function readCandidates(root) {
  const fp = pendingPath(root);
  if (!existsSync(fp)) return [];
  try {
    const data = JSON.parse(readFileSync(fp, 'utf-8'));
    if (Array.isArray(data)) return data;                  // legacy schema 0
    return Array.isArray(data.candidates) ? data.candidates : [];
  } catch {
    return [];
  }
}

export function appendCandidate(root, { phrase, phase, relatedAdr = null }) {
  const candidates = readCandidates(root);
  const key = normalizePhrase(phrase);
  if (candidates.some(c => normalizePhrase(c.phrase) === key)) return candidates;
  candidates.push({ phrase, phase, relatedAdr: relatedAdr ?? null });
  const fp = pendingPath(root);
  mkdirSync(dirname(fp), { recursive: true });
  writeFileSync(fp, JSON.stringify({ schema: SCHEMA, candidates }, null, 2) + '\n');
  return candidates;
}

export function clearPending(root) {
  rmSync(pendingPath(root), { force: true });
}
