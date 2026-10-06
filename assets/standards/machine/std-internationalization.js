#!/usr/bin/env node
// assets/standards/machine/std-internationalization.js — linter default bundlado (TCB).
// Plural só no TERNÁRIO `=== 1 ?` (padrão de plural manual), não em qualquer `=== 1`.
// Moeda exige SÍMBOLO concatenado (não `.toFixed(2)` solto, que é cálculo legítimo).
// Protocolo v2 (ADR-007 v3.1.0): uma linha por ocorrência → VIOLATION <ruleId> <arquivo>:<linha> <msg>
//
// Varredura sobre o CONTEÚDO INTEIRO com matchAll (regra-base original, 7b4b744):
// "count === 1\n  ? ..." (ternário quebrado em linha) só casa varrendo o conteúdo
// inteiro. Linha via contador incremental O(n+k). O trecho casado é NORMALIZADO
// (colapsa whitespace/quebras de linha para 1 espaço) antes de entrar na mensagem —
// sem isso, um match multilinha quebraria o protocolo (uma "linha" de VIOLATION com
// \n literal dentro deixa de ser uma linha). lineFinder/norm DUPLICADOS — ver
// std-api-conventions.js.
import { readFileSync } from "node:fs";
const fp = process.argv[2];
if (!fp || !/\.(tsx|jsx|ts)$/.test(fp)) process.exit(0);
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
const re = /===\s*1\s*\?|["'](?:\$|R\$|€|£)["']\s*\+|\.toLocale(?:String|DateString|TimeString)\(\s*\)|['"]?margin-(?:left|right)['"]?\s*:/g;
let hits = 0;
for (const m of c.matchAll(re)) {
  hits++;
  console.log(`VIOLATION internationalization ${fp}:${lineOf(m.index)} padrão de i18n sem tratamento (${norm(m[0])})`);
}
process.exitCode = hits > 0 ? 1 : 0;
