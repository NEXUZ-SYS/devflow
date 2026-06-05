#!/usr/bin/env node
// assets/standards/machine/std-secret-conventions.js — linter default bundlado (TCB do plugin).
// Regra conservadora (baixo FP): sinaliza apenas FORMATOS DE SEGREDO CONHECIDOS
// hard-coded — OpenAI (sk-), GitHub (ghp_/github_pat_), AWS (AKIA), Slack (xox*-),
// Google (AIza). Não tenta adivinhar "secret = '...'" genérico (alto FP).
// Contrato SI-4: filePath em argv[2]; violação → 'VIOLATION: ...' + exit 1.
import { readFileSync } from "node:fs";
const fp = process.argv[2];
if (!fp) process.exit(0);
let c = "";
try { c = readFileSync(fp, "utf-8"); } catch { process.exit(0); }
const re = /\b(sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{30,}|process\.env\.NEXT_PUBLIC_\w*(?:KEY|SECRET|TOKEN|PASSWORD)\b|console\.log\(\s*process\.env\b)/g;
const hits = c.match(re) || [];
if (hits.length > 0) {
  console.log(`VIOLATION: ${hits.length} segredo(s) hard-coded (formato de chave conhecido) em ${fp}. Mover para secret manager / env. Ver std-secret-conventions › Anti-patterns.`);
  process.exit(1);
}
process.exit(0);
