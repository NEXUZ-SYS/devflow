// scripts/lib/path-guard.mjs — containment helpers (SI path-traversal defense).
//
// Single source of truth for "is this resolved path inside that directory?".
// Reused by devflow-standards.mjs (eject) and devflow-stacks.mjs (eject).
// Pure node:*.

import { resolve, sep } from "node:path";

/**
 * True iff `filePath` resolves to `parentDir` itself or a path strictly inside
 * it. Uses `parentDir + sep` so sibling-prefix dirs (/a/bevil vs /a/b) do NOT
 * count as inside.
 */
export function isWithinDir(filePath, parentDir) {
  const rel = resolve(filePath);
  const par = resolve(parentDir);
  return rel === par || rel.startsWith(par + sep);
}
