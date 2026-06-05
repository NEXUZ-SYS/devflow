#!/usr/bin/env node
// assets/standards/machine/std-runtime-validation.js — linter default bundlado (TCB do plugin).
// Sinaliza non-null assertion em process.env.X! (env não validada). Poupa !== / != via (?![=]).
// Contrato SI-4: filePath em argv[2]; violação → 'VIOLATION: ...' + exit 1.
import { readFileSync } from "node:fs";
const fp = process.argv[2];
if (!fp) process.exit(0);
let c = "";
try { c = readFileSync(fp, "utf-8"); } catch { process.exit(0); }
const hits = c.match(/process\.env\.\w+!(?![=])/g) || [];
if (hits.length > 0) {
  console.log(`VIOLATION: ${hits.length} uso(s) de process.env.X! (non-null assertion) sem validação em ${fp}. Ver std-runtime-validation › Anti-patterns.`);
  process.exit(1);
}
process.exit(0);
