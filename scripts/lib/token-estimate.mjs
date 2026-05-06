// scripts/lib/token-estimate.mjs — tiktoken substitute, char-approx ±15%.
//
// Sufficient for observability (Gate 3) in v1.0; precision deferred to v1.1+.
// English text averages ~3.8 chars per token; multi-byte UTF-8 contributes
// proportionally more bytes, which slightly overestimates — acceptable for
// budget warning thresholds.
//
// When v1.1 introduces token budget enforcement (Gate 5), this module will
// be replaced or augmented with a tiktoken WASM binding. The interface stays
// stable: estimateTokens(text: string) → integer.

const CHARS_PER_TOKEN = 3.8;

export function estimateTokens(text) {
  if (typeof text !== "string" || text.length === 0) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}
