#!/usr/bin/env node
// assets/standards/machine/std-security.js — linter default bundlado (TCB do plugin).
// Regra conservadora: sinaliza dangerouslySetInnerHTML (vetor XSS clássico em React).
// Regra adicional: template-literal SQL com interpolação `${…}` (vetor de SQL
// injection). Lookbehind `(?<!sql)` poupa a tag segura `sql`…`` (queries
// parametrizadas via tagged template). Strings normais sem `${` (ex.: db.query("…$1…"))
// não casam — exige `${` dentro da crase.
// Protocolo v2 (ADR-007 v3.1.0): uma linha por ocorrência → VIOLATION <ruleId> <arquivo>:<linha> <msg>
// Varredura sobre o CONTEÚDO INTEIRO (não linha a linha): o template SQL pode se
// espalhar por várias linhas — quebrar por linha perderia a ocorrência. Linha via
// contador incremental O(n+k) — hits ORDENADOS por índice antes de consultar
// lineFinder (ele só aceita índices não-decrescentes).
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
const patterns = [
  { re: /dangerouslySetInnerHTML/g, label: "dangerouslySetInnerHTML (XSS)" },
  { re: /(?<!sql)`[^`]*\b(?:SELECT|INSERT|UPDATE|DELETE)\b[^`]*\$\{/gi, label: "SQL string-interpolada" },
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
    console.log(`VIOLATION security ${fp}:${lineOf(h.index)} vetor inseguro (${h.label})`);
  }
  process.exitCode = 1;
} else {
  process.exitCode = 0;
}
