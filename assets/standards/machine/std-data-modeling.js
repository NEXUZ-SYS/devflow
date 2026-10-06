#!/usr/bin/env node
// assets/standards/machine/std-data-modeling.js — linter default bundlado (TCB do plugin).
// Regra conservadora: dentro de DDL (CREATE TABLE), sinaliza tipos de coluna problemáticos:
//   - TIMESTAMP sem timezone (use TIMESTAMPTZ / WITH TIME ZONE)
//   - VARCHAR(n) com limite arbitrário (use TEXT)
//   - FLOAT / DOUBLE PRECISION / REAL para valores que exigem exatidão (use NUMERIC)
// GATE: só roda quando há CREATE TABLE — evita falsos-positivos fora de DDL.
// Protocolo v2 (ADR-007 v3.1.0): uma linha por ocorrência → VIOLATION <ruleId> <arquivo>:<linha> <msg>
//
// Varredura sobre o CONTEÚDO INTEIRO com matchAll (regra-base original, 7b4b744):
// "TIMESTAMP\n  WITH TIME ZONE" e "DOUBLE\n  PRECISION" são válidos quebrados em
// linha — uma varredura linha a linha erra os dois (falso-positivo no 1º, falso-
// negativo no 2º). Linha via contador incremental O(n+k).
//
// O token embutido na mensagem é NORMALIZADO (maiúsculas + espaço único) para a
// impressão digital do baseline não mudar por causa de indentação/quebra de linha
// incidental — "DOUBLE\n    PRECISION" e "double  precision" viram "DOUBLE PRECISION".
//
// lineFinder/norm DUPLICADOS em cada um dos 17 — ver std-api-conventions.js (mesmo
// motivo: materialização copia machine/<id>.js peça a peça).
import { readFileSync } from "node:fs";
const fp = process.argv[2];
if (!fp) process.exit(0);
let c = "";
try { c = readFileSync(fp, "utf-8"); } catch { process.exit(0); }
if (!/CREATE\s+TABLE/i.test(c)) process.exit(0);

function lineFinder(content) {
  let pos = 0, line = 1;
  return (index) => { while (pos < index) { if (content.charCodeAt(pos) === 10) line++; pos++; } return line; };
}
function normToken(s) { return s.replace(/\s+/g, " ").trim().toUpperCase(); }

// process.exitCode, não process.exit(): em pipe, console.log é assíncrono e
// exit() força saída antes da fila de escrita drenar, truncando achados — ver
// std-api-conventions.js.
const lineOf = lineFinder(c);
const re = /\bTIMESTAMP\b(?!\s*TZ)(?!\s+WITH\s+TIME\s+ZONE)|\bVARCHAR\s*\(\s*\d+\s*\)|\b(?:FLOAT|DOUBLE\s+PRECISION|REAL)\b/gi;
let hits = 0;
for (const m of c.matchAll(re)) {
  hits++;
  console.log(`VIOLATION data-modeling ${fp}:${lineOf(m.index)} tipo de coluna problemático (${normToken(m[0])})`);
}
process.exitCode = hits > 0 ? 1 : 0;
