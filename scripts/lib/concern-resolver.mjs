// scripts/lib/concern-resolver.mjs
//
// Fuzzy-matches user input against the concern taxonomy. Uses max-of-signals
// scoring — a single strong signal (exact id, lib hint) is enough to confirm.
//
// Signal hierarchy (returns highest match):
//   1. Exact id match                          → 1.00
//   2. inverseHint exact match (full input)    → 0.90
//   3. inverseHint exact match (token in input)→ 0.85
//   4. id substring-contains input tokens      → up to 0.85 (ratio of tokens hit)
//   5. summary token overlap (fuzzy >0.7)      → up to 0.85 (ratio of tokens matched)
//   6. id similarity (whole-string Levenshtein)→ up to 0.60
//
// Output decision rules:
//   - top score >= 0.75 AND gap >= 0.15 → auto-confirmed
//   - 0.5 <= top score < threshold OR gap < 0.15 → ambiguous (top-3)
//   - top score < 0.5 OR no entries → no-match
//
// Public API:
//   resolveConcern(input: string, taxonomy: { entries: Entry[] })
//     → { status: "auto-confirmed" | "ambiguous" | "no-match",
//         match?: Entry, confidence?: number,
//         candidates?: { entry: Entry, score: number }[] }

const SCORE_THRESHOLD = 0.75;
const GAP_THRESHOLD = 0.15;
const MIN_RELEVANT_SCORE = 0.5;

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }
  return dp[a.length][b.length];
}

function similarity(a, b) {
  if (!a || !b) return 0;
  const la = a.toLowerCase();
  const lb = b.toLowerCase();
  if (la === lb) return 1;
  const dist = levenshtein(la, lb);
  return 1 - dist / Math.max(la.length, lb.length);
}

function tokenize(input) {
  return input
    .toLowerCase()
    .split(/[\s,;.()/\\:]+/)
    .filter(t => t.length >= 2);
}

function scoreEntry(input, entry) {
  const inputLower = input.toLowerCase().trim();
  const inputTokens = tokenize(input);
  const entryId = (entry.id || "").toLowerCase();
  const hints = (entry.inverseHints || []).map(h => h.toLowerCase());

  // Signal 1: exact id match
  if (entryId === inputLower) return 1.0;

  // Signal 2: full input matches a hint
  if (hints.includes(inputLower)) return 0.9;

  // Signal 3: any input token matches a hint
  if (inputTokens.some(t => hints.includes(t))) return 0.85;

  // Signal 4: id substring-contains input tokens
  let idContainsScore = 0;
  if (inputTokens.length > 0) {
    const hits = inputTokens.filter(t => entryId.includes(t)).length;
    idContainsScore = (hits / inputTokens.length) * 0.85;
  }

  // Signal 5: summary token overlap (fuzzy match)
  const summaryTokens = tokenize(entry.summary || "");
  let summaryScore = 0;
  if (inputTokens.length > 0 && summaryTokens.length > 0) {
    let overlap = 0;
    for (const t of inputTokens) {
      if (summaryTokens.some(s => similarity(s, t) > 0.7)) overlap++;
    }
    summaryScore = (overlap / inputTokens.length) * 0.85;
  }

  // Signal 6: whole-string id similarity (fallback)
  const idSimScore = similarity(entryId, inputLower) * 0.6;

  return Math.max(idContainsScore, summaryScore, idSimScore);
}

export function resolveConcern(input, taxonomy) {
  if (!input || typeof input !== "string" || !taxonomy?.entries?.length) {
    return { status: "no-match", candidates: [] };
  }

  const scored = taxonomy.entries
    .map(entry => ({ entry, score: scoreEntry(input, entry) }))
    .sort((a, b) => b.score - a.score);

  const top = scored[0];
  if (!top || top.score < MIN_RELEVANT_SCORE) {
    return { status: "no-match", candidates: [] };
  }

  const second = scored[1];
  const gap = top.score - (second?.score ?? 0);

  if (top.score >= SCORE_THRESHOLD && gap >= GAP_THRESHOLD) {
    return {
      status: "auto-confirmed",
      match: top.entry,
      confidence: top.score,
    };
  }

  return {
    status: "ambiguous",
    candidates: scored.slice(0, 3).map(s => ({ entry: s.entry, score: s.score })),
  };
}
