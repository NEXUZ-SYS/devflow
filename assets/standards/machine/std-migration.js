#!/usr/bin/env node
// assets/standards/machine/std-migration.js — linter default bundlado (TCB do plugin).
// Regras conservadoras de migração de schema: CREATE INDEX sem CONCURRENTLY,
// VACUUM FULL/TRUNCATE e UPDATE sem WHERE.
// Contrato SI-4: filePath em argv[2]; violação → 'VIOLATION: ...' + exit 1.
import { readFileSync } from "node:fs";
const fp = process.argv[2];
if (!fp) process.exit(0);
let c = "";
try { c = readFileSync(fp, "utf-8"); } catch { process.exit(0); }
const v = [];
if (/CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?!CONCURRENTLY)/i.test(c)) v.push("CREATE INDEX sem CONCURRENTLY");
if (/\b(?:VACUUM\s+FULL|TRUNCATE)\b/i.test(c)) v.push("VACUUM FULL/TRUNCATE em migração");
for (const stmt of c.split(";")) { if (/\bUPDATE\s+\w+\s+SET\b/i.test(stmt) && !/\bWHERE\b/i.test(stmt)) { v.push("UPDATE sem WHERE"); break; } }
if (v.length > 0) { console.log(`VIOLATION: ${v.length} risco(s) de migração (${v.join("; ")}) em ${fp}. Ver std-migration › Anti-patterns.`); process.exit(1); }
process.exit(0);
