#!/usr/bin/env node
// assets/standards/machine/std-test-discipline.js — linter default bundlado (TCB do plugin).
// Regra conservadora: sinaliza it.only/describe.only/test.only e .skip (foco/skip esquecido).
// Contrato SI-4: filePath em argv[2]; violação → 'VIOLATION: ...' + exit 1.
import { readFileSync } from "node:fs";
const fp = process.argv[2];
if (!fp) process.exit(0);
let c = "";
try { c = readFileSync(fp, "utf-8"); } catch { process.exit(0); }
const hits = c.match(/\b(it|describe|test)\.(only|skip)\b/g) || [];
if (hits.length > 0) {
  console.log(`VIOLATION: ${hits.length} it/describe/test .only|.skip em ${fp}. Remova foco/skip antes de commitar. Ver std-test-discipline › Anti-patterns.`);
  process.exit(1);
}
process.exit(0);
