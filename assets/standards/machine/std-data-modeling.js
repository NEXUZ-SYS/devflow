#!/usr/bin/env node
// assets/standards/machine/std-data-modeling.js — linter default bundlado (TCB do plugin).
// Regra conservadora: dentro de DDL (CREATE TABLE), sinaliza tipos de coluna problemáticos:
//   - TIMESTAMP sem timezone (use TIMESTAMPTZ / WITH TIME ZONE)
//   - VARCHAR(n) com limite arbitrário (use TEXT)
//   - FLOAT / DOUBLE PRECISION / REAL para valores que exigem exatidão (use NUMERIC)
// GATE: só roda quando há CREATE TABLE — evita falsos-positivos fora de DDL.
// Contrato SI-4: filePath em argv[2]; violação → 'VIOLATION: ...' + exit 1.
import { readFileSync } from "node:fs";
const fp = process.argv[2];
if (!fp) process.exit(0);
let c = "";
try { c = readFileSync(fp, "utf-8"); } catch { process.exit(0); }
if (!/CREATE\s+TABLE/i.test(c)) process.exit(0);
const re = /\bTIMESTAMP\b(?!\s*TZ)(?!\s+WITH\s+TIME\s+ZONE)|\bVARCHAR\s*\(\s*\d+\s*\)|\b(?:FLOAT|DOUBLE\s+PRECISION|REAL)\b/gi;
const hits = c.match(re) || [];
if (hits.length > 0) {
  console.log(`VIOLATION: ${hits.length} tipo(s) de coluna problemático(s) em ${fp} (${[...new Set(hits)].join(", ")}). Use TIMESTAMPTZ (em vez de TIMESTAMP sem tz), TEXT (em vez de VARCHAR(n)) e NUMERIC (em vez de FLOAT/DOUBLE/REAL). Ver std-data-modeling › Anti-patterns.`);
  process.exit(1);
}
process.exit(0);
