// finalize/merge-strategy.mjs — resolve a estratégia de merge por precedência:
// config > convenção do repo > fallback. Corrige #9/#10: não assumir --squash cego;
// detecta por --first-parent (não --merges, que não enxerga squash-based).
// Zero deps além de node:child_process.

import { execFileSync } from "node:child_process";

const VALID = new Set(["merge", "squash", "rebase"]);

// "merge" | "squash" | "unknown"
export function detectConvention(cwd, baseRef = "origin/main") {
  let titles = [];
  try {
    const out = execFileSync(
      "git",
      ["-C", cwd, "log", "--first-parent", "--format=%s", "-n", "5", baseRef],
      { encoding: "utf8" },
    ).trim();
    titles = out ? out.split("\n") : [];
  } catch {
    return "unknown";
  }
  if (titles.some((t) => /^Merge pull request #\d+/.test(t) || /^Merge branch /.test(t))) {
    return "merge";
  }
  if (titles.some((t) => /\(#\d+\)$/.test(t))) return "squash";
  return "unknown";
}

// "merge" | "squash" | "rebase"
export function resolveMergeStrategy(cwd, { configStrategy, baseRef = "origin/main" } = {}) {
  if (configStrategy && VALID.has(configStrategy)) return configStrategy; // (1) config
  const conv = detectConvention(cwd, baseRef); // (2) convenção
  if (conv !== "unknown") return conv;
  return "squash"; // (3) fallback
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [cmd, cwd, baseRef] = process.argv.slice(2);
  if (cmd === "resolve" && cwd) {
    process.stdout.write(resolveMergeStrategy(cwd, { baseRef: baseRef || "origin/main" }) + "\n");
  } else {
    console.error("uso: merge-strategy resolve <cwd> [baseRef]");
    process.exit(2);
  }
}
