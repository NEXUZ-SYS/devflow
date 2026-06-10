#!/usr/bin/env node
// assets/standards/profiles/odoo/machine/std-odoo-test-discipline.js — linter default
// bundlado do perfil Odoo (TCB do plugin). Disciplina de testes via framework do Odoo:
// herança de unittest.TestCase, commit cru dentro de teste e classe de teste sem base
// do framework de teste do Odoo.
// Contrato SI-4: filePath em argv[2]; violação → 'VIOLATION: ...' + exit 1.
import { readFileSync } from "node:fs";
const fp = process.argv[2];
if (!fp || !fp.endsWith(".py")) process.exit(0);
let c = "";
try { c = readFileSync(fp, "utf-8"); } catch { process.exit(0); }

const v = new Set();
const lines = c.split(/\r?\n/);

// Bases conhecidas do framework de teste do Odoo (qualquer uma satisfaz o check 3).
const KNOWN_BASES = [
  "TransactionCase",
  "SingleTransactionCase",
  "SavepointCase",
  "HttpCase",
  "TransactionCaseWithUserDemo",
  "common.TransactionCase",
  "common.HttpCase",
];

// Check 1 — herança direta de unittest.TestCase.
const reUnittest = /class\s+(\w+)\s*\(\s*unittest\.TestCase\s*\)/;
for (const line of lines) {
  const m = line.match(reUnittest);
  if (m) v.add(`classe '${m[1]}' herda unittest.TestCase (use odoo.tests.TransactionCase/HttpCase)`);
}

// Check 2 — commit cru dentro de teste: cr.commit() / self.env.cr.commit() / self._cr.commit().
if (/(?:\bcr|\._cr|\.cr)\s*\.\s*commit\s*\(/.test(c)) {
  v.add("commit() cru dentro de teste (o framework gerencia transação/rollback)");
}

// Check 3 — classe de teste cujo corpo tem 'def test_' mas cujas bases não incluem
// nenhuma base conhecida do framework. Bloco delimitado por indentação até a próxima
// 'class' no mesmo nível (ou menor) / fim do arquivo.
const reClass = /^(\s*)class\s+(\w+)\s*(\(([^)]*)\))?\s*:/;
for (let i = 0; i < lines.length; i++) {
  const cm = lines[i].match(reClass);
  if (!cm) continue;
  const indent = cm[1].length;
  const name = cm[2];
  const basesRaw = (cm[4] || "").trim();

  // corpo da classe: linhas seguintes com indentação maior, até dedent para <= indent
  // numa linha não-vazia (que abre outra def/class/statement de mesmo nível).
  let hasTest = false;
  for (let j = i + 1; j < lines.length; j++) {
    const ln = lines[j];
    if (ln.trim() === "") continue;
    const curIndent = ln.length - ln.trimStart().length;
    if (curIndent <= indent) break; // saiu do corpo da classe
    if (/^\s*def\s+test_/.test(ln)) { hasTest = true; break; }
  }
  if (!hasTest) continue; // classe utilitária sem def test_ → não flaga

  // bases já cobertas pelo check 1 (unittest.TestCase) não são re-flagadas aqui.
  if (/\bunittest\.TestCase\b/.test(basesRaw)) continue;

  const baseTokens = basesRaw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const hasKnown = baseTokens.some((t) =>
    KNOWN_BASES.some((kb) => t === kb || t.endsWith("." + kb) || t === kb.split(".").pop()),
  );
  if (!hasKnown) {
    v.add(`test class '${name}' não herda base do framework (use TransactionCase/HttpCase)`);
  }
}

const arr = [...v];
if (arr.length > 0) {
  console.log(`VIOLATION: ${arr.length} problema(s) de disciplina de teste (${arr.join("; ")}) em ${fp}. Ver std-odoo-test-discipline › Anti-patterns.`);
  process.exit(1);
}
process.exit(0);
