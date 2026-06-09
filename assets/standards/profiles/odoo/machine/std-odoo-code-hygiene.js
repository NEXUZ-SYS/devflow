#!/usr/bin/env node
// assets/standards/profiles/odoo/machine/std-odoo-code-hygiene.js — linter default
// bundlado do perfil Odoo (TCB do plugin). Higiene de código Python (addons Odoo):
// uso de print() cru (use _logger) e chamadas HTTP requests.* sem timeout.
// Inspirado nos checks do OCA/pylint-odoo (print-used W8116, external-request-timeout E8106).
// Contrato SI-4: filePath em argv[2]; violação → 'VIOLATION: ...' + exit 1.
import { readFileSync } from "node:fs";
const fp = process.argv[2];
if (!fp || !fp.endsWith(".py")) process.exit(0);
let c = "";
try { c = readFileSync(fp, "utf-8"); } catch { process.exit(0); }

const v = new Set();
const REQUESTS_VERBS = /requests\s*\.\s*(?:get|post|put|delete|patch|request|head)\s*\(/;

for (const raw of c.split("\n")) {
  // descarta comentário (tudo a partir de #) para não flagar print/requests citados em prosa
  const line = raw.replace(/#.*$/, "");

  // Check 1 — print() cru: print( não precedido por '.' ou caractere de palavra
  // (evita pprint, obj.print). Use _logger.
  if (/(^|[^.\w])print\s*\(/.test(line)) {
    v.add("print() cru (use _logger)");
  }

  // Check 2 — requests.<verbo>( sem timeout= na MESMA linha.
  if (REQUESTS_VERBS.test(line) && !/timeout\s*=/.test(line)) {
    v.add("chamada requests.* sem timeout= (defina timeout explícito)");
  }
}

if (v.size > 0) {
  const list = [...v];
  console.log(`VIOLATION: ${list.length} violação(ões) de higiene de código (${list.join("; ")}) em ${fp}. Ver std-odoo-code-hygiene › Anti-patterns.`);
  process.exit(1);
}
process.exit(0);
