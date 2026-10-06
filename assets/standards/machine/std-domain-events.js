#!/usr/bin/env node
// assets/standards/machine/std-domain-events.js — linter default bundlado (TCB). SI-4.
// Scanner que balanceia parênteses para capturar o argumento completo da chamada
// publish/emit, mesmo com objetos {} aninhados e multilinha (regex `\{[^}]*\}` falhava no nested).
// Protocolo v2 (ADR-007 v3.1.0): uma linha por ocorrência → VIOLATION <ruleId> <arquivo>:<linha> <msg>
// A linha reportada é a do início da chamada publish(/emit( (m.index), não do fechamento —
// o objeto do payload pode se espalhar por várias linhas. Linha via contador
// incremental O(n+k) (os matches de re.exec vêm em ordem crescente de índice).
//
// A mensagem NÃO inclui trecho do payload: era instável para a impressão digital do
// baseline (mudava a cada edição no código do evento, mesmo sem mudar a NATUREZA da
// violação — sempre "publish sem version"). lineFinder DUPLICADO — ver
// std-api-conventions.js.
import { readFileSync } from "node:fs";
const fp = process.argv[2];
if (!fp || !/\.(ts|tsx)$/.test(fp)) process.exit(0);
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
let hits = 0;
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
  if (/^\s*\{/.test(arg) && !/\bversion\b/.test(arg)) {
    hits++;
    console.log(`VIOLATION domain-events ${fp}:${lineOf(m.index)} evento publicado sem campo 'version'`);
  }
}
process.exitCode = hits > 0 ? 1 : 0;
