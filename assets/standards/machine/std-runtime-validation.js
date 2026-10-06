#!/usr/bin/env node
// assets/standards/machine/std-runtime-validation.js — linter default bundlado (TCB do plugin).
// Sinaliza non-null assertion em process.env.X! (env não validada). Poupa !== / != via (?![=]).
// Protocolo v2 (ADR-007 v3.1.0): uma linha por ocorrência → VIOLATION <ruleId> <arquivo>:<linha> <msg>
//
// Varredura sobre o CONTEÚDO INTEIRO com matchAll — uniformizado com os outros 16
// (ver std-api-conventions.js), embora esta regra não tenha `\s` que cruze linha.
// Linha via contador incremental O(n+k). lineFinder/norm DUPLICADOS.
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
const re = /process\.env\.\w+!(?![=])/g;
let hits = 0;
for (const m of c.matchAll(re)) {
  hits++;
  console.log(`VIOLATION runtime-validation ${fp}:${lineOf(m.index)} process.env.X! sem validação (${norm(m[0])})`);
}
process.exitCode = hits > 0 ? 1 : 0;
