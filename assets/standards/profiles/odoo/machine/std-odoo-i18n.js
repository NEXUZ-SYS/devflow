#!/usr/bin/env node
// assets/standards/profiles/odoo/machine/std-odoo-i18n.js — linter Odoo i18n (perfil odoo).
// Disciplina de tradução: nada de interpolação ansiosa dentro de _().
// Detecta f-string, .format(), `%` aplicado e concatenação `+` dentro de _().
// Contrato SI-4: filePath em argv[2]; violação → 'VIOLATION: ...' + exit 1.
import { readFileSync } from "node:fs";
const fp = process.argv[2];
if (!fp || !fp.endsWith(".py")) process.exit(0);
let c = "";
try { c = readFileSync(fp, "utf-8"); } catch { process.exit(0); }
const v = [];
// 1) f-string dentro de _():  _( f"  |  _( f'
if (/_\(\s*f['"]/.test(c)) v.push("f-string dentro de _()");
// 2) .format() dentro de _():  _( ... .format(  (tolerante por não atravessar `)`)
if (/_\([^)]*\.format\s*\(/.test(c)) v.push(".format() dentro de _()");
// 3) interpolação `%` ansiosa: literal de string seguido de `%` aplicado FORA da string.
//    NÃO casa _("x %(n)s", n=v) (vem `,`) nem _("100% x") (`%` está dentro da string).
if (/_\(\s*(?:['"][^'"]*['"]\s*)+%[^=]/.test(c)) v.push("interpolação % ansiosa dentro de _()");
// 4) concatenação `+` dentro de _():  _( "..." +
if (/_\(\s*['"][^'"]*['"]\s*\+/.test(c)) v.push("concatenação + dentro de _()");
if (v.length > 0) { console.log(`VIOLATION: ${v.length} violação(ões) de i18n (${v.join("; ")}) em ${fp}. Ver std-odoo-i18n › Anti-patterns.`); process.exit(1); }
process.exit(0);
