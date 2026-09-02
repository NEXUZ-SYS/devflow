#!/usr/bin/env node
// assets/standards/profiles/odoo/machine/std-odoo-api-removed-17.js
//
// Símbolos da API Python removidos/renomeados na série 17.
// Contrato SI-4: filePath em argv[2]; violação → 'VIOLATION: ...' + exit 1.
//
// NÃO resolve versão: quem decide se este linter roda é a FAIXA declarada no
// frontmatter (appliesFrom: "17") avaliada por findApplicableStandards. Um
// linter que resolve a própria série foi o defeito que originou esta mudança —
// quatro cópias de odooTargetSeries divergiram sem ninguém notar.
import { readFileSync } from "node:fs";

const fp = process.argv[2];
if (!fp || !fp.endsWith(".py")) process.exit(0);

let c = "";
try {
  c = readFileSync(fp, "utf-8");
} catch {
  process.exit(0);
}

const found = new Set();

// .search(..., count=True) → usar search_count()
if (/\.search\s*\([^)]*\bcount\s*=\s*True\b/.test(c))
  found.add(".search(count=True) → use search_count()");
// def name_get( → removido no 17+, usar _compute_display_name
if (/\bdef\s+name_get\s*\(/.test(c))
  found.add("def name_get() → removido no 17+, use _compute_display_name");
// .invalidate_cache( → usar invalidate_recordset()
if (/\.invalidate_cache\s*\(/.test(c))
  found.add(".invalidate_cache() → use invalidate_recordset()");
// @api.one / @api.multi (word boundary) → removidos
if (/@api\.(?:one|multi)\b/.test(c))
  found.add("@api.one/@api.multi → removidos no 17+");
// _columns = / _defaults = → API legada (pré-8.0)
if (/\b_columns\s*=/.test(c)) found.add("_columns = → API legada (use Fields)");
if (/\b_defaults\s*=/.test(c))
  found.add("_defaults = → API legada (use default= no Field)");

const v = [...found];
if (v.length > 0) {
  console.log(
    `VIOLATION: ${v.length} símbolo(s) de API Python removida no Odoo 17 (${v.join("; ")}) em ${fp}. Ver std-odoo-api-removed-17 › Anti-patterns.`,
  );
  process.exit(1);
}
process.exit(0);
