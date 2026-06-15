// scripts/reversa-import/parsers/review.mjs
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const SEV_RE = /\b(CRITICAL|HIGH)\b\s*:?\s*(.+)$/;

export function parseReview(reviewDir) {
  const findings = [];
  if (!existsSync(reviewDir)) return { findings };
  for (const f of readdirSync(reviewDir)) {
    let body = "";
    try { body = readFileSync(join(reviewDir, f), "utf-8"); } catch { continue; }
    for (const line of body.split("\n")) {
      const m = line.match(SEV_RE);
      if (m) findings.push({ severity: m[1], text: m[2].trim(), source: f });
    }
  }
  return { findings };
}
