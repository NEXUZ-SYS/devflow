#!/usr/bin/env node
// assets/standards/machine/std-naming-conventions.js — linter default bundlado (TCB do plugin).
// Sinaliza enum TS (prefira union types) e booleanos com negativa embutida (isNot/isn't).
// Contrato SI-4: filePath em argv[2]; violação → 'VIOLATION: ...' + exit 1.
import { readFileSync } from "node:fs";
const fp = process.argv[2];
if (!fp) process.exit(0);
let c = "";
try { c = readFileSync(fp, "utf-8"); } catch { process.exit(0); }
const hits = c.match(/\benum\s+\w+\s*\{|\bis(?:Not|n['’]t)[A-Z]\w*/g) || [];
if (hits.length > 0) {
  console.log(`VIOLATION: ${hits.length} caso(s) de naming (enum TS / boolean negativo) em ${fp}. Ver std-naming-conventions › Anti-patterns.`);
  process.exit(1);
}
process.exit(0);
