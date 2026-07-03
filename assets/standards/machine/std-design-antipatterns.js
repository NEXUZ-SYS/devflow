#!/usr/bin/env node
// assets/standards/machine/std-design-antipatterns.js — linter default bundlado (TCB). SI-4.
// Regras "slop" (AI tells) portadas de pbakaus/impeccable @cli-v3.2.0 (Apache-2.0),
// cli/engine/rules/checks.mjs, engines/regex/detect-text.mjs e registry/antipatterns.mjs.
// Apenas as decidíveis por parsing estático de UM arquivo (ver docs/design-rules-classification.md).
// Parsing estático puro: sem LLM, sem rede, sem exec, sem DOM/getComputedStyle.
//
// Limitações estáticas (aproximam o comportamento upstream que usa estilo computado/cascade):
//  - side-tab / border-accent-on-rounded / gpt-thin-border-wide-shadow / codex-grid /
//    italic-serif-display: co-ocorrência avaliada por bloco de estilo ({...} ou style="..."),
//    não resolve cascade/herança nem shorthand `border` vs por-lado.
//  - overused-font / single-font / flat-type-hierarchy / monotonous-spacing: agregam
//    declarações do arquivo; não resolvem herança nem unidades responsivas (clamp/vw).
//  - ai-color-palette / cream-palette: classificam a cor literal (hex/rgb); o gate de
//    "qual elemento é o bg/heading" depende de cascade — fallback estático.
//  - numbered-section-markers / em-dash / marketing-buzzword / aphoristic-cadence /
//    theater-slop-phrase: heurísticas de texto (corpo), rodam só em markup (não em .css).
//  - extreme-negative-tracking: só letter-spacing literal em `em`.
// Regras `advisory` (upstream severity advisory / gated gpt|gemini) recebem prefixo [advisory].
import { readFileSync } from "node:fs";

const fp = process.argv[2];
if (!fp || !/\.(tsx|jsx|vue|svelte|html|css)$/.test(fp)) process.exit(0);
let c = "";
try {
  c = readFileSync(fp, "utf-8");
} catch {
  process.exit(0);
}

const isMarkup = !/\.css$/i.test(fp);

// ── constantes portadas (shared/constants.mjs) ──
const GENERIC_FONTS = new Set([
  "serif", "sans-serif", "monospace", "cursive", "fantasy",
  "system-ui", "ui-serif", "ui-sans-serif", "ui-monospace", "ui-rounded",
  "-apple-system", "blinkmacsystemfont", "segoe ui",
  "inherit", "initial", "unset", "revert",
]);
const KNOWN_SERIF_FONTS = new Set([
  "fraunces", "recoleta", "newsreader", "playfair display", "playfair",
  "cormorant", "cormorant garamond", "garamond", "eb garamond",
  "tiempos", "tiempos headline", "tiempos text",
  "lora", "vollkorn", "spectral",
  "source serif pro", "source serif 4", "source serif",
  "ibm plex serif", "merriweather",
  "libre caslon", "libre baskerville", "baskerville",
  "georgia", "times new roman", "times",
  "dm serif display", "dm serif text",
  "instrument serif", "gt sectra", "ogg", "canela",
  "freight display", "freight text",
]);

// ── helpers estáticos ──
function stripHtmlToText(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
}

// Blocos de estilo: corpo de regra CSS ({...}) ou atributo inline style="...".
function styleBlocks(src) {
  const out = [];
  const re = /\{([^{}]*)\}|style\s*=\s*"([^"]*)"|style\s*=\s*'([^']*)'/gi;
  let m;
  while ((m = re.exec(src)) !== null) out.push(m[1] || m[2] || m[3] || "");
  return out;
}

