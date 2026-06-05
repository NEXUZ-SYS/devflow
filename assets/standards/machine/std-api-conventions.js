#!/usr/bin/env node
// assets/standards/machine/std-api-conventions.js — linter default bundlado (TCB do plugin).
// Nudge: verbo embutido no path REST (ex.: /v1/createOrder). REST usa substantivo + método HTTP.
// Contrato SI-4: filePath em argv[2]; violação → 'VIOLATION: ...' + exit 1.
import { readFileSync } from "node:fs";
const fp = process.argv[2];
if (!fp) process.exit(0);
let c = "";
try { c = readFileSync(fp, "utf-8"); } catch { process.exit(0); }
const hits = c.match(/["'`]\/(?:v\d+\/)?(?:[\w-]+\/)*(?:get|create|update|delete|fetch|make|do|set)[A-Z]\w*/g) || [];
if (hits.length > 0) {
  console.log(`VIOLATION: ${hits.length} verbo(s) no path REST (nudge) em ${fp}. Ver std-api-conventions › Anti-patterns.`);
  process.exit(1);
}
process.exit(0);
