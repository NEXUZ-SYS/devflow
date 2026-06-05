#!/usr/bin/env node
// assets/standards/machine/std-performance.js — linter default bundlado (TCB do plugin).
// Sinaliza padrões caros/instáveis: SELECT *, paginação por OFFSET e React key instável.
// Contrato SI-4: filePath em argv[2]; violação → 'VIOLATION: ...' + exit 1.
import { readFileSync } from "node:fs";
const fp = process.argv[2];
if (!fp) process.exit(0);
let c = "";
try { c = readFileSync(fp, "utf-8"); } catch { process.exit(0); }
const hits = c.match(/SELECT\s+\*|\bOFFSET\s+\d+|key=\{\s*(?:Math\.random\(\)|Date\.now\(\))/gi) || [];
if (hits.length > 0) {
  console.log(`VIOLATION: ${hits.length} padrão(ões) de SELECT */OFFSET/key instável em ${fp}. Ver std-performance › Anti-patterns.`);
  process.exit(1);
}
process.exit(0);
