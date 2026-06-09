#!/usr/bin/env node
// assets/standards/profiles/odoo/machine/std-odoo-module-structure.js — linter
// default do perfil Odoo (TCB do plugin). Estrutura/layout canônico do módulo:
// README.rst obrigatório e nenhum model definido na raiz do módulo.
// Gate: só processa arquivos cujo basename é __manifest__.py ou __openerp__.py;
// ancora no manifest e inspeciona o DIRETÓRIO do módulo (dirname do arquivo).
// Contrato SI-4: filePath em argv[2]; violação → 'VIOLATION: ...' + exit 1.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { basename, dirname, join } from "node:path";

const fp = process.argv[2];
if (!fp) process.exit(0);

const b = basename(fp);
if (b !== "__manifest__.py" && b !== "__openerp__.py") process.exit(0);

const moduleDir = dirname(fp);
const v = [];

// 1) README: exige README.rst na raiz do módulo.
try {
  if (!existsSync(join(moduleDir, "README.rst"))) {
    if (existsSync(join(moduleDir, "README.md"))) {
      v.push("use README.rst em vez de README.md");
    } else {
      v.push("módulo sem README.rst");
    }
  }
} catch {
  /* erro de IO → não flaga */
}

// 2) model .py na raiz: nenhum arquivo de topo (exceto __init__/manifest) deve
//    definir models.Model/TransientModel/AbstractModel.
const MODEL_RE = /models\.(Model|TransientModel|AbstractModel)\b/;
try {
  const entries = readdirSync(moduleDir, { withFileTypes: true });
  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith(".py")) continue;
    if (
      e.name === "__init__.py" ||
      e.name === "__manifest__.py" ||
      e.name === "__openerp__.py"
    )
      continue;
    let c = "";
    try {
      c = readFileSync(join(moduleDir, e.name), "utf-8");
    } catch {
      continue;
    }
    if (MODEL_RE.test(c)) {
      v.push(`model definido na raiz (${e.name}) — mova para models/`);
    }
  }
} catch {
  /* erro de IO → não flaga */
}

if (v.length > 0) {
  console.log(
    `VIOLATION: ${v.length} problema(s) de estrutura de módulo (${v.join("; ")}) em ${moduleDir}. Ver std-odoo-module-structure › Anti-patterns.`,
  );
  process.exit(1);
}
process.exit(0);
