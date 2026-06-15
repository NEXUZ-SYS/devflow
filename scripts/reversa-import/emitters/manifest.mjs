// scripts/reversa-import/emitters/manifest.mjs
// Emitter: manifesto de proveniência. hash sha256 da fonte Reversa por artefato.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

function hashFile(p) {
  try { return createHash("sha256").update(readFileSync(p)).digest("hex"); }
  catch { return null; }
}

export function emitManifest(ir, emitted = []) {
  const artifacts = emitted.map((e) => ({
    devflowArtifact: e.devflowArtifact,
    reversaSource: e.reversaSource ?? null,
    hash: e.reversaSource ? hashFile(e.reversaSource) : null,
  }));
  return JSON.stringify(
    { schema: 1, generatedFrom: ir.project.name ?? null, artifacts, reconcileDecisions: [] },
    null,
    2,
  );
}
