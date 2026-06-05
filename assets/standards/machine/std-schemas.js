#!/usr/bin/env node
// assets/standards/machine/std-schemas.js — linter default bundlado (TCB do plugin).
// Regra conservadora: sinaliza z.any() (desliga validação) e .passthrough()
// (aceita campos arbitrários não validados) em schemas.
// Contrato SI-4: filePath em argv[2]; violação → 'VIOLATION: ...' + exit 1.
import { readFileSync } from "node:fs";
const fp = process.argv[2];
if (!fp) process.exit(0);
let c = "";
try { c = readFileSync(fp, "utf-8"); } catch { process.exit(0); }
const hits = c.match(/z\.any\(\)|\.passthrough\(\)/g) || [];
if (hits.length > 0) {
  console.log(`VIOLATION: ${hits.length} uso(s) de z.any()/passthrough em schema em ${fp}. z.any() desliga a validação (use z.unknown() + .refine()); .passthrough() aceita campos arbitrários (declare o shape explícito). Ver std-schemas › Anti-patterns.`);
  process.exit(1);
}
process.exit(0);
