// finalize/base-sync.mjs — sincronização de base para a finalização de branch.
// Determinístico e testável: a skill invoca por referência (ADR-011/plano rev).
// Zero deps além de node:child_process. Git sempre por argv (nunca via shell do sistema).

import { execFileSync } from "node:child_process";

function git(cwd, args, opts = {}) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", ...opts });
}

// { behind, action: "ok"|"rebase", reason }
export function analyzeBase(cwd, { baseRef = "origin/main" } = {}) {
  try {
    const out = git(cwd, ["rev-list", "--count", `HEAD..${baseRef}`]).trim();
    const behind = Number.parseInt(out, 10);
    if (!Number.isFinite(behind) || behind === 0) {
      return { behind: 0, action: "ok", reason: "base em dia" };
    }
    return { behind, action: "rebase", reason: `${behind} commit(s) atrás de ${baseRef}` };
  } catch (e) {
    // Base indeterminada (ref ausente etc.) → não rebasear (seguro).
    return { behind: 0, action: "ok", reason: `base indeterminada: ${e.message}` };
  }
}

// { ok: true } | { conflict: true, remedy }
export function rebaseOnto(cwd, baseRef = "origin/main") {
  try {
    git(cwd, ["rebase", baseRef], { stdio: "pipe" });
    return { ok: true };
  } catch {
    // Conflito (ou erro): abortar para NUNCA deixar árvore meio-rebaseada.
    try { git(cwd, ["rebase", "--abort"], { stdio: "ignore" }); } catch { /* nada */ }
    return {
      conflict: true,
      remedy: `rebase sobre ${baseRef} abortado (árvore preservada); resolver o conflito manualmente ou escalar`,
    };
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [cmd, cwd, baseRef] = process.argv.slice(2);
  if (cmd === "analyze" && cwd) {
    process.stdout.write(JSON.stringify(analyzeBase(cwd, { baseRef })) + "\n");
  } else {
    console.error("uso: base-sync analyze <cwd> [baseRef]");
    process.exit(2);
  }
}
