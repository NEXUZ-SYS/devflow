#!/usr/bin/env node
// assets/standards/profiles/odoo/machine/std-odoo-oca-separation.js — linter
// default do perfil Odoo (TCB do plugin). Separação arquitetural OCA/terceiros
// vs NXZ: módulos de terceiros (author != Nexuz/NXZ) devem ficar fiéis ao
// original — NUNCA receber campos nxz_*. Extensão NXZ é via módulo bridge
// (nxz_<base>_bridge) que herda por _inherit.
//
// Heurística (weakStandardWarning): ancora no __manifest__.py para descobrir o
// author do módulo e varre os .py do módulo procurando DEFINIÇÃO de campo nxz_*.
// Gate: só processa arquivos cujo basename é __manifest__.py ou __openerp__.py.
// Contrato SI-4: filePath em argv[2]; violação → 'VIOLATION: ...' + exit 1.
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";

const fp = process.argv[2];
if (!fp) process.exit(0);

const b = basename(fp);
if (b !== "__manifest__.py" && b !== "__openerp__.py") process.exit(0);

let mani = "";
try {
  mani = readFileSync(fp, "utf-8");
} catch {
  process.exit(0); // erro de IO → não flaga
}

// Extrai o author do manifest.
const am = mani.match(/['"]author['"]\s*:\s*['"]([^'"]+)['"]/);
if (!am) process.exit(0); // sem author → indeterminado, human-review
const author = am[1];

// author contém Nexuz/NXZ → módulo NXZ, campos nxz_* são esperados.
if (/nexuz|nxz/i.test(author)) process.exit(0);

// Módulo de terceiro: varre os .py do topo e de models/ procurando DEFINIÇÃO
// de campo nxz_* (recursivo raso: raiz do módulo + models/).
const moduleDir = dirname(fp);
const NXZ_FIELD_RE = /^\s*nxz_\w+\s*=\s*fields\./m;

function scanDir(dir) {
  const hits = [];
  let entries = [];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return hits; // erro de IO → não flaga
  }
  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith(".py")) continue;
    let c = "";
    try {
      c = readFileSync(join(dir, e.name), "utf-8");
    } catch {
      continue;
    }
    if (NXZ_FIELD_RE.test(c)) hits.push(join(dir, e.name));
  }
  return hits;
}

const found = [];
for (const dir of [moduleDir, join(moduleDir, "models")]) {
  try {
    if (existsSync(dir) && statSync(dir).isDirectory()) {
      found.push(...scanDir(dir));
    }
  } catch {
    /* erro de IO → não flaga */
  }
}

const v = [];
for (const f of found) {
  v.push(
    `campo nxz_* em módulo de terceiro (author='${author}') em ${basename(f)} — use módulo bridge nxz_*_bridge com _inherit`,
  );
}

if (v.length > 0) {
  console.log(
    `VIOLATION: ${v.length} violação(ões) de separação OCA/NXZ (${v.join("; ")}) em ${moduleDir}. Ver std-odoo-oca-separation › Anti-patterns.`,
  );
  process.exit(1);
}
process.exit(0);
