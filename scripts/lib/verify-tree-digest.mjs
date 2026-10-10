import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

// Roda dentro de hook em repo de terceiros: sem fsmonitor/assinatura do config local, sem prompt nem lock.
const HARDEN = ["-c", "core.fsmonitor=false", "-c", "log.showSignature=false"];
const env = () => ({ ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0" });
const run = (root, args) => execFileSync("git", [...HARDEN, "-C", root, ...args], { encoding: "utf8", timeout: 5000, env: env() });

export function treeDigest(root) {
  let head = "";
  try { head = run(root, ["rev-parse", "HEAD"]).trim(); } catch { head = "no-head"; }
  let status = "";
  try {
    status = run(root, ["status", "--porcelain", "--", ".", ":(exclude).context/workflow", ":(exclude).context/runtime"]);
  } catch { status = ""; }
  return createHash("sha256").update(head + "\n" + status).digest("hex");
}
