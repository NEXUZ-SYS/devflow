#!/usr/bin/env node
// tests/validation/test-adr-path-canonical.mjs
// Structural test: no skill or command should reference the legacy ADR path
// (.context/docs/adrs/) without an explicit "legacy" qualifier nearby. This
// guards against accidental rollbacks and ensures dual-read references are
// intentional and labeled.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

function findOffenders() {
  // grep for "docs/adrs" in skills/ + commands/, excluding lines that mention
  // "legacy" within ±5 chars of the match (case-insensitive).
  const out = execFileSync("grep", [
    "-rn",
    "-E",
    "docs/adrs",
    "skills/",
    "commands/",
  ], { encoding: "utf-8" });
  const lines = out.split("\n").filter(Boolean);
  return lines.filter(line => {
    // Allowed if the line itself mentions migration markers
    if (/legacy|legado|v1\.2|dual-read|never|nunca/i.test(line)) return false;
    // Allowed: known intentional dual-read patterns (git diff covering both paths together)
    if (/'\.context\/adrs\/\*\.md'\s+'\.context\/docs\/adrs\/\*\.md'/.test(line)) return false;
    return true;
  });
}

test("no skill/command references legacy ADR path without legacy marker", () => {
  let offenders;
  try {
    offenders = findOffenders();
  } catch (err) {
    // grep exits non-zero when no matches found — that's fine
    if (err.status === 1) return;
    throw err;
  }
  assert.deepEqual(
    offenders,
    [],
    `Found legacy ADR path references missing 'legacy' qualifier:\n${offenders.join("\n")}`
  );
});
