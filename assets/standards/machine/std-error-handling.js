#!/usr/bin/env node
// assets/standards/machine/std-error-handling.js — linter default bundlado (TCB do plugin).
// Regra conservadora: sinaliza catch vazio (engole o erro silenciosamente).
// Protocolo v2 (ADR-007 v3.1.0): uma linha por ocorrência → VIOLATION <ruleId> <arquivo>:<linha> <msg>
import { readFileSync } from "node:fs";
const fp = process.argv[2];
if (!fp) process.exit(0);
let c = "";
try { c = readFileSync(fp, "utf-8"); } catch { process.exit(0); }
// catch {} ou catch (e) {} — bloco vazio, inclusive com o fechamento em outra linha
// (catch (e) {\n}). Quantificadores de whitespace LIMITADOS ({0,6}) de propósito:
// dois \s* ilimitados sobrepostos causam ReDoS O(n²) num arquivo com longo run de
// whitespace (linter roda em todo edit). Limites mantêm o match linear e cobrem
// qualquer formatação real de catch vazio.
// Regra adicional: catch cujo corpo é APENAS console.log/error (engole o erro,
// só faz ruído sem tratar/relançar). Quantificadores delimitados por )/}/[^)] para
// manter o match linear (ReDoS-safe) — mesma disciplina do empty-catch acima.
//
// Varredura sobre o CONTEÚDO INTEIRO (não linha a linha): o padrão casa entre
// linhas (catch com chaves em linhas distintas) — quebrar por linha perderia
// essas ocorrências. Linha via contador incremental O(n+k) — não
// `c.slice(0, idx).split("\n")` por ocorrência (O(n·k): explode com milhares de
// catches vazios no mesmo arquivo). Requer os hits ORDENADOS por índice antes de
// consultar lineFinder (ele só aceita índices não-decrescentes).
function lineFinder(content) {
  let pos = 0, line = 1;
  return (index) => { while (pos < index) { if (content.charCodeAt(pos) === 10) line++; pos++; } return line; };
}
const lineOf = lineFinder(c);
const patterns = [
  { re: /catch[\s]{0,6}(?:\([^)]*\)[\s]{0,6})?\{[\s]{0,6}\}/g, label: "catch vazio" },
  { re: /catch\s*\([^)]*\)\s*\{\s*console\.(?:log|error)\([^)]*\)\s*;?\s*\}/g, label: "catch que só faz console.log/error" },
];
const hits = [];
for (const { re, label } of patterns) {
  for (const m of c.matchAll(re)) hits.push({ index: m.index, label });
}
hits.sort((a, b) => a.index - b.index);
// process.exitCode, não process.exit(): em pipe, console.log é assíncrono e
// exit() força saída antes da fila de escrita drenar, truncando achados — ver
// std-api-conventions.js. O ramo hits.length===0 nunca escreveu nada, então
// process.exitCode=0 ali é trivialmente seguro.
if (hits.length > 0) {
  for (const h of hits) {
    console.log(`VIOLATION error-handling ${fp}:${lineOf(h.index)} ${h.label}`);
  }
  process.exitCode = 1;
} else {
  process.exitCode = 0;
}
