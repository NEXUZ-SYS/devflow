#!/usr/bin/env node
// assets/standards/machine/std-secret-conventions.js — linter default bundlado (TCB do plugin).
// Regra conservadora (baixo FP): sinaliza apenas FORMATOS DE SEGREDO CONHECIDOS
// hard-coded — OpenAI (sk-), GitHub (ghp_/github_pat_), AWS (AKIA), Slack (xox*-),
// Google (AIza). Não tenta adivinhar "secret = '...'" genérico (alto FP).
// Protocolo v2 (ADR-007 v3.1.0): uma linha por ocorrência → VIOLATION <ruleId> <arquivo>:<linha> <msg>
//
// Varredura sobre o CONTEÚDO INTEIRO com matchAll (regra-base original, 7b4b744):
// "console.log(\n  process.env" (chamada quebrada em linha) só casa varrendo o
// conteúdo inteiro. Linha via contador incremental O(n+k).
//
// A mensagem NUNCA embute o valor casado: o valor É o segredo. Ecoar a chave real
// na mensagem a levaria para o baseline.json versionado (onde fica mesmo depois do
// segredo ser rotacionado), pros logs de CI e pro additionalContext injetado no
// agente. labelFor() mapeia cada alternativa da regex para um RÓTULO fixo do tipo
// (ex.: "chave OpenAI (sk-…)") — o "sk-…" é só o prefixo de FORMATO conhecido, não
// o segredo em si.
//
// process.exitCode, não process.exit(): em pipe, console.log é assíncrono e
// exit() força saída antes da fila de escrita drenar, truncando achados — ver
// std-api-conventions.js.
//
// lineFinder DUPLICADO em cada um dos 17 — ver std-api-conventions.js.
import { readFileSync } from "node:fs";
const fp = process.argv[2];
if (!fp) process.exit(0);
let c = "";
try { c = readFileSync(fp, "utf-8"); } catch { process.exit(0); }

function lineFinder(content) {
  let pos = 0, line = 1;
  return (index) => { while (pos < index) { if (content.charCodeAt(pos) === 10) line++; pos++; } return line; };
}
function labelFor(match) {
  if (/^sk-/.test(match)) return "chave OpenAI (sk-…)";
  if (/^ghp_/.test(match)) return "token GitHub (ghp_…)";
  if (/^github_pat_/.test(match)) return "token GitHub (github_pat_…)";
  if (/^AKIA/.test(match)) return "AWS access key (AKIA…)";
  if (/^xox[baprs]-/.test(match)) return "token Slack (xox…)";
  if (/^AIza/.test(match)) return "chave Google (AIza…)";
  if (/^process\.env\.NEXT_PUBLIC_/.test(match)) return "NEXT_PUBLIC_* expõe segredo no client";
  if (/^console\.log\(/.test(match)) return "console.log(process.env)";
  return "segredo hard-coded (formato conhecido)";
}

const lineOf = lineFinder(c);
const re = /\b(sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{30,}|process\.env\.NEXT_PUBLIC_\w*(?:KEY|SECRET|TOKEN|PASSWORD)\b|console\.log\(\s*process\.env\b)/g;
let hits = 0;
for (const m of c.matchAll(re)) {
  hits++;
  console.log(`VIOLATION secret-conventions ${fp}:${lineOf(m.index)} segredo hard-coded — ${labelFor(m[0])}`);
}
process.exitCode = hits > 0 ? 1 : 0;
