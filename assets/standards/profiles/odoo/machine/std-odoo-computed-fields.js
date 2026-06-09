#!/usr/bin/env node
// assets/standards/profiles/odoo/machine/std-odoo-computed-fields.js — linter default
// bundlado do perfil Odoo (TCB do plugin). Disciplina de computed fields:
// @api.depends ausente, ausência de 'for record in self' e write() dentro do compute.
// Contrato SI-4: filePath em argv[2]; violação → 'VIOLATION: ...' + exit 1.
import { readFileSync } from "node:fs";
const fp = process.argv[2];
if (!fp || !fp.endsWith(".py")) process.exit(0);
let c = "";
try { c = readFileSync(fp, "utf-8"); } catch { process.exit(0); }

const lines = c.split(/\r?\n/);
const v = [];

// indentação (em colunas) de uma linha; -1 para linha vazia/só-espaços.
function indentOf(line) {
  if (!line.trim()) return -1;
  const m = line.match(/^[ \t]*/);
  return m ? m[0].length : 0;
}

// localizar cada `def _compute_<x>(self...):`
for (let i = 0; i < lines.length; i++) {
  const defMatch = lines[i].match(/^(\s*)def\s+(_compute_\w+)\s*\(\s*self\b/);
  if (!defMatch) continue;
  const defIndent = defMatch[1].length;
  const method = defMatch[2];

  // --- Check 1: @api.depends nas linhas NÃO-vazias imediatamente ACIMA ---
  // varre para cima pulando linhas vazias; coleta as linhas de decorator (@...)
  // contíguas ao def. Para no primeiro não-decorator / não-vazio.
  let hasDepends = false;
  for (let j = i - 1; j >= 0; j--) {
    const t = lines[j].trim();
    if (t === "") continue;
    if (t.startsWith("@")) {
      if (/^@api\.depends\b/.test(t)) hasDepends = true;
      continue; // pode haver múltiplos decorators (ex.: @api.depends_context)
    }
    break; // primeira linha não-vazia e não-decorator: fim da pilha de decorators
  }
  if (!hasDepends) {
    v.push(`${method}: compute sem @api.depends`);
  }

  // --- corpo do método: da linha seguinte até o próximo def no mesmo nível ---
  // (ou indentação <= defIndent em linha não-vazia, ou fim do arquivo).
  let bodyEnd = lines.length;
  for (let k = i + 1; k < lines.length; k++) {
    const ind = indentOf(lines[k]);
    if (ind === -1) continue; // linha vazia não fecha o bloco
    if (ind <= defIndent) { bodyEnd = k; break; }
  }
  const body = lines.slice(i + 1, bodyEnd);

  // --- Check 2: atribuição a campo SEM 'for ... in self' ---
  const hasAssign = body.some((l) =>
    /^\s*(self|record|rec)\s*\.\s*\w+\s*=(?!=)/.test(l),
  );
  const hasForSelf = body.some((l) => /\bfor\b.*\bin\s+self\b/.test(l));
  if (hasAssign && !hasForSelf) {
    v.push(`${method}: compute sem 'for record in self'`);
  }

  // --- Check 3: write() dentro do compute ---
  const hasWrite = body.some((l) => /\.write\s*\(/.test(l));
  if (hasWrite) {
    v.push(`${method}: write() dentro de compute`);
  }
}

if (v.length > 0) {
  console.log(
    `VIOLATION: ${v.length} problema(s) em computed fields (${v.join("; ")}) em ${fp}. Ver std-odoo-computed-fields › Anti-patterns.`,
  );
  process.exit(1);
}
process.exit(0);
