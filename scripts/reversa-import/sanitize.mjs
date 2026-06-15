// scripts/reversa-import/sanitize.mjs
// Strip de prompt-injection em conteúdo Reversa (terceiro) antes de embutir em
// artefatos lidos por LLM. Baseado em scripts/lib/sanitize-snippet.mjs (SI-6),
// porém com IGNORE_RE deliberadamente mais robusto: tolera múltiplos
// qualificadores em qualquer ordem ("ignore all previous instructions"), que é a
// frase de injeção mais comum e que o padrão SI-6 original (1 qualificador) perde.
const ROLE_MARKER_RE = /^\s*(SYSTEM|ASSISTANT|USER|HUMAN)\s*:/i;
const IGNORE_RE = /ignore\s+(?:the\s+|all\s+|above\s+|previous\s+)*(?:instructions|context|rules)/i;

export function stripInjection(input) {
  if (typeof input !== "string") return { text: "", hits: 0 };
  const kept = [];
  let hits = 0;
  for (const line of input.split(/\r?\n/)) {
    if (ROLE_MARKER_RE.test(line) || IGNORE_RE.test(line)) { hits += 1; continue; }
    kept.push(line);
  }
  return { text: kept.join("\n"), hits };
}
