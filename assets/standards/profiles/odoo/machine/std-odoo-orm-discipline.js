#!/usr/bin/env node
// assets/standards/profiles/odoo/machine/std-odoo-orm-discipline.js — linter default
// bundlado do perfil Odoo (TCB do plugin). Disciplina de acesso a dados via ORM:
// SQL injection por interpolação de string em .execute() e commit cru no cursor.
// Contrato SI-4: filePath em argv[2]; violação → 'VIOLATION: ...' + exit 1.
import { readFileSync } from "node:fs";
const fp = process.argv[2];
if (!fp || !fp.endsWith(".py")) process.exit(0);
let c = "";
try { c = readFileSync(fp, "utf-8"); } catch { process.exit(0); }
const v = [];

const lines = c.split(/\r?\n/);

// Check 1 — SQL injection: .execute(...) cujo conteúdo usa interpolação/concat
// de string. Placeholder parametrizado ("... %s", (ids,)) é o jeito CERTO e NÃO flaga.
const execLines = lines.filter((l) => /\.execute\s*\(/.test(l));
let sqlInjection = false;
for (const line of execLines) {
  // recorta a partir da chamada .execute(
  const seg = line.slice(line.search(/\.execute\s*\(/));
  const hasFString = /\bf["']/.test(seg);            // f"..." / f'...'
  const hasFormat = /["']\s*\)?\s*\.\s*format\s*\(/.test(seg) || /\.format\s*\(/.test(seg);
  // operador % aplicado a um literal de string: "..." % algo
  const hasPercentFmt = /["']\s*%\s*[A-Za-z0-9_(]/.test(seg);
  // concatenação de literal de string com +
  const hasConcat = /["']\s*\+/.test(seg) || /\+\s*["']/.test(seg);
  if (hasFString || hasFormat || hasPercentFmt || hasConcat) {
    sqlInjection = true;
    break;
  }
}
if (sqlInjection) v.push("SQL com interpolação/concatenação de string em .execute() (use placeholder parametrizado %s)");

// Check 2 — commit cru no cursor: cr.commit() / self.env.cr.commit() / self._cr.commit()
if (/(?:\bcr|\._cr|\.cr)\s*\.\s*commit\s*\(/.test(c)) v.push("commit() cru no cursor (deixe o ORM controlar a transação)");

if (v.length > 0) {
  console.log(`VIOLATION: ${v.length} violação(ões) de disciplina ORM (${v.join("; ")}) em ${fp}. Ver std-odoo-orm-discipline › Anti-patterns.`);
  process.exit(1);
}
process.exit(0);
