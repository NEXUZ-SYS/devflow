#!/usr/bin/env node
// assets/standards/profiles/odoo/machine/std-odoo-js-modules.js — linter default
// bundlado do perfil Odoo (TCB do plugin). Módulos JS no padrão ES (Odoo 16+):
// flag odoo.define() (formato legado autogerado) e require() AMD (atribuição
// ou assinatura do define legado). NÃO flaga import ES.
// Contrato SI-4: filePath em argv[2]; violação → 'VIOLATION: ...' + exit 1.
// Gate de série: ES modules são Odoo 16+; em série anterior odoo.define()/
// require() AMD eram o padrão — sem manifest, não gateia.
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";

const MIN_SERIES = 16;
function odooTargetSeries(filePath) {
  let dir = dirname(filePath);
  for (let i = 0; i < 12; i++) {
    for (const m of ["__manifest__.py", "__openerp__.py"]) {
      const p = join(dir, m);
      if (existsSync(p)) {
        try {
          const mm = readFileSync(p, "utf-8").match(/['"]version['"]\s*:\s*['"](\d+)\.\d+/);
          return mm && +mm[1] >= 8 ? +mm[1] : null;
        } catch { return null; }
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

const fp = process.argv[2];
if (!fp || !fp.endsWith(".js")) process.exit(0);
const series = odooTargetSeries(fp);
if (series !== null && series < MIN_SERIES) process.exit(0);
let c = "";
try { c = readFileSync(fp, "utf-8"); } catch { process.exit(0); }
const v = new Set();

// Check 1 — odoo.define(): formato legado autogerado (código novo usa ES module)
if (/\bodoo\.define\s*\(/.test(c)) v.add("odoo.define() legado (use ES module)");

// Check 2 — require() AMD: atribuição (= require) OU assinatura do define legado
// (function (require)). NÃO flaga import ES nem require de Node fora desse padrão.
if (/=\s*require\s*\(|function\s*\(\s*require\s*\)/.test(c))
  v.add("require() AMD legado (use import ES6)");

if (v.size > 0) {
  const list = [...v];
  console.log(`VIOLATION: ${list.length} problema(s) de módulo JS (${list.join("; ")}) em ${fp}. Ver std-odoo-js-modules › Anti-patterns.`);
  process.exit(1);
}
process.exit(0);
