// scripts/lib/path-resolver.mjs — Semana 0 dual-read helper.
//
// Resolves the canonical ADR save path (.context/adrs/) AND legacy path
// (.context/docs/adrs/) for transitional dual-read support during v1.0.x
// and v1.1.x. v1.2 removes legacy support — projects must migrate before then.
//
// All scripts that scan ADRs (adr-update-index, adr-audit, adr-evolve) and
// hooks/session-start MUST use this helper instead of hardcoded paths.

import { existsSync } from "node:fs";
import { join } from "node:path";

export function resolveAdrPath(projectRoot) {
  const newPath = join(projectRoot, ".context", "adrs");
  const legacyPath = join(projectRoot, ".context", "docs", "adrs");
  const newExists = existsSync(newPath);
  const legacyExists = existsSync(legacyPath);
  return {
    write: newPath,
    readPaths: [newPath, legacyPath].filter(existsSync),
    isLegacy: legacyExists && !newExists,
  };
}
