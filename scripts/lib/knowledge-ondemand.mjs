// scripts/lib/knowledge-ondemand.mjs — knowledge on-demand relevante ao arquivo editado.
//
// Heurística (a mesma do Stage-2 original de print-knowledge-bodies.mjs): um doc on-demand
// é relevante quando QUALQUER um vale:
//   1. o caminho editado contém o token `layer` ou `name` do doc;
//   2. o doc é da camada engineering, o nome fala de architecture/methodology e o arquivo
//      editado é código-fonte (src/** ou extensão de fonte comum).
// Teto de 3 docs; corpo sem frontmatter, com trim(); docs vazios ou ilegíveis são descartados.
import { readRegularFileSafe } from "./safe-read.mjs";
import { loadKnowledgeIndex } from "./knowledge-loader.mjs";
import { parseFrontmatter } from "./frontmatter.mjs";

const SOURCE_EXTS = /\.(ts|tsx|js|mjs|py|go)$/i;
export const MAX_ONDEMAND_DOCS = 3;
const MAX_DOC_BYTES = 1024 * 1024; // doc maior que isso não cabe no contexto de qualquer jeito

function relevanceFor(editedFilePath) {
  const edited = String(editedFilePath);
  const editedNorm = edited.replace(/\\/g, "/").toLowerCase();
  const isSourceFile = SOURCE_EXTS.test(edited) || /[\\/]src[\\/]/.test(edited);
  return (entry) => {
    const layer = (entry.layer ?? "").toLowerCase();
    const name = (entry.name ?? "").toLowerCase();
    if (layer && editedNorm.includes(layer)) return true;
    if (name && editedNorm.includes(name)) return true;
    return entry.layer === "engineering" && isSourceFile &&
      (name.includes("architecture") || name.includes("methodology"));
  };
}

/** @returns {Array<{name: string, file: string, body: string}>} */
export function relevantOnDemandKnowledge(projectRoot, editedFilePath) {
  if (!projectRoot || !editedFilePath) return [];
  const isRelevant = relevanceFor(editedFilePath);
  const relevant = loadKnowledgeIndex(projectRoot)
    .filter((e) => e.activation === "on-demand")
    .filter(isRelevant)
    .slice(0, MAX_ONDEMAND_DOCS);
  const out = [];
  for (const entry of relevant) {
    try {
      // Leitura segura: sem seguir symlink e sem travar em FIFO plantado depois do índice.
      const raw = readRegularFileSafe(entry.file, MAX_DOC_BYTES);
      if (raw === null) continue;
      const body = parseFrontmatter(raw).body.trim();
      if (body) out.push({ name: entry.name, file: entry.file, body });
    } catch { /* doc ilegível é ignorado */ }
  }
  return out;
}
