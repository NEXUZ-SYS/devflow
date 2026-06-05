#!/usr/bin/env node
// assets/standards/machine/std-test-discipline.js — linter default bundlado (TCB do plugin).
// Regra conservadora: sinaliza it.only/describe.only/test.only e .skip (foco/skip esquecido).
// Contrato SI-4: filePath em argv[2]; violação → 'VIOLATION: ...' + exit 1.
import { readFileSync } from "node:fs";
const fp = process.argv[2];
if (!fp) process.exit(0);
let c = "";
try { c = readFileSync(fp, "utf-8"); } catch { process.exit(0); }
// Além de .only/.skip: sleeps arbitrários em teste (waitForTimeout — flaky) e
// asserções triviais sempre-verdes (expect(true).toBe(true) — não testa nada).
const hits = c.match(/\b(it|describe|test)\.(only|skip)\b|\bwaitForTimeout\s*\(|expect\(\s*true\s*\)\.toBe\(\s*true\s*\)/g) || [];
if (hits.length > 0) {
  console.log(`VIOLATION: ${hits.length} anti-padrão(ões) de teste em ${fp} (.only/.skip, waitForTimeout, ou assert trivial expect(true).toBe(true)). Remova foco/skip, troque sleep por wait determinístico, asserte comportamento real. Ver std-test-discipline › Anti-patterns.`);
  process.exit(1);
}
process.exit(0);
