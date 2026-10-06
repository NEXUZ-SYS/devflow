#!/usr/bin/env node
// assets/standards/machine/std-api-conventions.js — linter default bundlado (TCB do plugin).
// Nudge: verbo embutido no path REST (ex.: /v1/createOrder). REST usa substantivo + método HTTP.
// Protocolo v2 (ADR-007 v3.1.0): uma linha por ocorrência → VIOLATION <ruleId> <arquivo>:<linha> <msg>
//
// Varredura sobre o CONTEÚDO INTEIRO com matchAll (não linha a linha): o molde
// "linha a linha" (tentado numa rodada anterior) perde ocorrências sempre que a
// regex-base tem `\s` que casa `\n` — ficaria inconsistente entre os 17 linters.
// Uniformizado: todos usam a regex-base original (commit 7b4b744) + matchAll + linha
// derivada por contador incremental O(n+k) (nunca `c.slice(0, idx)` por ocorrência,
// que é O(n·k) e explode com muitas ocorrências).
//
// lineFinder/norm são DUPLICADOS em cada um dos 17 (não importados de um módulo
// compartilhado): a materialização em projetos copia machine/<id>.js peça a peça
// (scripts/lib/standards-materialize.mjs, retargeta 1 arquivo por std) — um helper
// compartilhado não seria copiado e quebraria o linter já em produção no projeto.
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

// process.exitCode (não process.exit()): em stdout PIPE (como o engine chama via
// execFile), console.log é ASSÍNCRONO — process.exit() força a saída antes da fila
// de escrita drenar e TRUNCA achados (achado real: rodando em paralelo/com o pai
// ocupado, a saída chegava incompleta mesmo com exit 1). Sem exit() explícito, o
// processo só termina depois que o event loop drena (todos os console.log já
// escritos), daí a saída nunca é cortada.
const lineOf = lineFinder(c);
const re = /["'`]\/(?:v\d+\/)?(?:[\w-]+\/)*(?:get|create|update|delete|fetch|make|do|set)[A-Z]\w*/g;
let hits = 0;
for (const m of c.matchAll(re)) {
  hits++;
  console.log(`VIOLATION api-conventions ${fp}:${lineOf(m.index)} verbo no path REST (${norm(m[0])})`);
}
process.exitCode = hits > 0 ? 1 : 0;
