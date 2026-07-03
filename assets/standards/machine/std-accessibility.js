#!/usr/bin/env node
// assets/standards/machine/std-accessibility.js — linter default bundlado (TCB). SI-4.
// `[^>]` casa \n (tags multiline OK). Isenta div/span COM role= (padrão a11y válido).
//
// Regras JSX (div/span onClick sem role, tabIndex positivo, img sem alt) rodam SÓ em tsx/jsx
// e mantêm 100% do comportamento anterior.
// Regras estáticas portadas de pbakaus/impeccable @cli-v3.2.0 (Apache-2.0),
// cli/engine/rules/checks.mjs (checkPageQualityFromDoc / checkQuality). Limitações estáticas:
//  - skipped-heading: ordem de headings avaliada POR ARQUIVO; apps multi-componente (JSX)
//    precisam de resolução cross-file da ordem — aqui só o arquivo corrente é considerado.
//  - tiny-text: casa font-size literal < 12px; não conhece herança nem exclusão de "contexto UI"
//    (buttons/labels/badges) estaticamente — pode gerar ruído.
import { readFileSync } from "node:fs";
const fp = process.argv[2];
if (!fp || !/\.(tsx|jsx|css|html)$/.test(fp)) process.exit(0);
let c = "";
try { c = readFileSync(fp, "utf-8"); } catch { process.exit(0); }

const isJsx = /\.(tsx|jsx)$/.test(fp);
const isHtml = /\.html$/.test(fp);
const isCss = /\.css$/.test(fp);

const v = [];

// ── Regras JSX (tsx/jsx apenas) — comportamento preservado ──
if (isJsx) {
  const divClick = (c.match(/<(?:div|span)\b[^>]*?\sonClick[^>]*>/g) || [])
    .filter(tag => !/\brole\s*=/.test(tag));
  const hits = [
    ...divClick,
    ...(c.match(/tabIndex\s*=\s*\{?\s*["']?[1-9]/g) || []),
    ...(c.match(/<img\b(?![^>]*\salt[=\s/>])[^>]*>/g) || []),
  ];
  if (hits.length > 0) {
    v.push(`${hits.length} caso(s) de a11y (div/span onClick sem role / tabIndex positivo / img sem alt). Use <button>, tabIndex 0/-1, alt em toda <img>. Ver std-accessibility › Anti-patterns.`);
  }
}

// ── skipped-heading (html/jsx/tsx) — níveis de heading não devem pular (h1→h3 sem h2) ──
if (isJsx || isHtml) {
  const headings = [...c.matchAll(/<h([1-6])\b/gi)].map(m => +m[1]);
  let prev = 0;
  for (const level of headings) {
    if (prev > 0 && level > prev + 1) {
      v.push(`skipped-heading — nível pula de h${prev} para h${level} (falta h${prev + 1}); a hierarquia de headings guia leitores de tela.`);
      break;
    }
    prev = level;
  }
}

// ── tiny-text (css/html/inline) — corpo abaixo de 12px é difícil de ler ──
if (isCss || isHtml) {
  const re = /font-size\s*:\s*([\d.]+)px/gi;
  let m;
  while ((m = re.exec(c)) !== null) {
    if (parseFloat(m[1]) < 12) {
      v.push("tiny-text — font-size < 12px em texto de corpo prejudica a legibilidade; use >= 14px (16px ideal).");
      break;
    }
  }
}

if (v.length > 0) {
  for (const m of v) console.log(`VIOLATION: ${m} [${fp}]`);
  process.exit(1);
}
process.exit(0);
