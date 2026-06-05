#!/usr/bin/env node
// assets/standards/machine/std-security.js — linter default bundlado (TCB do plugin).
// Regra conservadora: sinaliza dangerouslySetInnerHTML (vetor XSS clássico em React).
// Contrato SI-4: filePath em argv[2]; violação → 'VIOLATION: ...' + exit 1.
import { readFileSync } from "node:fs";
const fp = process.argv[2];
if (!fp) process.exit(0);
let c = "";
try { c = readFileSync(fp, "utf-8"); } catch { process.exit(0); }
// Regra adicional: template-literal SQL com interpolação `${…}` (vetor de SQL
// injection). Lookbehind `(?<!sql)` poupa a tag segura `sql`…`` (queries
// parametrizadas via tagged template). Strings normais sem `${` (ex.: db.query("…$1…"))
// não casam — exige `${` dentro da crase.
const xss = c.match(/dangerouslySetInnerHTML/g) || [];
const sqlInterp = c.match(/(?<!sql)`[^`]*\b(?:SELECT|INSERT|UPDATE|DELETE)\b[^`]*\$\{/gi) || [];
const hits = [...xss, ...sqlInterp];
if (hits.length > 0) {
  console.log(`VIOLATION: ${hits.length} vetor(es) inseguro(s) (dangerouslySetInnerHTML / SQL string-interpolada) em ${fp}. Sanitize (DOMPurify) / use query parametrizada (tagged sql\`\` ou placeholders $1). Ver std-security › Anti-patterns.`);
  process.exit(1);
}
process.exit(0);
