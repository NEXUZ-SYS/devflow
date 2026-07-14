// scripts/lib/verify-ledger.mjs — ledger JSONL append-only do pipeline de sinal.
// Vive em .context/runtime/ (gitignored). Tolerante a linha malformada (D8).
import { appendFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";

const REL = ".context/runtime/verify-ledger.jsonl";

function ledgerPath(root) { return join(root, REL); }

export function appendEntry(root, entry) {
  const p = ledgerPath(root);
  mkdirSync(dirname(p), { recursive: true });
  appendFileSync(p, JSON.stringify(entry) + "\n", "utf8");
}

export function readEntries(root) {
  const p = ledgerPath(root);
  if (!existsSync(p)) return [];
  const out = [];
  for (const line of readFileSync(p, "utf8").split("\n")) {
    if (line.trim() === "") continue;
    try { out.push(JSON.parse(line)); } catch { /* linha malformada: ignora */ }
  }
  return out;
}

export function lastEntry(root, signal) {
  const e = readEntries(root).filter(x => x.signal === signal);
  return e.length ? e[e.length - 1] : null;
}

export function consecutiveReds(root, signal) {
  const e = readEntries(root).filter(x => x.signal === signal);
  let n = 0;
  for (let i = e.length - 1; i >= 0; i--) {
    if (e[i].exit === 0) break;
    n++;
  }
  return n;
}
