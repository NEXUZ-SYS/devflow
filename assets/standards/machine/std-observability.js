#!/usr/bin/env node
// assets/standards/machine/std-observability.js — linter default bundlado (TCB do plugin).
// Regra conservadora: sinaliza console.log/debug/info em código de runtime.
// GATE de path: auto-exclui testes (*.test/*.spec) e diretórios scripts/tests/__tests__/__mocks__,
// onde console é exceção legítima — evita falsos-positivos. Usa (^|[\\/])(...)[\\/] — não
// [\\/](...)[\\/] — porque o engine chama o linter com caminho RELATIVO ao projeto (ex.:
// "scripts/build.js", sem separador antes de "scripts"); a forma antiga exigia um separador
// antes do segmento e nunca excluía esses caminhos na raiz.
// Protocolo v2 (ADR-007 v3.1.0): uma linha por ocorrência → VIOLATION <ruleId> <arquivo>:<linha> <msg>
//
// Varredura sobre o CONTEÚDO INTEIRO com matchAll (uniformizado com os outros 16 —
// ver std-api-conventions.js). Mensagem CURTA e ESTÁVEL de propósito: um arquivo com
// milhares de console.log (ex.: gerado) não pode estourar o maxBuffer de 1MB do
// linter (D4 trata isso como ERRO, não achado) — o texto corretivo longo fica no
// corpo do std, não repetido em cada ocorrência. Linha via contador incremental
// O(n+k) — nunca `c.slice(0, idx)` por ocorrência (O(n·k), explode com milhares de
// ocorrências). lineFinder/norm DUPLICADOS — ver std-api-conventions.js.
import { readFileSync } from "node:fs";
const fp = process.argv[2];
if (!fp) process.exit(0);
if (/\.(test|spec)\.[tj]sx?$|(^|[\\/])(scripts|tests?|__tests__|__mocks__)[\\/]/.test(fp.replace(/\\/g, "/"))) process.exit(0);
let c = "";
try { c = readFileSync(fp, "utf-8"); } catch { process.exit(0); }

function lineFinder(content) {
  let pos = 0, line = 1;
  return (index) => { while (pos < index) { if (content.charCodeAt(pos) === 10) line++; pos++; } return line; };
}
function norm(s) { return s.replace(/\s+/g, " ").trim(); }

// process.exitCode, não process.exit(): em pipe (como o engine chama via
// execFile), console.log é ASSÍNCRONO — process.exit() força a saída antes da fila
// de escrita drenar e TRUNCA achados. Achado real desta task: com 8000 ocorrências,
// rodando em paralelo ou com o processo pai ocupado, a saída chegava incompleta
// (centenas a milhares de linhas, às vezes 0) mesmo com exit 1 — a catraca contaria
// errado. Sem exit() explícito, o processo só termina depois que o event loop
// drena (todos os console.log já escritos), então a saída nunca é cortada.
const lineOf = lineFinder(c);
const re = /\bconsole\.(?:log|debug|info)\s*\(/g;
let hits = 0;
for (const m of c.matchAll(re)) {
  hits++;
  console.log(`VIOLATION observability ${fp}:${lineOf(m.index)} console.log/debug/info em runtime (${norm(m[0])})`);
}
process.exitCode = hits > 0 ? 1 : 0;
