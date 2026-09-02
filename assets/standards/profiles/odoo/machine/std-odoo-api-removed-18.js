#!/usr/bin/env node
// assets/standards/profiles/odoo/machine/std-odoo-api-removed-18.js
//
// Símbolos de VIEW (XML) removidos/renomeados na série 18.
// Contrato SI-4: filePath em argv[2]; violação → 'VIOLATION: ...' + exit 1.
//
// NÃO resolve versão: quem decide se este linter roda é a FAIXA declarada no
// frontmatter (appliesFrom: "18"). Estas duas regras rodando num projeto 17
// produziram 47 falso-positivos em 589 arquivos — o bug que originou o escopo
// de versão. <tree> é CORRETO no 17; a renomeação para <list> é do 18.
import { readFileSync } from "node:fs";

const fp = process.argv[2];
if (!fp || !fp.endsWith(".xml")) process.exit(0);

let c = "";
try {
  c = readFileSync(fp, "utf-8");
} catch {
  process.exit(0);
}

const found = new Set();

// <tree (abertura de tag) → renomeado para <list> no 18.
// /<tree[\s>]/ evita confundir com <treeview> e atributos contendo "tree".
if (/<tree[\s>]/.test(c)) found.add("<tree> → renomeado para <list> no 18");
// attrs= em elemento → removido no 18 (usar invisible="..." inline)
if (/\battrs\s*=/.test(c))
  found.add('attrs= → removido no 18 (use invisible="..." inline)');

const v = [...found];
if (v.length > 0) {
  console.log(
    `VIOLATION: ${v.length} símbolo(s) de view removido no Odoo 18 (${v.join("; ")}) em ${fp}. Ver std-odoo-api-removed-18 › Anti-patterns.`,
  );
  process.exit(1);
}
process.exit(0);
