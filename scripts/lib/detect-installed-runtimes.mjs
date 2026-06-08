import { spawnSync } from "node:child_process";
const RUNTIMES = ["claude", "opencode", "omp"];
/** @param {(bin:string)=>boolean} [probe] @returns {string[]} */
export function detectInstalledRuntimes(probe) {
  const has = probe ?? ((b) => spawnSync("command", ["-v", b], { shell: true }).status === 0);
  return RUNTIMES.filter((r) => has(r));
}
