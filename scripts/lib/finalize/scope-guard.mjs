// finalize/scope-guard.mjs — detecta commits fora-de-escopo embarcados na branch
// (commit alheio que iria para a main). O julgamento de "alheio" é do chamador/LLM;
// aqui listamos os commits de baseRef..HEAD. Zero deps além de node:child_process.

import { execFileSync } from "node:child_process";

// Array<{ sha, subject }>
export function outOfScopeCommits(cwd, baseRef = "origin/main") {
  try {
    const out = execFileSync(
      "git",
      ["-C", cwd, "log", "--format=%H%x09%s", `${baseRef}..HEAD`],
      { encoding: "utf8" },
    ).trim();
    if (!out) return [];
    return out.split("\n").map((line) => {
      const tab = line.indexOf("\t");
      return { sha: line.slice(0, tab), subject: line.slice(tab + 1) };
    });
  } catch {
    return []; // base indeterminada → nada a sinalizar (seguro)
  }
}

// Remédio sugerido para isolar um commit alheio.
export function remedyFor(sha, baseRef = "origin/main") {
  return `git rebase --onto ${baseRef} ${sha} HEAD  # dropa ${sha} (recuperável via reflog)`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [cmd, cwd, baseRef] = process.argv.slice(2);
  if (cmd === "list" && cwd) {
    process.stdout.write(JSON.stringify(outOfScopeCommits(cwd, baseRef || "origin/main")) + "\n");
  } else {
    console.error("uso: scope-guard list <cwd> [baseRef]");
    process.exit(2);
  }
}
