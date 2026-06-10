#!/usr/bin/env node
// assets/standards/profiles/odoo/machine/std-odoo-qweb-pdf-safety.js — linter default
// bundlado do perfil Odoo (TCB do plugin). Segurança de render PDF QWeb sob
// wkhtmltopdf: o engine de PDF do Odoo (wkhtmltopdf, WebKit antigo) NÃO suporta
// CSS flexbox/grid — layout de relatório precisa usar <table>. Este é o único
// check estático forte; as demais restrições do wkhtmltopdf (class="article",
// QR via base64, @media print, body.container) ficam como human-review na prosa
// do std (.md), por gerarem falso-positivo alto.
// Contrato SI-4: filePath em argv[2]; violação → 'VIOLATION: ...' no stdout +
// exit 1. Gate de extensão: só processa .xml; demais saem com exit 0.
import { readFileSync } from "node:fs";
const fp = process.argv[2];
if (!fp || !fp.endsWith(".xml")) process.exit(0);
let c = "";
try { c = readFileSync(fp, "utf-8"); } catch { process.exit(0); }

const v = [];

// Check único (estático forte) — display:flex/grid: wkhtmltopdf não suporta
// flexbox/grid; layout de report deve usar <table>. Regex tolerante a espaço
// em volta dos dois-pontos (display\s*:\s*(flex|grid)).
if (/display\s*:\s*(flex|grid)/i.test(c)) {
  v.push("display:flex/grid (wkhtmltopdf não suporta — use <table>)");
}

if (v.length > 0) {
  console.log(`VIOLATION: ${v.length} risco(s) de render PDF wkhtmltopdf (${v.join("; ")}) em ${fp}. Ver std-odoo-qweb-pdf-safety › Anti-patterns.`);
  process.exit(1);
}
process.exit(0);
