#!/usr/bin/env node
// assets/standards/profiles/odoo/machine/std-odoo-owl-patterns.js — linter default
// bundlado do perfil Odoo (TCB do plugin). Convenções de componentes OWL:
// flag constructor() em componente OWL (arquivo com `extends Component` E
// `constructor(`) — use setup() em vez de constructor(). Heurística simples e
// de baixo falso-positivo. NÃO flaga constructor() em arquivos sem componente OWL.
// Contrato SI-4: filePath em argv[2]; violação → 'VIOLATION: ...' + exit 1.
import { readFileSync } from "node:fs";
const fp = process.argv[2];
if (!fp || !fp.endsWith(".js")) process.exit(0);
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
