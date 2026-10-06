// scripts/lib/session-norms.mjs — normas do projeto num campo próprio do SessionStart (≤ 9000).
//
// O additionalContext principal do session-start já passa de 22k caracteres (acima de 10k o
// Claude Code só injeta uma prévia de 2k). As normas block/review, os guardrails de ADR
// aprovadas e o knowledge always vão aqui, num segundo hook, com orçamento próprio: block
// primeiro, depois review; ADRs; depois knowledge always. O que não couber vira ponteiro
// ("leia <caminho>") — nunca é omitido em silêncio.
import { findProjectRoot, loadEffectiveStandards } from "./standards-engine.mjs";
import { resolveLevel, maxLevel } from "./standards-level.mjs";
import { extractStandardRules } from "./edit-nudge.mjs";
import { loadAlwaysActive } from "./knowledge-loader.mjs";
import { loadApprovedGuardrails } from "./adr-guardrails.mjs";
import { frameProjectData, safeName, inlineSafe, displayPath } from "./untrusted-frame.mjs";

// Correção rodada 1 (revisão de segurança): tudo que vem do repositório e fica FORA da
// moldura (cabeçalho, ponteiro "leia …") passa por safeName/inlineSafe/displayPath — os
// mesmos que a T9 já usa em pre-edit-context.mjs. Sem isso, description/applyTo/stack/name
// hostis fechavam `</PROJECT_NORMS>` cedo, escreviam marcador de papel ou carregavam
// bidi/zero-width num texto que o modelo lê como vindo do próprio plugin, não do projeto.
const idText = (id) => safeName(id);
const textField = (v, max = 200) => inlineSafe(v || "", max);

// Espaço reservado para o aviso de itens omitidos por orçamento (nunca descartados em
// silêncio: ou o conteúdo/ponteiro cabe, ou o contador no rodapé registra quantos ficaram de
// fora). Reservar do início garante que o próprio rodapé quase sempre caiba.
const FOOTER_ROOM = 150;

/**
 * Monta o texto de `<PROJECT_NORMS>` para o SessionStart: standards block/review (com
 * princípios), guardrails de ADR aprovadas e knowledge `always`, todos emoldurados por
 * `frameProjectData`. Nunca excede `maxChars` unidades UTF-16; o que não coube vira ponteiro,
 * e o que nem o ponteiro couber é contado (nunca some em silêncio). Sem nenhuma
 * norma/ADR/knowledge, devolve `""` (o hook então não imprime nada).
 */
export function buildSessionNorms({ projectRoot, maxChars = 9000 }) {
  const root = findProjectRoot(projectRoot) || projectRoot;
  let out = "<PROJECT_NORMS>\nNormas do projeto. Nível block é verificado por hook e CI; review é checado na fase V.\n";
  const close = "</PROJECT_NORMS>\n";
  const contentCap = Math.max(0, maxChars - FOOTER_ROOM);
  const add = (s) => { if (out.length + s.length + close.length <= contentCap) { out += s; return true; } return false; };
  let omitted = 0;
  const addOrPointer = (full, pointer) => { if (!add(full) && !add(pointer)) omitted++; };

  let stds = [];
  try {
    stds = loadEffectiveStandards(root).filter(s => maxLevel(s) !== "warn")
      .sort((a, b) => (maxLevel(a) === "block" ? 0 : 1) - (maxLevel(b) === "block" ? 0 : 1));
  } catch { stds = []; }
  for (const s of stds) {
    const id = idText(s.id);
    const where = displayPath(root, s.filePath) || id;
    const applyToPart = textField((s.applyTo || []).join(", ")) || "(nenhum)";
    const head = `\n## ${id} (${resolveLevel(s, "")}) [applyTo: ${applyToPart}]\n`;
    // Endurecimento (revisão T10): description é prosa livre do projeto — vai DENTRO da
    // moldura junto dos princípios, nunca solta no cabeçalho. Fora da moldura só ficam
    // valores curtos e estruturados (id, nível, applyTo), já tratados por safeName/inlineSafe.
    const descLine = textField(s.description) ? `Descrição: ${textField(s.description)}\n\n` : "";
    const body = descLine + (extractStandardRules(s.body || "").principios || "");
    addOrPointer(head + frameProjectData(s.id, body), `${head}leia ${where}\n`);
  }

  let adrs = [];
  try { adrs = loadApprovedGuardrails(root); } catch { adrs = []; }
  for (const a of adrs) {
    const name = idText(a.name);
    const stackPart = textField(a.stack, 60) || "-";
    // O ponteiro aponta pro diretório REAL de origem desta ADR (canônico ou legado, mesmo
    // dual-read de context-paths.mjs) — nunca assume ".context/engineering/adrs/" fixo.
    const where = displayPath(root, a.dir) || ".context/engineering/adrs";
    const head = `\n## ADR ${name} (stack: ${stackPart}) — guardrails\n`;
    addOrPointer(head + frameProjectData(`adr:${a.name}`, a.guardrails), `${head}leia ${where}\n`);
  }

  let always = [];
  try { always = loadAlwaysActive(root); } catch { always = []; }
  for (const d of always) {
    const name = idText(d.name);
    const where = displayPath(root, d.file) || name;
    const head = `\n## knowledge: ${name}\n`;
    addOrPointer(head + frameProjectData(d.name, (d.body || "").trim()), `${head}leia ${where}\n`);
  }

  if (omitted > 0) {
    // Endurecimento (revisão T10): a omissão por orçamento é determinística — reler na
    // próxima sessão não muda nada, porque o mesmo conteúdo continua sem caber. O rodapé
    // aponta para onde a norma completa mora no projeto.
    const footer = `\n(+${omitted} norma(s)/ADR(s)/knowledge omitido(s) por orçamento — consulte .context/engineering/standards/)\n`;
    if (out.length + footer.length + close.length <= maxChars) out += footer;
  }

  if (!stds.length && !adrs.length && !always.length) return "";
  return out + close;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // Saída do hook: um único JSON válido ou nada — nunca texto solto. O try/catch é a última
  // rede: qualquer exceção inesperada vira silêncio, não um JSON quebrado nem um stack trace
  // no stdout que o SessionStart tentaria interpretar como additionalContext.
  try {
    const text = buildSessionNorms({ projectRoot: process.argv[2] || process.cwd() });
    if (process.argv.includes("--json")) {
      if (text) {
        const obj = process.env.CURSOR_PLUGIN_ROOT
          ? { additional_context: text }
          : { hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: text } };
        process.stdout.write(JSON.stringify(obj) + "\n");
      }
    } else if (text) {
      process.stdout.write(text);
    }
  } catch { /* silêncio: nunca texto solto nem JSON quebrado */ }
}
