#!/usr/bin/env node
// assets/standards/machine/std-performance.js — linter default bundlado (TCB do plugin).
// Sinaliza padrões caros/instáveis: SELECT *, paginação por OFFSET e React key instável.
// Protocolo v2 (ADR-007 v3.1.0): uma linha por ocorrência → VIOLATION <ruleId> <arquivo>:<linha> <msg>
//
// Varredura sobre o CONTEÚDO INTEIRO com matchAll (regra-base original, 7b4b744):
// "SELECT\n  *" (SQL formatado em várias linhas) só casa varrendo o conteúdo
// inteiro. Linha via contador incremental O(n+k). Trecho casado normalizado
// (colapsa whitespace/quebras de linha) — protocolo v2 é uma linha por ocorrência.
// lineFinder/norm DUPLICADOS — ver std-api-conventions.js.
import { readFileSync } from "node:fs";
const fp = process.argv[2];
if (!fp) process.exit(0);
let c = "";
try { c = readFileSync(fp, "utf-8"); } catch { process.exit(0); }

function lineFinder(content) {
  let pos = 0, line = 1;
  return (index) => { while (pos < index) { if (content.charCodeAt(pos) === 10) line++; pos++; } return line; };
}
function norm(s) { return s.replace(/\s+/g, " ").trim(); }

// process.exitCode, não process.exit(): em pipe, console.log é assíncrono e
// exit() força saída antes da fila de escrita drenar, truncando achados — ver
// std-api-conventions.js.
const lineOf = lineFinder(c);
const re = /SELECT\s+\*|\bOFFSET\s+\d+|key=\{\s*(?:Math\.random\(\)|Date\.now\(\))/gi;
let hits = 0;
for (const m of c.matchAll(re)) {
  hits++;
  console.log(`VIOLATION performance ${fp}:${lineOf(m.index)} padrão caro/instável (${norm(m[0])})`);
}
process.exitCode = hits > 0 ? 1 : 0;
