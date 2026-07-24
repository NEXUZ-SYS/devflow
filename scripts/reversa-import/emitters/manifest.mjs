// scripts/reversa-import/emitters/manifest.mjs
// Manifesto do espelho: hash por artefato de origem, para o re-import detectar
// drift (diffSourceAgainstManifest). O corpus Reversa é VIVO — cresceu 207→475 KB
// em dois dias no OKR —, então re-importar é caso comum, não exceção.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

function hashFile(p) {
  try { return createHash("sha256").update(readFileSync(p)).digest("hex"); }
  catch { return null; }
}

export function emitManifest(ir, { now = "1970-01-01T00:00:00.000Z" } = {}) {
  const artifacts = (ir.preservePlan || []).map((p) => ({
    devflowArtifact: p.to,
    reversaSource: p.from,
    relPath: p.relPath,
    disposition: p.disposition,
    kind: p.kind,
    size: p.size,
    hash: hashFile(p.from),
  }));
  return JSON.stringify({
    schema: 2,
    importedAt: now,
    project: ir.project?.name ?? null,
    provenance: ir.provenance ?? null,
    handoff: ir.handoff?.found ? { relPath: ir.handoff.relPath, rule: ir.handoff.rule, kind: ir.handoff.kind } : null,
    conflicts: ir.conflicts ?? [],
    artifacts,
  }, null, 2);
}
