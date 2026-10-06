#!/usr/bin/env node
// assets/standards/machine/std-migration.js — linter default bundlado (TCB do plugin).
// Regras conservadoras de migração de schema: CREATE INDEX sem CONCURRENTLY,
// VACUUM FULL/TRUNCATE e UPDATE sem WHERE.
// Protocolo v2 (ADR-007 v3.1.0): uma linha por ocorrência → VIOLATION <ruleId> <arquivo>:<linha> <msg>
// UPDATE ... SET pode se espalhar por várias linhas — a varredura usa o statement
// inteiro (não linha a linha) e deriva a linha do índice do match dentro dele.
// Linha via contador incremental O(n+k) — os hits são ordenados por índice antes de
// consultar lineFinder (ele só aceita índices não-decrescentes).
import { readFileSync } from "node:fs";
const fp = process.argv[2];
if (!fp) process.exit(0);
let c = "";
try { c = readFileSync(fp, "utf-8"); } catch { process.exit(0); }

function lineFinder(content) {
  let pos = 0, line = 1;
  return (index) => { while (pos < index) { if (content.charCodeAt(pos) === 10) line++; pos++; } return line; };
}
const lineOf = lineFinder(c);

const hits = [];
for (const m of c.matchAll(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?!CONCURRENTLY)/gi)) {
  hits.push({ index: m.index, label: "CREATE INDEX sem CONCURRENTLY" });
}
for (const m of c.matchAll(/\b(?:VACUUM\s+FULL|TRUNCATE)\b/gi)) {
  hits.push({ index: m.index, label: "VACUUM FULL/TRUNCATE em migração" });
}
{
  let offset = 0;
  for (const stmt of c.split(";")) {
    if (/\bUPDATE\s+\w+\s+SET\b/i.test(stmt) && !/\bWHERE\b/i.test(stmt)) {
      const rel = stmt.match(/\bUPDATE\s+\w+\s+SET\b/i);
      hits.push({ index: offset + (rel ? rel.index : 0), label: "UPDATE sem WHERE" });
    }
    offset += stmt.length + 1; // +1 pelo ';' removido no split
  }
}
hits.sort((a, b) => a.index - b.index);
// process.exitCode, não process.exit(): em pipe, console.log é assíncrono e
// exit() força saída antes da fila de escrita drenar, truncando achados — ver
// std-api-conventions.js. O ramo hits.length===0 nunca escreveu nada, então
// process.exitCode=0 ali é trivialmente seguro.
if (hits.length > 0) {
  for (const h of hits) {
    console.log(`VIOLATION migration ${fp}:${lineOf(h.index)} risco de migração (${h.label})`);
  }
  process.exitCode = 1;
} else {
  process.exitCode = 0;
}
