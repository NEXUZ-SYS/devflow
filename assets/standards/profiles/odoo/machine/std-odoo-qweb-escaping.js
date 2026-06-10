#!/usr/bin/env node
// assets/standards/profiles/odoo/machine/std-odoo-qweb-escaping.js — linter default
// bundlado do perfil Odoo (TCB do plugin). Escaping anti-XSS em templates QWeb:
// t-raw= (removido/desencorajado no 18) e t-esc= (deprecado no 18) — ambos devem
// dar lugar a t-out=. Contrato SI-4: filePath em argv[2]; violação → 'VIOLATION: ...'
// no stdout + exit 1. Gate de extensão: só processa .xml; demais saem com exit 0.
// Gate de série: t-out existe desde Odoo 15; em série anterior t-raw/t-esc
// eram o padrão — sem manifest, não gateia.
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";

const MIN_SERIES = 15;
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
if (!fp || !fp.endsWith(".xml")) process.exit(0);
const series = odooTargetSeries(fp);
if (series !== null && series < MIN_SERIES) process.exit(0);
let c = "";
try { c = readFileSync(fp, "utf-8"); } catch { process.exit(0); }

// Set para dedup: cada tipo de problema é reportado uma única vez por arquivo.
const found = new Set();

// Check 1 — t-raw=: atributo removido/desencorajado (risco XSS); usar t-out.
// Regex tolerante a espaço antes do = (\bt-raw\s*=).
if (/\bt-raw\s*=/.test(c)) found.add("t-raw= (use t-out)");

// Check 2 — t-esc=: atributo deprecado no Odoo 18; usar t-out.
if (/\bt-esc\s*=/.test(c)) found.add("t-esc= deprecado no 18 (use t-out)");

const v = [...found];
if (v.length > 0) {
  console.log(`VIOLATION: ${v.length} problema(s) de escaping QWeb (${v.join("; ")}) em ${fp}. Ver std-odoo-qweb-escaping › Anti-patterns.`);
  process.exit(1);
}
process.exit(0);
