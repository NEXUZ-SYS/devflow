// scripts/reversa-import/emitters/preserve.mjs
// Planeja o ESPELHO da evidência: cópia fiel para .context/imported/reversa/,
// preservando caminho e nome ORIGINAIS.
//
// A versão anterior conhecia dois nomes (spec.md, screens.md) e os achatava em
// <slug>/spec.md. Medido nos Reversa reais: 1,2% dos bytes preservados no
// attio, 0,0% no OKR. Preservar a estrutura é requisito FUNCIONAL, não estética:
// as referências relativas da ordem de leitura do handoff só resolvem se a
// árvore existir.
//
// Envelope: nem tudo é copiado. O attio tem 17,1 MB, dos quais 16,3 MB são
// screenshots. Binário é sempre `linked`; texto acima do teto também.
import { join } from "node:path";

export const TEXT_EXTENSIONS = new Set([".md", ".yml", ".yaml", ".json", ".feature", ".txt"]);
export const DEFAULT_MAX_TEXT_BYTES = 256 * 1024;

const BASE = join(".context", "imported", "reversa");

function ext(p) { const i = p.lastIndexOf("."); return i === -1 ? "" : p.slice(i).toLowerCase(); }

export function planPreserve(artifacts = [], { maxTextBytes = DEFAULT_MAX_TEXT_BYTES } = {}) {
  return artifacts.map((a) => {
    const isText = TEXT_EXTENSIONS.has(ext(a.relPath));
    const disposition = isText && a.size <= maxTextBytes ? "mirrored" : "linked";
    return {
      from: a.path,
      to: join(BASE, ...a.relPath.split("/")),
      relPath: a.relPath,
      disposition,
      size: a.size,
      kind: a.kind,
    };
  });
}
