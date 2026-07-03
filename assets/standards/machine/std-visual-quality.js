#!/usr/bin/env node
// assets/standards/machine/std-visual-quality.js — linter default bundlado (TCB). SI-4.
// Regras de "quality" (não-a11y) portadas de pbakaus/impeccable @cli-v3.2.0 (Apache-2.0),
// cli/engine/rules/checks.mjs e engines/regex/detect-text.mjs. Apenas as decidíveis por
// parsing estático de UM arquivo (ver docs/design-rules-classification.md).
// Parsing estático puro: sem LLM, sem rede, sem exec, sem DOM/getComputedStyle.
//
// Limitações estáticas (upstream usa estilo computado + contexto de elemento):
//  - broken-image: só src vazio/ausente/"#"; NÃO detecta URL realmente quebrada (exigiria render/rede).
//  - layout-transition: casa a declaração literal; ignora `transition: all` (como o upstream) e
//    valores resolvidos pela cascade.
//  - justified-text / all-caps-body / wide-tracking: avaliadas por bloco de estilo; não sabem
//    estaticamente se o elemento é heading vs corpo nem o comprimento do texto — podem gerar ruído.
import { readFileSync } from "node:fs";

const fp = process.argv[2];
if (!fp || !/\.(tsx|jsx|vue|svelte|html|css)$/.test(fp)) process.exit(0);
let c = "";
try {
  c = readFileSync(fp, "utf-8");
} catch {
  process.exit(0);
}

// Blocos de estilo: corpo de regra CSS ({...}) ou atributo inline style="...".
function styleBlocks(src) {
  const out = [];
  const re = /\{([^{}]*)\}|style\s*=\s*"([^"]*)"|style\s*=\s*'([^']*)'/gi;
  let m;
  while ((m = re.exec(src)) !== null) out.push(m[1] || m[2] || m[3] || "");
  return out;
}

const blocks = styleBlocks(c);
const v = [];

// ── broken-image — <img> com src vazio / "#" / ausente vira caixa de imagem quebrada.
{
  const emptySrc = /<img\b[^>]*?\bsrc\s*=\s*(?:""|''|"\s+"|'\s+'|"#"|'#')/i;
  const noSrc = /<img\b(?:(?!\bsrc\s*=)[^>])*>/gi;
  let hit = emptySrc.test(c);
  if (!hit) {
    let m;
    while ((m = noSrc.exec(c)) !== null) {
      if (!/\bsrc\s*=/i.test(m[0])) { hit = true; break; }
    }
  }
  if (hit) v.push("broken-image — <img> com src vazio/ausente/placeholder embarca como imagem quebrada; use imagem real ou remova a tag");
}

// ── layout-transition — animar width/height/padding/margin causa layout thrash.
{
  const re = /transition(?:-property)?\s*:\s*([^;{}]+)/gi;
  let m;
  while ((m = re.exec(c)) !== null) {
    const val = m[1].toLowerCase();
    if (/\ball\b/.test(val)) continue;
    if (/\b(?:(?:max|min)-)?(?:width|height)\b|\bpadding\b|\bmargin\b/.test(val)) {
      v.push("layout-transition — animar width/height/padding/margin causa jank; use transform/opacity ou grid-template-rows");
      break;
    }
  }
}

// ── justified-text — texto justificado sem hyphens: auto cria "rios" de espaço.
for (const blk of blocks) {
  if (/text-align\s*:\s*justify/i.test(blk) &&
      !/(?:-webkit-)?hyphens\s*:\s*auto/i.test(blk)) {
    v.push("justified-text — texto justificado sem hyphens: auto cria espaçamento irregular; use text-align: left ou hyphens: auto");
    break;
  }
}

// ── all-caps-body — passagens longas em maiúsculas são difíceis de ler.
if (/text-transform\s*:\s*uppercase/i.test(c)) {
  v.push("all-caps-body — text-transform: uppercase em corpo remove a forma das palavras; reserve maiúsculas para labels/headings curtos");
}

// ── wide-tracking — letter-spacing > 0.05em em corpo desagrupa caracteres e freia a leitura.
for (const blk of blocks) {
  const ls = blk.match(/letter-spacing\s*:\s*([\d.]+)em/i);
  if (!ls) continue;
  if (parseFloat(ls[1]) > 0.05 && !/text-transform\s*:\s*uppercase/i.test(blk)) {
    v.push("wide-tracking — letter-spacing > 0.05em em corpo freia a leitura; reserve tracking largo para labels curtos em maiúsculas");
    break;
  }
}

if (v.length > 0) {
  for (const m of v) console.log(`VIOLATION: ${m} [${fp}]`);
  process.exit(1);
}
process.exit(0);
