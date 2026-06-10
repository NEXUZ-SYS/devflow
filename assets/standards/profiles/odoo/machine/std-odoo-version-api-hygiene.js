#!/usr/bin/env node
// assets/standards/profiles/odoo/machine/std-odoo-version-api-hygiene.js — linter
// default bundlado do perfil Odoo (TCB do plugin). Higiene de versão de API: detecta
// símbolos de ORM/views que são VÁLIDOS no Odoo 12 mas REMOVIDOS/renomeados no 17/18.
// Orientado ao alvo de migração NXZ (17/18) — não use num módulo que permanece em 12.
// Contrato SI-4: filePath em argv[2]; violação → 'VIOLATION: ...' + exit 1.
// Gate de série: só roda quando o módulo-alvo é série >= MIN_SERIES (lida do
// `version` do __manifest__.py mais próximo). Num módulo que permanece em série
// anterior, esses símbolos ainda são válidos — sem manifest, não gateia.
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";

const MIN_SERIES = 17;

// Série Odoo major do __manifest__.py mais próximo subindo de `fp`, ou null.
function odooTargetSeries(filePath) {
  let dir = dirname(filePath);
  for (let i = 0; i < 12; i++) {
    for (const m of ["__manifest__.py", "__openerp__.py"]) {
      const p = join(dir, m);
      if (existsSync(p)) {
        try {
          const mm = readFileSync(p, "utf-8").match(
            /['"]version['"]\s*:\s*['"](\d+)\.\d+/,
          );
          return mm && +mm[1] >= 8 ? +mm[1] : null;
        } catch {
          return null;
        }
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

const fp = process.argv[2];
if (!fp) process.exit(0);
const isPy = fp.endsWith(".py"),
  isXml = fp.endsWith(".xml");
if (!isPy && !isXml) process.exit(0);

const series = odooTargetSeries(fp);
if (series !== null && series < MIN_SERIES) process.exit(0);

let c = "";
try {
  c = readFileSync(fp, "utf-8");
} catch {
  process.exit(0);
}

const found = new Set();

if (isPy) {
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
    found.add("@api.one/@api.multi → removidos no 17/18");
  // _columns = / _defaults = → API legada
  if (/\b_columns\s*=/.test(c)) found.add("_columns = → API legada (use Fields)");
  if (/\b_defaults\s*=/.test(c))
    found.add("_defaults = → API legada (use default= no Field)");
}

if (isXml) {
  // <tree (abertura de tag) → renomeado para <list> no 17+.
  // /<tree[\s>]/ evita confundir com <treeview> e atributos contendo "tree".
  if (/<tree[\s>]/.test(c))
    found.add("<tree> → renomeado para <list> no 17+");
  // attrs= / attrs = em elemento → removido no 18 (usar invisible="..." inline)
  if (/\battrs\s*=/.test(c))
    found.add('attrs= → removido no 18 (use invisible="..." inline)');
}

const v = [...found];
if (v.length > 0) {
  console.log(
    `VIOLATION: ${v.length} símbolo(s) de API obsoleta p/ Odoo 17/18 (${v.join("; ")}) em ${fp}. Ver std-odoo-version-api-hygiene › Anti-patterns.`,
  );
  process.exit(1);
}
process.exit(0);
