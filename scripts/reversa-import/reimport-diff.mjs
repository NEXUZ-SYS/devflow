// scripts/reversa-import/reimport-diff.mjs
// §6: no re-import, lê o manifesto anterior e reporta quais fontes Reversa
// mudaram por hash. Read-only; a skill mostra o resultado antes de reescrever.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

function hashFile(p) {
  try { return createHash("sha256").update(readFileSync(p)).digest("hex"); }
  catch { return null; }
}

export function diffSourceAgainstManifest(destDir) {
  const manifestPath = join(destDir, ".context", "imported", "reversa", "manifest.json");
  if (!existsSync(manifestPath)) return { firstImport: true, changed: [], unchanged: [], missing: [] };

  let manifest = { artifacts: [] };
  try { manifest = JSON.parse(readFileSync(manifestPath, "utf-8")); } catch { /* tolerante */ }

  const changed = [], unchanged = [], missing = [];
  for (const a of manifest.artifacts || []) {
    if (!a.reversaSource) continue;
    const current = hashFile(a.reversaSource);
    if (current === null) missing.push(a);
    else if (current !== a.hash) changed.push(a);
    else unchanged.push(a);
  }
  return { firstImport: false, changed, unchanged, missing };
}
