#!/usr/bin/env node
// assets/standards/machine/std-typescript-strict.js — linter default bundlado (TCB do plugin).
// Regra conservadora de strictness TS: sinaliza `: any` (anotação de tipo), `enum X {`
// e `export default function`. O `: any` em prosa/comentário não casa (lookahead exige
// terminador de tipo). Contrato SI-4: filePath em argv[2]; violação → 'VIOLATION: ...' + exit 1.
import { readFileSync } from "node:fs";
const fp = process.argv[2];
if (!fp) process.exit(0);
let c = "";
try { c = readFileSync(fp, "utf-8"); } catch { process.exit(0); }
const re = /:\s*any\b(?=\s*[,;)\]>=}]|$)|\benum\s+\w+\s*\{|\bexport\s+default\s+function\b/gm;
const hits = c.match(re) || [];
if (hits.length > 0) {
  console.log(`VIOLATION: ${hits.length} violação(ões) de strictness TS (any/enum/default export) em ${fp}. Ver std-typescript-strict › Anti-patterns.`);
  process.exit(1);
}
process.exit(0);
