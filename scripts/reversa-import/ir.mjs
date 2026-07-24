// scripts/reversa-import/ir.mjs
// IR de EVIDÊNCIA (não mais IR de plano).
// O importador carrega o que existe e quanto se confia nisso; o plano nasce na
// fase P do PREVC. Não há mais tasks/milestones/features aqui.
const KIND_SOURCES = new Set(["frontmatter", "manifest", "handoff-table", "heuristic"]);

export function createIR() {
  return {
    project: { name: null, language: null, sourceType: null, target: null, declaredPhase: null },
    provenance: { mode: null, modeReasons: [], reversaVersion: null },
    handoff: null,      // saída de resolveHandoff
    artifacts: [],      // saída de classifyArtifacts
    ledger: null,       // saída de buildLedger
    adrSources: [],     // subconjunto de artifacts com kind === "adr"
    preservePlan: [],   // saída de planPreserve
    conflicts: [],      // { id, detail }
  };
}

export function validateIR(ir) {
  const errors = [];
  if (!ir || typeof ir !== "object") return { ok: false, errors: ["IR ausente ou não-objeto"] };

  if (!Array.isArray(ir.artifacts)) errors.push("artifacts deve ser array");
  else {
    for (const [i, a] of ir.artifacts.entries()) {
      if (!a.relPath) errors.push(`artifacts[${i}]: falta relPath`);
      if (!a.kind) errors.push(`artifacts[${i}]: falta kind`);
      if (!KIND_SOURCES.has(a.kindSource)) {
        errors.push(`artifacts[${i}]: kindSource inválido: ${a.kindSource}`);
      }
    }
  }
  if (ir.handoff != null && typeof ir.handoff.found !== "boolean") {
    errors.push("handoff.found deve ser booleano quando handoff existe");
  }
  if (!Array.isArray(ir.conflicts)) errors.push("conflicts deve ser array");
  return { ok: errors.length === 0, errors };
}

export { KIND_SOURCES };
