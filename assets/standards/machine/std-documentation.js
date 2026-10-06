#!/usr/bin/env node
// assets/standards/machine/std-documentation.js — linter default bundlado (TCB). SI-4.
// Cobre comentário C (//, /* */) E hash (#, Python/Go-build/shell), coerente com
// applyTo {ts,tsx,js,jsx,py,go}. Marcador de issue = #123 | URL | issues/.
// Protocolo v2 (ADR-007 v3.1.0): uma linha por ocorrência → VIOLATION <ruleId> <arquivo>:<linha> <msg>
//
// Varredura sobre o CONTEÚDO INTEIRO com matchAll (regra-base original, 7b4b744):
// "/*\n  TODO" (marcador de bloco e a palavra em linhas distintas) só casa varrendo
// o conteúdo inteiro — linha a linha perde a ocorrência. Linha via contador
// incremental O(n+k). lineFinder DUPLICADO — ver std-api-conventions.js.
import { readFileSync } from "node:fs";
const fp = process.argv[2];
if (!fp || !/\.(ts|tsx|js|jsx|py|go)$/.test(fp)) process.exit(0);
let c = "";
try { c = readFileSync(fp, "utf-8"); } catch { process.exit(0); }

function lineFinder(content) {
  let pos = 0, line = 1;
  return (index) => { while (pos < index) { if (content.charCodeAt(pos) === 10) line++; pos++; } return line; };
}

// process.exitCode, não process.exit(): em pipe, console.log é assíncrono e
// exit() força saída antes da fila de escrita drenar, truncando achados — ver
// std-api-conventions.js.
const lineOf = lineFinder(c);
const re = /(?:\/\/|#|\/?\*)\s*(?:TODO|FIXME|HACK)\b(?![^\n]*(?:#\d+|https?:\/\/|issues\/))/g;
let hits = 0;
for (const m of c.matchAll(re)) {
  hits++;
  console.log(`VIOLATION documentation ${fp}:${lineOf(m.index)} TODO/FIXME/HACK sem issue/dono`);
}
process.exitCode = hits > 0 ? 1 : 0;
