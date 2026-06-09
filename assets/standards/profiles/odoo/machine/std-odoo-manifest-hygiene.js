#!/usr/bin/env node
// assets/standards/profiles/odoo/machine/std-odoo-manifest-hygiene.js — linter default
// do perfil Odoo (TCB do plugin). Higiene do __manifest__.py:
// name obrigatório, version série-prefixada (x.y.z.w.v), license explícita.
// Gate: só processa arquivos cujo basename é __manifest__.py ou __openerp__.py.
// Contrato SI-4: filePath em argv[2]; violação → 'VIOLATION: ...' + exit 1.
import { readFileSync } from "node:fs";
import { basename } from "node:path";

const fp = process.argv[2];
if (!fp) process.exit(0);

const b = basename(fp);
if (b !== "__manifest__.py" && b !== "__openerp__.py") process.exit(0);

let c = "";
try {
  c = readFileSync(fp, "utf-8");
} catch {
  process.exit(0);
}

const v = [];

if (!/['"]name['"]\s*:/.test(c)) v.push("manifest sem 'name'");

const vm = c.match(/['"]version['"]\s*:\s*['"]([^'"]+)['"]/);
if (vm && !/^\d+\.\d+\.\d+\.\d+\.\d+$/.test(vm[1])) {
  v.push(
    `version '${vm[1]}' fora do formato série-prefixada x.y.z.w (ex 18.0.1.0.0)`,
  );
} else if (!vm) {
  v.push("manifest sem 'version'");
}

if (!/['"]license['"]\s*:/.test(c)) v.push("manifest sem 'license' explícita");

if (v.length > 0) {
  console.log(
    `VIOLATION: ${v.length} problema(s) no manifest (${v.join("; ")}) em ${fp}. Ver std-odoo-manifest-hygiene › Anti-patterns.`,
  );
  process.exit(1);
}
process.exit(0);
