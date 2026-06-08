// omp/lib/resolve-cwd.mjs
// Deriva a raiz do projeto a partir do file_path editado (sobe procurando
// .context/ ou .git), em vez de confiar em process.cwd() — A2 (worktrees pi-iso).
import { existsSync } from "node:fs";
import { dirname, join, parse } from "node:path";
/** @param {string} filePath @param {string} fallbackCwd @returns {string} */
export function resolveProjectCwd(filePath, fallbackCwd) {
  let dir = dirname(filePath);
  const rootOf = parse(dir).root;
  while (dir && dir !== rootOf) {
    if (existsSync(join(dir, ".context")) || existsSync(join(dir, ".git"))) return dir;
    dir = dirname(dir);
  }
  return fallbackCwd;
}
