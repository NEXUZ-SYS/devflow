#!/usr/bin/env node
// assets/standards/profiles/odoo/machine/std-odoo-orm-performance.js — linter default
// bundlado do perfil Odoo (TCB do plugin). Disciplina de performance do ORM:
// detecta chamada ORM que dispara SQL (.search/.search_count/.read_group/
// ._read_group/.browse) DENTRO do corpo de um `for ... in ...:` — padrão N+1.
// Delimita o corpo do for por indentação; chamada FORA do for NÃO é flagada.
// Contrato SI-4: filePath em argv[2]; violação → 'VIOLATION: ...' + exit 1.
import { readFileSync } from "node:fs";
const fp = process.argv[2];
if (!fp || !fp.endsWith(".py")) process.exit(0);
let c = "";
try {
  c = readFileSync(fp, "utf-8");
} catch {
  process.exit(0);
}

const lines = c.split(/\r?\n/);
const v = new Set();

// indentação (em colunas) de uma linha; -1 para linha vazia/só-espaços.
function indentOf(line) {
  if (!line.trim()) return -1;
  const m = line.match(/^[ \t]*/);
  return m ? m[0].length : 0;
}

// métodos ORM que disparam SQL e são caros dentro de loop (N+1).
// ordem importa: ._read_group antes de .read_group para casar o mais específico.
const ORM_CALLS = [
  "._read_group(",
  ".read_group(",
  ".search_count(",
  ".search(",
  ".browse(",
];

// detecta qual método ORM (se algum) aparece numa linha.
function ormCallIn(line) {
  for (const call of ORM_CALLS) {
    if (line.includes(call)) return call.replace(/^\.|\($/g, "");
  }
  return null;
}

// localizar cada cabeçalho `for <x> in <y>:`
for (let i = 0; i < lines.length; i++) {
  const forMatch = lines[i].match(/^(\s*)for\b.*\bin\b.*:\s*(#.*)?$/);
  if (!forMatch) continue;
  const forIndent = forMatch[1].length;

  // corpo do for: da linha seguinte até o primeiro dedent <= forIndent
  // (linha não-vazia). Linhas vazias não fecham o bloco.
  for (let k = i + 1; k < lines.length; k++) {
    const ind = indentOf(lines[k]);
    if (ind === -1) continue;
    if (ind <= forIndent) break; // dedent: fim do corpo do for
    const method = ormCallIn(lines[k]);
    if (method) {
      v.add(`chamada ORM (${method}) dentro de loop (N+1) — faça em lote fora do loop`);
    }
  }
}

const arr = [...v];
if (arr.length) {
  console.log(
    `VIOLATION: ${arr.length} risco(s) de performance ORM (${arr.join("; ")}) em ${fp}. Ver std-odoo-orm-performance › Anti-patterns.`,
  );
  process.exit(1);
}
process.exit(0);
