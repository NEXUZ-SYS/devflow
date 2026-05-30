// scripts/lib/path-resolver.mjs — DDC-aware ADR path resolver.
//
// Resolves the canonical ADR save path (.context/engineering/adrs/) AND all
// known legacy paths (.context/adrs, .context/docs/adrs) for transitional
// dual-read support during v1.0.x and v1.1.x.  v1.2 removes legacy support —
// projects must migrate before then.
//
// Uses context-paths.mjs as the single source of truth for the canonical path
// and the legacy fallback list.
//
// All scripts that scan ADRs (adr-update-index, adr-audit, adr-evolve) and
// hooks/session-start MUST use this helper instead of hardcoded paths.

import { existsSync } from "node:fs";
import { contextPaths, resolveReadPaths } from "./context-paths.mjs";

export function resolveAdrPath(projectRoot) {
  const write = contextPaths(projectRoot).adrs;  // .context/engineering/adrs
  const readPaths = resolveReadPaths(projectRoot, "adrs");  // canonical first, then existing legacies
  const canonicalExists = existsSync(write);
  const hasLegacy = readPaths.some(p => p !== write && existsSync(p));
  return {
    write,
    readPaths,
    isLegacy: !canonicalExists && hasLegacy,
  };
}
