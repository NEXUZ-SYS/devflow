#!/usr/bin/env node
// assets/standards/machine/std-internationalization.js — linter default bundlado (TCB).
// Contrato SI-4: filePath em argv[2]; violação → 'VIOLATION: ...' + exit 1.
// Plural só no TERNÁRIO `=== 1 ?` (padrão de plural manual), não em qualquer `=== 1`.
// Moeda exige SÍMBOLO concatenado (não `.toFixed(2)` solto, que é cálculo legítimo).
import { readFileSync } from "node:fs";
const fp = process.argv[2];
if (!fp || !/\.(tsx|jsx|ts)$/.test(fp)) process.exit(0);
let c = "";
try { c = readFileSync(fp, "utf-8"); } catch { process.exit(0); }
const hits = [
  ...(c.match(/===\s*1\s*\?/g) || []),
  ...(c.match(/["'](?:\$|R\$|€|£)["']\s*\+/g) || []),
  ...(c.match(/\.toLocale(?:String|DateString|TimeString)\(\s*\)/g) || []),
  ...(c.match(/['"]?margin-(?:left|right)['"]?\s*:/g) || []),
];
if (hits.length > 0) {
  console.log(`VIOLATION: ${hits.length} caso(s) de i18n (plural ternário / moeda com símbolo concatenado / Intl sem locale / margin físico) em ${fp}. Use t() + ICU, Intl.NumberFormat com locale, margin-inline-*. Ver std-internationalization › Anti-patterns.`);
  process.exit(1);
}
process.exit(0);
