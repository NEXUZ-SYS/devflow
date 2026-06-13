#!/usr/bin/env node
// assets/standards/machine/std-domain-events.js — linter default bundlado (TCB). SI-4.
// Scanner que balanceia parênteses para capturar o argumento completo da chamada
// publish/emit, mesmo com objetos {} aninhados (regex `\{[^}]*\}` falhava no nested).
import { readFileSync } from "node:fs";
const fp = process.argv[2];
if (!fp || !/\.(ts|tsx)$/.test(fp)) process.exit(0);
let c = "";
try { c = readFileSync(fp, "utf-8"); } catch { process.exit(0); }
const hits = [];
const re = /\b(?:publish|emit)\s*\(/g;
let m;
while ((m = re.exec(c))) {
  let i = re.lastIndex, depth = 1, arg = "";
  for (; i < c.length && depth > 0; i++) {       // balanceia ( ) até fechar a chamada
    const ch = c[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (depth > 0) arg += ch;
  }
  // só considera publicação de EVENTO quando o 1º argumento é objeto literal
  if (/^\s*\{/.test(arg) && !/\bversion\b/.test(arg)) hits.push(arg.slice(0, 40).replace(/\s+/g, " "));
}
if (hits.length > 0) {
  console.log(`VIOLATION: ${hits.length} evento(s) publicado(s) sem campo 'version' em ${fp}. Inclua eventId, version, occurredAt, aggregateId. Ver std-domain-events › Anti-patterns.`);
  process.exit(1);
}
process.exit(0);
