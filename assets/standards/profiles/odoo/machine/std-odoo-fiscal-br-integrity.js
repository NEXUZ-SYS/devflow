#!/usr/bin/env node
// assets/standards/profiles/odoo/machine/std-odoo-fiscal-br-integrity.js — linter default
// bundlado do perfil Odoo (TCB do plugin). Invariantes de dado fiscal BR (SEFAZ)
// antes da emissão NFC-e/NF-e. Standard FRACO em lintabilidade: a maioria dos valores
// é runtime e fica em human-review (ver a prosa do .md). Aqui cobrimos só 2 padrões
// LITERAIS estáticos em código/data (.py e .xml).
// Contrato SI-4: filePath em argv[2]; violação → 'VIOLATION: ...' + exit 1.
import { readFileSync } from "node:fs";

const fp = process.argv[2];
if (!fp || (!fp.endsWith(".py") && !fp.endsWith(".xml"))) process.exit(0);

let c = "";
try {
  c = readFileSync(fp, "utf-8");
} catch {
  process.exit(0);
}

const v = [];

// Check 1 — ind_pres presencial errado.
// Literal `ind_pres` atribuído a "0"/'0' via `=` (kwarg/atributo) ou `:` (dict).
// Tolerante a espaços e ao tipo de aspas. Casa: ind_pres = "0" · 'ind_pres': '0'
// · ind_pres="0" · ind_pres="0" como atributo XML. NÃO casa ind_pres='1'.
if (/ind_pres['"]?\s*[:=]\s*['"]0['"]/.test(c)) {
  v.push("ind_pres='0' (rejeição SEFAZ 717 — venda presencial exige '1')");
}

// Check 2 — série NFC-e com zero à esquerda.
// Literal `serie` atribuído a string só-dígitos começando com 0 e comprimento > 1.
// Casa: serie = "003" · 'serie': '003'. NÃO casa serie="3" (1 dígito, OK)
// nem serie="30" (não começa com zero). O grupo (0\d+) garante zero inicial + ao
// menos mais um dígito, evitando falso-positivo na série limpa de 1 dígito.
const sm = c.match(/serie['"]?\s*[:=]\s*['"](0\d+)['"]/);
if (sm) {
  v.push(`série '${sm[1]}' com zero à esquerda (SEFAZ exige sem zeros, ex '3')`);
}

if (v.length > 0) {
  console.log(
    `VIOLATION: ${v.length} risco(s) fiscal(is) BR (${v.join("; ")}) em ${fp}. Ver std-odoo-fiscal-br-integrity › Anti-patterns.`,
  );
  process.exit(1);
}
process.exit(0);
