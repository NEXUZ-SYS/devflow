#!/usr/bin/env node
// assets/standards/profiles/odoo/machine/std-odoo-owl-patterns.js — linter default
// bundlado do perfil Odoo (TCB do plugin). Convenções de componentes OWL:
// flag constructor() em componente OWL (arquivo com `extends Component` E
// `constructor(`) — use setup() em vez de constructor(). Heurística simples e
// de baixo falso-positivo. NÃO flaga constructor() em arquivos sem componente OWL.
// Contrato SI-4: filePath em argv[2]; violação → 'VIOLATION: ...' + exit 1.
// Gate de série: OWL é Odoo 16+; em série anterior o frontend era Backbone —
// sem manifest, não gateia.
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
const v = [];

// Check 1 — constructor() em componente OWL: arquivo que estende Component E
// declara constructor(). Em OWL a inicialização vai em setup(), não no
// constructor (que não recebe props/env corretamente e quebra o patching).
if (/extends\s+Component\b/.test(c) && /\bconstructor\s*\(/.test(c))
  v.push("constructor() em componente OWL (use setup())");

if (v.length > 0) {
  console.log(`VIOLATION: ${v.length} desvio(s) de padrão OWL (${v.join("; ")}) em ${fp}. Ver std-odoo-owl-patterns › Anti-patterns.`);
  process.exit(1);
}
process.exit(0);
