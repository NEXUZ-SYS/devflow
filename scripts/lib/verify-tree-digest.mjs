// scripts/lib/verify-tree-digest.mjs — impressão digital da árvore de trabalho.
// HEAD + status porcelain, EXCLUINDO estado efêmero de workflow/runtime, que muta
// durante o próprio avanço de fase (senão o gate cai em livelock de "prova vencida").
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

export function treeDigest(root) {
  let head = "";
  try { head = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(); } catch { head = "no-head"; }
  let status = "";
  try {
    status = execFileSync("git", ["-C", root, "status", "--porcelain",
      "--", ".", ":(exclude).context/workflow", ":(exclude).context/runtime"],
      { encoding: "utf8" });
  } catch { status = ""; }
  return createHash("sha256").update(head + "\n" + status).digest("hex");
}
