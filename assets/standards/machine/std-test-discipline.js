#!/usr/bin/env node
// assets/standards/machine/std-test-discipline.js — linter default bundlado (TCB do plugin).
// Regra conservadora: sinaliza it.only/describe.only/test.only e .skip (foco/skip esquecido).
// Além de .only/.skip: sleeps arbitrários em teste (waitForTimeout — flaky) e
// asserções triviais sempre-verdes (expect(true).toBe(true) — não testa nada).
// Protocolo v2 (ADR-007 v3.1.0): uma linha por ocorrência → VIOLATION <ruleId> <arquivo>:<linha> <msg>
//
// Varredura sobre o CONTEÚDO INTEIRO com matchAll (regra-base original, 7b4b744):
// "expect(\n  true\n)" (asserção trivial quebrada em linha) só casa varrendo o
// conteúdo inteiro. Linha via contador incremental O(n+k). Trecho casado
// normalizado (colapsa whitespace/quebras de linha). lineFinder/norm DUPLICADOS —
// ver std-api-conventions.js.
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
const re = /\b(it|describe|test)\.(only|skip)\b|\bwaitForTimeout\s*\(|expect\(\s*true\s*\)\.toBe\(\s*true\s*\)/g;
let hits = 0;
for (const m of c.matchAll(re)) {
  hits++;
  console.log(`VIOLATION test-discipline ${fp}:${lineOf(m.index)} anti-padrão de teste (${norm(m[0])})`);
}
process.exitCode = hits > 0 ? 1 : 0;
