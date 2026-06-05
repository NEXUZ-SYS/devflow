#!/usr/bin/env node
// hooks/commit-msg-guard.mjs — valida Conventional Commits.
const TYPES = ["feat","fix","docs","style","refactor","perf","test","build","ci","chore","revert"];
const RE = new RegExp(`^(${TYPES.join("|")})(\\([\\w$.-]+\\))?(!)?: (.+)$`);
export function isValidConventionalCommit(msg) {
  const first = String(msg).split("\n")[0].trim();
  const m = first.match(RE);
  if (!m) return false;
  const subject = m[4];
  if (subject.length < 1 || first.length > 72) return false;
  if (subject.endsWith(".")) return false;
  return true;
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const { readFileSync } = await import("node:fs");
  const path = process.argv[2];
  if (!path) process.exit(0);
  let msg = ""; try { msg = readFileSync(path, "utf-8"); } catch { process.exit(0); }
  if (!isValidConventionalCommit(msg)) {
    console.error("✗ Mensagem de commit não segue Conventional Commits: <tipo>(<escopo>)?: <descrição imperativa ≤72, sem ponto>.");
    process.exit(1);
  }
  process.exit(0);
}
