// scripts/reversa-import/ir.mjs
// Modelo intermediário (IR) normalizado: a fronteira entre parsers (input Reversa)
// e emitters (output DevFlow). Adicionar tipo de input = novo parser; adicionar
// tipo de output = novo emitter. Nenhum lado conhece o outro.

const VERDICTS = new Set(["green", "yellow", "red"]);

export function createIR() {
  return {
    project: { name: null, language: null, sourceType: null, target: null, declaredPhase: null },
    readiness: { global: null, perFeature: {} }, // verdict por feature + global
    tasks: [],        // { id, name, dependsOn:[], milestone, confidence }
    milestones: [],   // { id, after, demo }
    features: [],     // { slug, requirements, specPath, specLineCount, hasForward, hasSdd, screens, interfaces, markers }
    decisions: [],    // { id, title, status, confidence, body }
    gaps: [],         // { feature, text }
    preserve: [],     // { sourcePath, destSubpath, kind, feature }
    provenance: [],   // { devflowArtifact, reversaSource, hash } — preenchido por emitters
  };
}

export function validateIR(ir) {
  const errors = [];
  if (!ir || typeof ir !== "object") return { ok: false, errors: ["IR ausente ou não-objeto"] };

  for (const [i, t] of (ir.tasks || []).entries()) {
    if (!t.id) errors.push(`tasks[${i}]: falta id`);
    if (!Array.isArray(t.dependsOn)) errors.push(`tasks[${i}].dependsOn deve ser array`);
  }
  for (const [i, f] of (ir.features || []).entries()) {
    if (!f.slug) errors.push(`features[${i}]: falta slug`);
  }
  if (ir.readiness?.global != null && !VERDICTS.has(ir.readiness.global)) {
    errors.push(`readiness.global inválido: ${ir.readiness.global}`);
  }
  for (const [feat, v] of Object.entries(ir.readiness?.perFeature || {})) {
    if (!VERDICTS.has(v)) errors.push(`readiness.perFeature.${feat} inválido: ${v}`);
  }
  return { ok: errors.length === 0, errors };
}

export { VERDICTS };