function isNeutralBorderColor(str) {
  const m = str.match(/solid\s+(#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|[a-z]+)/i);
  if (!m) return false;
  const col = m[1].toLowerCase();
  if (["gray", "grey", "silver", "white", "black", "transparent", "currentcolor"].includes(col)) return true;
  const hex6 = col.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/);
  if (hex6) {
    const [r, g, b] = [parseInt(hex6[1], 16), parseInt(hex6[2], 16), parseInt(hex6[3], 16)];
    return Math.max(r, g, b) - Math.min(r, g, b) < 30;
  }
  const hex3 = col.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/);
  if (hex3) {
    const [r, g, b] = [parseInt(hex3[1] + hex3[1], 16), parseInt(hex3[2] + hex3[2], 16), parseInt(hex3[3] + hex3[3], 16)];
    return Math.max(r, g, b) - Math.min(r, g, b) < 30;
  }
  const rgb = col.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgb) {
    const [r, g, b] = [+rgb[1], +rgb[2], +rgb[3]];
    return Math.max(r, g, b) - Math.min(r, g, b) < 30;
  }
  return false;
}

function parseColorLiteral(str) {
  if (!str) return null;
  const s = String(str).trim().toLowerCase();
  const rgb = s.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgb) return { r: +rgb[1], g: +rgb[2], b: +rgb[3] };
  const h6 = s.match(/#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})\b/);
  if (h6) return { r: parseInt(h6[1], 16), g: parseInt(h6[2], 16), b: parseInt(h6[3], 16) };
  const h3 = s.match(/#([0-9a-f])([0-9a-f])([0-9a-f])\b/);
  if (h3) return { r: parseInt(h3[1] + h3[1], 16), g: parseInt(h3[2] + h3[2], 16), b: parseInt(h3[3] + h3[3], 16) };
  return null;
}

function isCreamColor(rgb) {
  if (!rgb) return false;
  const { r, g, b } = rgb;
  if (Math.min(r, g, b) < 209) return false;
  if (!(r >= g && g >= b)) return false;
  const warmth = r - b;
  return warmth >= 6 && warmth <= 48;
}

function creamFromClassList(cls) {
  const TW = {
    "bg-amber-50": "#fffbeb", "bg-amber-100": "#fef3c7",
    "bg-orange-50": "#fff7ed", "bg-orange-100": "#ffedd5",
    "bg-yellow-50": "#fefce8",
    "bg-stone-50": "#fafaf9", "bg-stone-100": "#f5f5f4", "bg-stone-200": "#e7e5e4",
  };
  for (const [tok, hex] of Object.entries(TW)) {
    if (new RegExp(`(^|\\s|"|')${tok}(\\s|"|'|$)`).test(cls) && isCreamColor(parseColorLiteral(hex))) return tok;
  }
  const arb = cls.match(/\bbg-\[(#[0-9a-f]{3,8})\]/i);
  if (arb && isCreamColor(parseColorLiteral(arb[1]))) return arb[1];
  return null;
}

const blocks = styleBlocks(c);
const text = isMarkup ? stripHtmlToText(c) : "";
const v = [];

// ── gradient-text — texto com gradiente (background-clip:text sobre um gradiente) é "AI tell".
if (
  /(?:-webkit-)?background-clip\s*:\s*text/i.test(c) &&
  /(?:linear|radial|conic)-gradient\s*\(/i.test(c)
) {
  v.push('gradient-text — texto com gradiente é "AI tell"; use cor sólida (contraste >= 4.5:1); gradiente só em superfícies');
}
if (/\bbg-clip-text\b/.test(c) && /\bbg-gradient-to-/.test(c)) {
  v.push('gradient-text — bg-clip-text + bg-gradient (Tailwind); use cor sólida');
}

// ── side-tab — borda colorida grossa em UM lado (esquerda/direita) do card.
for (const decl of c.match(/border-(?:left|right)\s*:\s*(\d+)px\s+solid\b[^;{}]*/gi) || []) {
  const w = +(decl.match(/(\d+)px/)?.[1] || 0);
  if (w >= 3 && !isNeutralBorderColor(decl)) {
    v.push("side-tab — faixa/borda de destaque em um lado do card é o tell mais reconhecível; remova ou suavize");
    break;
  }
}
for (const decl of c.match(/border-(?:left|right)-width\s*:\s*(\d+)px/gi) || []) {
  if (+(decl.match(/(\d+)px/)?.[1] || 0) >= 3) {
    v.push("side-tab — faixa/borda de destaque em um lado do card é o tell mais reconhecível; remova ou suavize");
    break;
  }
}

// ── border-accent-on-rounded — borda grossa top/bottom em elemento arredondado.
for (const blk of blocks) {
  if (!/border-radius/i.test(blk)) continue;
  const m = blk.match(/border-(?:top|bottom)\s*:\s*(\d+)px\s+solid/i);
  if (m && +m[1] >= 3) {
    v.push("border-accent-on-rounded — borda grossa colida com cantos arredondados; remova a borda ou o radius");
    break;
  }
}

// ── overused-font — famílias tão usadas que perderam personalidade.
if (
  /font-family\s*:\s*['"]?(Inter|Roboto|Open Sans|Lato|Montserrat|Arial|Helvetica|Fraunces|Geist Sans|Geist Mono|Geist|Mona Sans|Plus Jakarta Sans|Space Grotesk|Recoleta|Instrument Sans|Instrument Serif)\b/i.test(c) ||
  /fonts\.googleapis\.com\/css2?\?family=(Inter|Roboto|Open\+Sans|Lato|Montserrat|Fraunces|Plus\+Jakarta\+Sans|Space\+Grotesk|Instrument\+Sans|Instrument\+Serif|Mona\+Sans|Geist)\b/i.test(c)
) {
  v.push("overused-font — Inter/Roboto/Geist/Space Grotesk/etc. são monocultura; escolha uma face com personalidade");
}

// ── single-font — uma única família para a página inteira (sem pareamento).
{
  const fonts = new Set();
  let m;
  const ffRe = /font-family\s*:\s*([^;}]+)/gi;
  while ((m = ffRe.exec(c)) !== null) {
    for (const f of m[1].split(",").map((x) => x.trim().replace(/^['"]|['"]$/g, "").toLowerCase())) {
      if (f && !GENERIC_FONTS.has(f)) fonts.add(f);
    }
  }
  const gfRe = /fonts\.googleapis\.com\/css2?\?family=([^&"'\s]+)/gi;
  while ((m = gfRe.exec(c)) !== null) {
    for (const f of m[1].split("|").map((x) => x.split(":")[0].replace(/\+/g, " ").toLowerCase())) fonts.add(f);
  }
  if (fonts.size === 1 && c.split("\n").length >= 20) {
    v.push("single-font — só uma família para tudo; pareie um display distintivo com um corpo refinado");
  }
}

// ── flat-type-hierarchy — tamanhos muito próximos, sem hierarquia visual (ratio < 2.0).
{
  const sizes = new Set();
  const REM = 16;
  let m;
  const sizeRe = /font-size\s*:\s*([\d.]+)(px|rem|em)\b/gi;
  while ((m = sizeRe.exec(c)) !== null) {
    const px = m[2] === "px" ? +m[1] : +m[1] * REM;
    if (px > 0 && px < 200) sizes.add(Math.round(px * 10) / 10);
  }
  const TW = { "text-xs": 12, "text-sm": 14, "text-base": 16, "text-lg": 18, "text-xl": 20, "text-2xl": 24, "text-3xl": 30, "text-4xl": 36, "text-5xl": 48, "text-6xl": 60, "text-7xl": 72, "text-8xl": 96, "text-9xl": 128 };
  for (const [cls, px] of Object.entries(TW)) if (new RegExp(`\\b${cls}\\b`).test(c)) sizes.add(px);
  if (sizes.size >= 3) {
    const sorted = [...sizes].sort((a, b) => a - b);
    if (sorted[sorted.length - 1] / sorted[0] < 2.0) {
      v.push("flat-type-hierarchy — font-sizes muito próximos; use menos tamanhos com mais contraste (ratio >= 2.0)");
    }
  }
}

// ── ai-color-palette — gradientes roxo/violeta e ciano são tells reconhecíveis.
{
  let hit = false;
  const purpleHex = /#(?:7c3aed|8b5cf6|a855f7|9333ea|7e22ce|6d28d9|6366f1|764ba2|667eea)\b/i;
  if (purpleHex.test(c)) {
    // Roxo/violeta literal em cor de texto OU em gradiente (fallback estático do
    // upstream, que resolve o hue por cor computada). `color:` num bloco CSS vem
    // após `{`/newline, não só após `;`/início — por isso o anchor é relaxado.
    const purpleText = /color\s*:\s*[^;{}]*#(?:7c3aed|8b5cf6|a855f7|9333ea|7e22ce|6d28d9)\b|gradient[^;{}]*#(?:7c3aed|8b5cf6|a855f7|764ba2|667eea)\b/i;
    if (purpleText.test(c)) hit = true;
  }
  if (!hit && /\bfrom-(?:purple|violet|indigo)-\d+\b/.test(c) && /\bto-(?:purple|violet|indigo|blue|cyan|pink|fuchsia)-\d+\b/.test(c)) hit = true;
  if (hit) v.push("ai-color-palette — roxo/violeta e ciano-no-escuro são tells de UI gerada por IA; escolha paleta intencional");
}

// ── cream-palette — bg creme/bege virou a superfície "tasteful" padrão de IA.
{
  let hit = false;
  const bgRe = /background(?:-color)?\s*:\s*([^;{}]+)/gi;
  let m;
  while ((m = bgRe.exec(c)) !== null) {
    const val = m[1].trim();
    if (/gradient|url\s*\(/i.test(val)) continue;
    const lit = val.match(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/i);
    if (lit && isCreamColor(parseColorLiteral(lit[0]))) { hit = true; break; }
  }
  if (!hit && creamFromClassList(c)) hit = true;
  if (hit) v.push("cream-palette — fundo creme/bege por reflexo; escolha um fundo de uma paleta deliberada");
}

// ── monotonous-spacing — mesmo valor de espaçamento em todo lugar (sem ritmo).
{
  const vals = [];
  let m;
  const pxRe = /(?:padding|margin)(?:-(?:top|right|bottom|left))?\s*:\s*(\d+)px/gi;
  while ((m = pxRe.exec(c)) !== null) { const x = +m[1]; if (x > 0 && x < 200) vals.push(x); }
  const remRe = /(?:padding|margin)(?:-(?:top|right|bottom|left))?\s*:\s*([\d.]+)rem/gi;
  while ((m = remRe.exec(c)) !== null) { const x = Math.round(parseFloat(m[1]) * 16); if (x > 0 && x < 200) vals.push(x); }
  const gapRe = /gap\s*:\s*(\d+)px/gi;
  while ((m = gapRe.exec(c)) !== null) vals.push(+m[1]);
  const twRe = /\b(?:p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap)-(\d+)\b/g;
  while ((m = twRe.exec(c)) !== null) vals.push(+m[1] * 4);
  const rounded = vals.map((x) => Math.round(x / 4) * 4);
  if (rounded.length >= 10) {
    const counts = {};
    for (const x of rounded) counts[x] = (counts[x] || 0) + 1;
    const maxCount = Math.max(...Object.values(counts));
    const unique = [...new Set(rounded)].filter((x) => x > 0);
    if (maxCount / rounded.length > 0.6 && unique.length <= 3) {
      v.push("monotonous-spacing — mesmo espaçamento em todo lugar; agrupe relacionados e separe seções");
    }
  }
}

// ── bounce-easing — bounce/elastic soa datado; use easing exponencial.
{
  let hit = /\banimate-bounce\b/.test(c) ||
    /animation(?:-name)?\s*:\s*[^;{}]*(?:bounce|elastic|wobble|jiggle|spring)[^;{}]*/i.test(c);
  if (!hit) {
    const bez = /cubic-bezier\(\s*([\d.-]+)\s*,\s*([\d.-]+)\s*,\s*([\d.-]+)\s*,\s*([\d.-]+)\s*\)/g;
    let m;
    while ((m = bez.exec(c)) !== null) {
      const y1 = parseFloat(m[2]), y2 = parseFloat(m[4]);
      if (y1 < -0.1 || y1 > 1.1 || y2 < -0.1 || y2 > 1.1) { hit = true; break; }
    }
  }
  if (hit) v.push("bounce-easing — bounce/elastic é datado; objetos reais desaceleram suave (ease-out-quart/quint/expo)");
}

// ── italic-serif-display — serif itálico gigante como headline de herói.
for (const blk of blocks) {
  if (!/font-style\s*:\s*italic/i.test(blk)) continue;
  const fs = blk.match(/font-size\s*:\s*([\d.]+)(px|rem|em)/i);
  if (!fs) continue;
  const px = fs[2].toLowerCase() === "px" ? +fs[1] : +fs[1] * 16;
  if (px < 48) continue;
  const ff = blk.match(/font-family\s*:\s*([^;]+)/i);
  if (!ff) continue;
  const tokens = ff[1].split(",").map((x) => x.trim().replace(/^['"]|['"]$/g, "").toLowerCase());
  const primary = tokens.find((x) => x && !GENERIC_FONTS.has(x));
  const isSerif = (primary && KNOWN_SERIF_FONTS.has(primary)) || tokens.includes("serif");
  if (isSerif) {
    v.push("italic-serif-display — serif itálico gigante como herói virou padrão universal de landing IA; use roman ou display não-serif");
    break;
  }
}

// ── extreme-negative-tracking — letter-spacing esmagado além da legibilidade.
{
  const re = /letter-spacing\s*:\s*(-?[\d.]+)em/gi;
  let m;
  while ((m = re.exec(c)) !== null) {
    if (parseFloat(m[1]) <= -0.05) {
      v.push("extreme-negative-tracking — letter-spacing < -0.05em custa legibilidade; aperte display opticamente, não destrutivamente");
      break;
    }
  }
}

// ── gpt-thin-border-wide-shadow [advisory] — borda hairline + sombra larga difusa.
for (const blk of blocks) {
  const hasThinBorder = /border\s*:\s*1px\s+solid\b/i.test(blk) || /border-width\s*:\s*1px\b/i.test(blk);
  if (!hasThinBorder) continue;
  const sh = blk.match(/box-shadow\s*:\s*([^;{}]+)/i);
  if (!sh) continue;
  const pxVals = [...sh[1].matchAll(/(-?\d+(?:\.\d+)?)px|(?<![.\d])\b(0)\b(?![.\d])/g)].map((p) => +(p[1] ?? p[2]));
  if (pxVals.length >= 3 && pxVals[2] >= 16) {
    v.push("[advisory] gpt-thin-border-wide-shadow — borda hairline + sombra larga difusa é assinatura de UI gerada; escolha um ou outro");
    break;
  }
}

// ── repeating-stripes-gradient [advisory] — listras de repeating-gradient como decoração.
if (/repeating-(?:linear|radial|conic)-gradient\s*\(/i.test(c)) {
  v.push("[advisory] repeating-stripes-gradient — listras de repeating-gradient são assinatura de UI gerada; use textura deliberada ou superfície plana");
}

// ── codex-grid-background [advisory] — grade de duas linhas hairline por linear-gradient.
for (const blk of blocks) {
  if (!/background-size\s*:[^;{}"']*\b\d{1,3}px\b/i.test(blk)) continue;
  let hairlineCount = 0;
  const bgDeclRe = /\bbackground(?:-image)?\s*:\s*([^;{}"']*)/gi;
  let bm;
  while ((bm = bgDeclRe.exec(blk)) !== null) {
    const stops = bm[1].match(/\b\d{1,3}px\s*,\s*transparent\s+\d{1,3}px/gi);
    if (stops) hairlineCount += stops.length;
  }
  if (hairlineCount >= 2) {
    v.push("[advisory] codex-grid-background — grade decorativa de duas linhas hairline é assinatura de UI gerada; reserve para canvas/mapa/blueprint");
    break;
  }
}

// ── numbered-section-markers [advisory] — marcadores 01/02/03 como labels de seção.
if (isMarkup) {
  const re = /\b(0[1-9]|1[0-2])\b/g;
  const seen = new Set();
  let m;
  while ((m = re.exec(text)) !== null) seen.add(m[1]);
  if (seen.size >= 3) {
    const sorted = [...seen].sort();
    let seq = 0;
    for (let i = 1; i < sorted.length; i++) if (parseInt(sorted[i], 10) === parseInt(sorted[i - 1], 10) + 1) seq++;
    if (seq >= 2) v.push("[advisory] numbered-section-markers — marcadores numerados (01, 02, 03) são scaffold editorial de IA; escolha outra cadência");
  }
}

// ── em-dash-overuse — mais de 4 em-dashes no corpo é tell de cadência de IA.
if (isMarkup) {
  let count = 0;
  const re = /[—]|--(?=\S)/g;
  while (re.exec(text) !== null) count++;
  if (count >= 5) v.push("em-dash-overuse — em-dashes demais no corpo; use vírgulas, dois-pontos, pontos ou parênteses");
}

// ── marketing-buzzword — frases genéricas de SaaS são tells instantâneos de IA.
if (isMarkup) {
  const BUZZWORDS = [
    "streamline your", "empower your", "supercharge your",
    "unleash your", "unleash the power", "leverage the power",
    "built for the modern", "trusted by leading", "trusted by the world",
    "best-in-class", "industry-leading", "world-class", "enterprise-grade",
    "next-generation", "cutting-edge", "transform your business",
    "revolutionize", "game-changer", "game changing",
    "mission-critical", "best of breed", "future-proof", "future proof",
    "seamless experience", "seamlessly integrate",
    "drive engagement", "drive growth", "drive results",
    "harness the power",
  ];
  const lower = text.toLowerCase();
  if (BUZZWORDS.some((p) => lower.includes(p))) {
    v.push("marketing-buzzword — frases genéricas de SaaS (streamline/empower/supercharge/...) são tells; diga o que o produto literalmente faz");
  }
}

// ── aphoristic-cadence — três ou mais rebuttals curtos / contrastes manufaturados.
if (isMarkup) {
  const NOT_A_RE = /\bNot an? [a-z][^.!?]{1,40}[.!]\s+[A-Z][^.!?]{1,60}[.!]/g;
  const SHORT_REBUTTAL_RE = /\b[A-Z][^.!?]{4,80}[.!]\s+(No|Just)\s+[a-z][^.!?]{2,60}[.!]/g;
  let count = 0;
  let m;
  while ((m = NOT_A_RE.exec(text)) !== null) count++;
  while ((m = SHORT_REBUTTAL_RE.exec(text)) !== null) count++;
  if (count >= 3) v.push("aphoristic-cadence — cadência aforística repetida soa como IA, não voz; uma vez tudo bem, o padrão é o tell");
}

// ── theater-slop-phrase [advisory] — enquadrar algo como "X theater" é tique gerado.
if (isMarkup && /\b\w+\s+theater\b/i.test(text)) {
  v.push('[advisory] theater-slop-phrase — descartar algo como "theater" é tique de copy gerada; diga claramente o que faz ou não faz');
}

// ── image-hover-transform [advisory] — escalar/rotacionar imagem no hover é assinatura gerada.
{
  let hit = /\bimg\b[^,{}]*:hover\b[^{}]*\{[^}]*\btransform\s*:\s*(?:scale|rotate|translate|matrix|skew)/i.test(c);
  if (!hit) {
    const imgTagRe = /<img\b[^>]*\bclass\s*=\s*"([^"]*)"/gi;
    let im;
    while ((im = imgTagRe.exec(c)) !== null) {
      if (/\bhover:(?:scale|rotate|translate|skew)-/.test(im[1])) { hit = true; break; }
    }
  }
  if (hit) v.push("[advisory] image-hover-transform — escalar/rotacionar imagem no hover é assinatura de UI gerada; deixe a imagem parada ou use interação sutil");
}

if (v.length > 0) {
  for (const m of v) console.log(`VIOLATION: ${m} [${fp}]`);
  process.exit(1);
}
process.exit(0);
