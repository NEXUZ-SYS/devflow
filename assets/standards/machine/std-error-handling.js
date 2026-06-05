#!/usr/bin/env node
// assets/standards/machine/std-error-handling.js — linter default bundlado (TCB do plugin).
// Regra conservadora: sinaliza catch vazio (engole o erro silenciosamente).
// Contrato SI-4: filePath em argv[2]; violação → 'VIOLATION: ...' + exit 1.
import { readFileSync } from "node:fs";
const fp = process.argv[2];
if (!fp) process.exit(0);
let c = "";
try { c = readFileSync(fp, "utf-8"); } catch { process.exit(0); }
// catch {} ou catch (e) {} — bloco vazio. Quantificadores de whitespace LIMITADOS
// ({0,6}) de propósito: dois \s* ilimitados sobrepostos causam ReDoS O(n²) num
// arquivo com longo run de whitespace (linter roda em todo edit). Limites mantêm
// o match linear e cobrem qualquer formatação real de catch vazio.
// Regra adicional: catch cujo corpo é APENAS console.log/error (engole o erro,
// só faz ruído sem tratar/relançar). Quantificadores delimitados por )/}/[^)] para
// manter o match linear (ReDoS-safe) — mesma disciplina do empty-catch acima.
const empty = c.match(/catch[\s]{0,6}(?:\([^)]*\)[\s]{0,6})?\{[\s]{0,6}\}/g) || [];
const onlyConsole = c.match(/catch\s*\([^)]*\)\s*\{\s*console\.(?:log|error)\([^)]*\)\s*;?\s*\}/g) || [];
const hits = [...empty, ...onlyConsole];
if (hits.length > 0) {
  console.log(`VIOLATION: ${hits.length} catch vazio em ${fp}. Trate, registre ou re-lance o erro — nunca silencie. Ver std-error-handling › Anti-patterns.`);
  process.exit(1);
}
process.exit(0);
