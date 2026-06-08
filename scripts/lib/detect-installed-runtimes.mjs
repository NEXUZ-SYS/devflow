import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const RUNTIMES = ["claude", "opencode", "omp"];
/** @param {(bin:string)=>boolean} [probe] @returns {string[]} */
export function detectInstalledRuntimes(probe) {
  const has = probe ?? ((b) => spawnSync("command", ["-v", b], { shell: true }).status === 0);
  return RUNTIMES.filter((r) => has(r));
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.stdout.write(JSON.stringify(detectInstalledRuntimes()) + "\n");
}
