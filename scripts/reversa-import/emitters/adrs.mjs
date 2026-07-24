// scripts/reversa-import/emitters/adrs.mjs
// Emitter: ADRs do Reversa → ADRs do projeto DevFlow.
//
// O Reversa REAL já entrega ADRs formatados (headings Contexto/Decisão/
// Consequências/Alternativas, sem frontmatter). Antes derivávamos de
// _decisions/paradigm-decision.md por regex "## D-NN —", formato que NENHUM
// Reversa real usa — resultado: 0 ADRs no attio E no OKR (achado F3).
// Agora lemos os arquivos prontos e convertemos.
//
// Importado nasce `status: Proposto`: é decisão de terceiro reconstruída
// retroativamente (os próprios ADRs do Reversa dizem "inferido"), não decisão
// do projeto. Promover a Aprovado é ato humano na revisão.
import { basename } from "node:path";
import { readFileSync } from "node:fs";
import { toSlug } from "../slug.mjs";
import { stripInjection } from "../sanitize.mjs";

const TITLE_RE = /^#\s*ADR\s*(\d+)\s*[—-]\s*(.+?)\s*$/m;
const STATUS_RE = /^\*\*Status:\*\*\s*(.+?)\s*$/m;

function clean(s) { return stripInjection(String(s || "")).text.trim(); }

/** Corpo de `## <título>` até o próximo `## `. */
function section(text, titleRe) {
  const lines = String(text).split("\n");
  const out = [];
  let inside = false;
  for (const line of lines) {
    if (/^##\s+/.test(line)) {
      if (inside) break;
      inside = titleRe.test(line);
      continue;
    }
    if (inside) out.push(line);
  }
  return out.join("\n").trim();
}

export function parseReversaAdr(path) {
  let text = "";
  try { text = readFileSync(path, "utf-8"); } catch { return null; }
  const t = text.match(TITLE_RE);
  const s = text.match(STATUS_RE);
  const numFromName = basename(path).match(/^(\d+)/);
  return {
    number: t ? t[1] : (numFromName ? numFromName[1] : null),
    title: t ? clean(t[2]) : clean(basename(path).replace(/^\d+-/, "").replace(/\.md$/, "").replace(/-/g, " ")),
    status: s ? clean(s[1]) : "",
    contexto: clean(section(text, /^##\s+Contexto/i)),
    decisao: clean(section(text, /^##\s+Decis(ã|a)o/i)),
    consequencias: clean(section(text, /^##\s+Consequ(ê|e)ncias/i)),
    alternativas: clean(section(text, /^##\s+Alternativas/i)),
  };
}

function isIndex(relPath) { return /(^|\/)readme\.md$/i.test(relPath); }

export function emitAdrs(ir, { now = "1970-01-01" } = {}) {
  const sources = (ir && ir.adrSources) || [];
  const usable = sources.filter((a) => /\.md$/i.test(a.relPath) && !isIndex(a.relPath));

  return usable.map((src, i) => {
    const parsed = parseReversaAdr(src.path);
    if (!parsed) return null;
    const num = String(i + 1).padStart(3, "0");
    const slug = toSlug(parsed.title);
    const filename = `${num}-adr-${slug}-v1.0.0.md`;
    const body = [
      "---",
      "type: adr",
      `name: adr-${slug}`,
      `description: ${parsed.title}`,
      "scope: project",
      "source: reversa",
      "stack: universal",
      "category: arquitetura",
      "status: Proposto",
      "version: 1.0.0",
      `created: ${now}`,
      "supersedes: []",
      "refines: []",
      "protocol_contract: null",
      "decision_kind: draft",
      `summary: "ADR importado do Reversa (status na origem: ${parsed.status || "não declarado"}) — revisar antes de tratar como firme."`,
      "---",
      "",
      `# ADR ${num} — ${parsed.title}`,
      "",
      "## Contexto",
      "",
      parsed.contexto || "_(não capturado na origem)_",
      "",
      "## Decisão",
      "",
      parsed.decisao || "_(não capturada na origem)_",
      "",
      "## Consequências",
      "",
      parsed.consequencias || "_(não capturadas na origem)_",
      "",
      "## Alternativas",
      "",
      parsed.alternativas || "_(não capturadas na origem)_",
      "",
      "## Guardrails",
      "",
      "_(derivar na revisão humana)_",
      "",
      "## Proveniência",
      "",
      `Importado de \`${src.relPath}\`. Status declarado na origem: ${parsed.status || "não declarado"}.`,
      "",
    ].join("\n");
    return { filename, body, provenance: src.relPath };
  }).filter(Boolean);
}
