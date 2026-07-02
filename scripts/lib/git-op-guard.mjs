// scripts/lib/git-op-guard.mjs
// ADV-6: rede técnica contra operações git destrutivas (git push / gh pr merge /
// git commit) executadas DIRETAMENTE numa branch protegida. Complementa o gate
// de Edit/Write do pre-tool-use, que não cobre comandos Bash. Pura + zero-dep.
//
// A rede só dispara quando a branch ATUAL é protegida (protectedBranches do
// .context/.devflow.yaml). Em branch de trabalho, tudo é liberado — o merge/push
// legítimo acontece pela fase C do PREVC / devflow:git-strategy.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { parseFrontmatter } from "./frontmatter.mjs";

const DESTRUCTIVE = [
  { re: /\bgh\s+pr\s+merge\b/, label: "gh pr merge" },
  { re: /\bgit\s+push\b/, label: "git push" },
  { re: /\bgit\s+commit\b/, label: "git commit" },
];

// Decisão determinística. Não toca disco nem git — testável em isolamento.
export function evaluateGitOp({ command, branch, protectedBranches, branchProtection, strategy }) {
  if (!command || typeof command !== "string") {
    return { decision: "allow", reason: "sem comando" };
  }
  if (strategy === "trunk-based") {
    return { decision: "allow", reason: "trunk-based: sem proteção de branch" };
  }
  if (branchProtection === false) {
    return { decision: "allow", reason: "branchProtection: false" };
  }
  const protectedList = Array.isArray(protectedBranches) ? protectedBranches : [];
  if (!branch || !protectedList.includes(branch)) {
    return { decision: "allow", reason: `branch '${branch}' não é protegida` };
  }
  for (const { re, label } of DESTRUCTIVE) {
    if (re.test(command)) {
      return {
        decision: "deny",
        reason:
          `'${label}' direto na branch protegida '${branch}' bloqueado. ` +
          `Não execute push/merge/commit ad-hoc na protegida — passe pela fase C ` +
          `do PREVC (finalização de branch) ou por devflow:git-strategy.`,
      };
    }
  }
  return { decision: "allow", reason: "comando não-destrutivo" };
}

// Lê git.{strategy,branchProtection,protectedBranches} de .context/.devflow.yaml.
// Sem arquivo/campo → objeto vazio (evaluateGitOp faz fail-open então).
export function loadGitConfig(projectRoot) {
  const path = join(projectRoot, ".context", ".devflow.yaml");
  if (!existsSync(path)) return {};
  let git;
  try {
    const data = parseFrontmatter(`---\n${readFileSync(path, "utf-8")}\n---\n`).data || {};
    git = data.git || {};
  } catch {
    return {};
  }
  return {
    strategy: git.strategy,
    branchProtection: git.branchProtection,
    protectedBranches: git.protectedBranches,
  };
}

// Resolve a branch atual do repositório em projectRoot. Null em erro (fail-open).
export function resolveBranch(projectRoot) {
  try {
    return execFileSync("git", ["-C", projectRoot, "rev-parse", "--abbrev-ref", "HEAD"], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim() || null;
  } catch {
    return null;
  }
}
