#!/usr/bin/env node
// assets/standards/machine/std-typescript-strict.js — linter default bundlado (TCB do plugin).
// Regra conservadora de strictness TS: sinaliza `: any` (anotação de tipo), `enum X {`
// e `export default function`. O `: any` em prosa/comentário não casa (lookahead exige
// terminador de tipo).
// Protocolo v2 (ADR-007 v3.1.0): uma linha por ocorrência → VIOLATION <ruleId> <arquivo>:<linha> <msg>
//
// Varredura sobre o CONTEÚDO INTEIRO com matchAll (regra-base original, 7b4b744,
// flag /gm preservada de propósito): o lookahead final da regra usa `$`, que em
// modo multilinha do V8 trata `\r` como terminador de linha — é o que faz
// "let x: any\r\n" (CRLF) casar. Uma versão sem `/m` ou linha a linha (tentada numa
// rodada anterior) perde esse `$` e some com arquivos CRLF. Linha via contador
// incremental O(n+k). Trecho casado normalizado (colapsa whitespace/quebras de
// linha). lineFinder/norm DUPLICADOS — ver std-api-conventions.js.
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
const re = /:\s*any\b(?=\s*[,;)\]>=}]|$)|\benum\s+\w+\s*\{|\bexport\s+default\s+function\b/gm;
let hits = 0;
for (const m of c.matchAll(re)) {
  hits++;
  console.log(`VIOLATION typescript-strict ${fp}:${lineOf(m.index)} violação de strictness TS (${norm(m[0])})`);
}
process.exitCode = hits > 0 ? 1 : 0;
