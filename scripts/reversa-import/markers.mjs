// scripts/reversa-import/markers.mjs
// Util puro: varre marcadores de confiança Reversa num texto.
// 🟦 oficial · 🟢 capturado · 🟡 inferido · 🔴 lacuna

export const MARKER = Object.freeze({
  official: "🟦",
  captured: "🟢",
  inferred: "🟡",
  gap: "🔴",
});

const KEY_BY_GLYPH = {
  [MARKER.official]: "official",
  [MARKER.captured]: "captured",
  [MARKER.inferred]: "inferred",
  [MARKER.gap]: "gap",
};

export function scanMarkers(text = "") {
  const counts = { official: 0, captured: 0, inferred: 0, gap: 0 };
  const gaps = [];
  for (const line of String(text).split("\n")) {
    for (const glyph of Object.keys(KEY_BY_GLYPH)) {
      if (line.includes(glyph)) counts[KEY_BY_GLYPH[glyph]] += 1;
    }
    const gapIdx = line.indexOf(MARKER.gap);
    if (gapIdx !== -1) {
      const after = line.slice(gapIdx + MARKER.gap.length).trim();
      if (after) gaps.push(after);
    }
  }
  const total = counts.official + counts.captured + counts.inferred + counts.gap;
  return { ...counts, total, gaps };
}
