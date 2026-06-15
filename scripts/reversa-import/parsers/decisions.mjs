// scripts/reversa-import/parsers/decisions.mjs
// Parser de _reversa_sdd/_decisions/ → IR.decisions.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DEC_HEADER_RE = /^##\s+(D-\d+)\s*[—-]\s*(.+?)\s*$/;
const PENDING_RE = /^- \s*(D-\d+)\s*:\s*(.+?)\s*$/;

function readSafe(p) { try { return readFileSync(p, "utf-8"); } catch { return ""; } }

export function parseDecisions(sddDir) {
  const decisions = [];
  const dDir = join(sddDir, "_decisions");
  if (!existsSync(dDir)) return decisions;

  const paradigm = readSafe(join(dDir, "paradigm-decision.md"));
  let current = null;
  for (const line of paradigm.split("\n")) {
    const m = line.match(DEC_HEADER_RE);
    if (m) {
      current = { id: m[1], title: m[2].trim(), status: "resolved", confidence: "official", body: "" };
      decisions.push(current);
    } else if (current) {
      current.body += `${line}\n`;
    }
  }

  const pending = readSafe(join(dDir, "pending-decisions.md"));
  for (const line of pending.split("\n")) {
    const m = line.match(PENDING_RE);
    if (m) decisions.push({ id: m[1], title: m[2].trim(), status: "pending", confidence: "gap", body: "" });
  }
  return decisions;
}
