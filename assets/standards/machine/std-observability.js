#!/usr/bin/env node
// assets/standards/machine/std-observability.js — linter default bundlado (TCB do plugin).
// Regra conservadora: sinaliza console.log/debug/info em código de runtime.
// GATE de path: auto-exclui testes (*.test/*.spec) e diretórios scripts/tests/__tests__/__mocks__,
// onde console é exceção legítima — evita falsos-positivos.
// Contrato SI-4: filePath em argv[2]; violação → 'VIOLATION: ...' + exit 1.
import { readFileSync } from "node:fs";
const fp = process.argv[2];
if (!fp) process.exit(0);
if (/\.(test|spec)\.[tj]sx?$|[\\/](scripts|tests?|__tests__|__mocks__)[\\/]/.test(fp)) process.exit(0);
let c = "";
try { c = readFileSync(fp, "utf-8"); } catch { process.exit(0); }
const re = /\bconsole\.(?:log|debug|info)\s*\(/g;
const hits = c.match(re) || [];
if (hits.length > 0) {
  console.log(`VIOLATION: ${hits.length} uso(s) de console.log/debug/info em código de runtime em ${fp}. Use um logger estruturado (logger.info/debug) com serialização JSON. Ver std-observability › Anti-patterns.`);
  process.exit(1);
}
process.exit(0);
