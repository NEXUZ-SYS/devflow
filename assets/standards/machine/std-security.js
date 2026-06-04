#!/usr/bin/env node
// assets/standards/machine/std-security.js — linter default bundlado (TCB do plugin).
// Regra conservadora: sinaliza dangerouslySetInnerHTML (vetor XSS clássico em React).
// Contrato SI-4: filePath em argv[2]; violação → 'VIOLATION: ...' + exit 1.
import { readFileSync } from "node:fs";
const fp = process.argv[2];
if (!fp) process.exit(0);
let c = "";
try { c = readFileSync(fp, "utf-8"); } catch { process.exit(0); }
const hits = c.match(/dangerouslySetInnerHTML/g) || [];
if (hits.length > 0) {
  console.log(`VIOLATION: ${hits.length} uso(s) de dangerouslySetInnerHTML em ${fp}. Sanitize (DOMPurify) ou renderize como texto. Ver std-security › Anti-patterns.`);
  process.exit(1);
}
process.exit(0);
