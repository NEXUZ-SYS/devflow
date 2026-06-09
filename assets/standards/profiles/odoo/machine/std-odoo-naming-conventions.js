#!/usr/bin/env node
// assets/standards/profiles/odoo/machine/std-odoo-naming-conventions.js — linter
// default bundlado do perfil Odoo (TCB do plugin). Nomenclatura de campos e métodos:
// sufixo relacional (_id/_ids) e prefixo de método compute (_compute_).
// Contrato SI-4: filePath em argv[2]; violação → 'VIOLATION: ...' + exit 1.
import { readFileSync } from "node:fs";
const fp = process.argv[2];
if (!fp || !fp.endsWith(".py")) process.exit(0);
let c = "";
try { c = readFileSync(fp, "utf-8"); } catch { process.exit(0); }

const lines = c.split(/\r?\n/);
const v = [];

// Regex de definição de campo: captura o nome à esquerda de "= fields.<Tipo>("
const RE_M2O = /^\s*([a-zA-Z]\w*)\s*=\s*fields\.Many2one\s*\(/;
const RE_X2M = /^\s*([a-zA-Z]\w*)\s*=\s*fields\.(?:One2many|Many2many)\s*\(/;
// Decorator @api.depends(...) e def <nome>(
const RE_DEPENDS = /^\s*@api\.depends\s*\(/;
const RE_DEF = /^\s*def\s+([a-zA-Z]\w*)\s*\(/;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];

  // Check 1 — Many2one sem sufixo _id
  const m2o = line.match(RE_M2O);
  if (m2o && !m2o[1].endsWith("_id")) {
    v.push(`campo Many2one '${m2o[1]}' sem sufixo '_id'`);
    continue;
  }

  // Check 2 — One2many/Many2many sem sufixo _ids
  const x2m = line.match(RE_X2M);
  if (x2m && !x2m[1].endsWith("_ids")) {
    v.push(`campo relacional '${x2m[1]}' sem sufixo '_ids'`);
    continue;
  }

  // Check 3 — @api.depends seguido de def cujo nome não começa com _compute_
  if (RE_DEPENDS.test(line)) {
    // procura o próximo `def` (pulando outros decorators encadeados)
    for (let j = i + 1; j < lines.length; j++) {
      if (/^\s*@/.test(lines[j])) continue; // outro decorator
      const def = lines[j].match(RE_DEF);
      if (def) {
        if (!def[1].startsWith("_compute_")) {
          v.push(`método de compute '${def[1]}' sem prefixo '_compute_'`);
        }
      }
      break; // primeira linha não-decorator decide
    }
  }
}

if (v.length > 0) {
  console.log(`VIOLATION: ${v.length} violação(ões) de nomenclatura Odoo (${v.join("; ")}) em ${fp}. Ver std-odoo-naming-conventions › Anti-patterns.`);
  process.exit(1);
}
process.exit(0);
