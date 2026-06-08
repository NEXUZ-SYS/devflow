// omp/lib/run-bash-hook.mjs
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const REQUIRED = ["bash", "node", "python3"];
/** @param {(bin:string)=>boolean} [probe] @returns {string[]} */
export function missingDeps(probe) {
  const has = probe ?? ((b) => spawnSync("command", ["-v", b], { shell: true }).status === 0);
  return REQUIRED.filter((b) => !has(b));
}
/** @param {string} hookName @param {{args?:string[], stdin?:string, cwd?:string}} [opts] @returns {{stdout:string, ok:boolean}} */
export function runBashHook(hookName, opts = {}) {
  try {
    const r = spawnSync("bash", [join(PLUGIN_ROOT, "hooks", hookName), ...(opts.args ?? [])], {
      input: opts.stdin ?? "", cwd: opts.cwd ?? process.cwd(),
      env: { ...process.env, CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT }, encoding: "utf-8", timeout: 20000,
    });
    return { stdout: r.status === 0 ? (r.stdout ?? "") : "", ok: r.status === 0 };
  } catch { return { stdout: "", ok: false }; }
}
