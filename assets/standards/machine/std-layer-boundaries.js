#!/usr/bin/env node
// assets/standards/machine/std-layer-boundaries.js — linter default bundlado (TCB). SI-4.
// Regra conservadora, baseada em RESOLUÇÃO REAL de path (não regex sobre o import):
//   (a) arquivo em /domain importando algo que resolve para /infra;
//   (b) arquivo em features/<A> importando path INTERNO de features/<B≠A> (além do index).
// GATE de path: usa (^|[\\/])src[\\/] — não [\\/]src[\\/] — porque o engine chama o
// linter com caminho RELATIVO ao projeto (ex.: "src/domain/x.ts", sem separador antes
// de "src"); a forma antiga exigia um separador antes de "src" e nunca disparava.
// Protocolo v2 (ADR-007 v3.1.0): uma linha por ocorrência → VIOLATION <ruleId> <arquivo>:<linha> <msg>
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
const fp = process.argv[2];
if (!fp || !/\.(ts|tsx)$/.test(fp) || !/(^|[\\/])src[\\/]/.test(fp.replace(/\\/g, "/"))) process.exit(0);
let c = "";
try { c = readFileSync(fp, "utf-8"); } catch { process.exit(0); }

function lineFinder(content) {
  let pos = 0, line = 1;
  return (index) => { while (pos < index) { if (content.charCodeAt(pos) === 10) line++; pos++; } return line; };
}
function norm(s) { return s.replace(/\s+/g, " ").trim(); }

const norm2 = p => p.replace(/\\/g, "/");
const self = norm2(fp);
const inDomain = /\/domain\//.test(self);
const mySlice = self.match(/\/features\/([^/]+)\//);
// Varredura sobre o CONTEÚDO INTEIRO (não linha a linha): `import { \n a \n } from`
// pode se espalhar por várias linhas — quebrar por linha perderia a ocorrência.
// Linha via contador incremental O(n+k) — matchAll já entrega em ordem crescente
// de índice, então não precisa ordenar antes de consultar lineFinder.
const lineOf = lineFinder(c);
const importRe = /import\s[^;]*?from\s*['"]([^'"]+)['"]/g;
let hits = 0;
for (const m of c.matchAll(importRe)) {
  const spec = m[1];
  if (!spec.startsWith(".")) continue;
  const target = norm2(resolve(dirname(fp), spec));
  let bad = false;
  if (inDomain && /\/infra\//.test(target)) bad = true;
  if (mySlice) {
    const t = target.match(/\/features\/([^/]+)\/(.+)/); // resolve p/ outra slice + sub-path
    if (t && t[1] !== mySlice[1] && !/^index(\.\w+)?$/.test(t[2])) bad = true;
  }
  if (bad) {
    hits++;
    console.log(`VIOLATION layer-boundaries ${fp}:${lineOf(m.index)} import cruzando layer boundaries (${norm(spec)})`);
  }
}
// process.exitCode, não process.exit(): em pipe, console.log é assíncrono e
// exit() força saída antes da fila de escrita drenar, truncando achados — ver
// std-api-conventions.js.
process.exitCode = hits > 0 ? 1 : 0;
