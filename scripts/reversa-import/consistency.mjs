// scripts/reversa-import/consistency.mjs
// Consistência da EVIDÊNCIA (antes: do IR de plano derivado).
// Nada aqui bloqueia: divergências viram `conflicts`, que a skill apresenta
// como PRIMEIRA PAUTA do brainstorming. Reconciliar é trabalho do Planning,
// com humano no loop — não de um emitter.
import { basename } from "node:path";
import { validateIR } from "./ir.mjs";

const UNTYPED_THRESHOLD = 0.9; // >90% heurístico = a fonte não tipou nada

function fail(id, issues) { return { id, status: issues.length ? "fail" : "pass", issues }; }

export function validateConsistency(ir) {
  const artifacts = ir.artifacts || [];
  const handoff = ir.handoff || null;
  const names = new Set(artifacts.map((a) => basename(a.relPath)));
  const rels = new Set(artifacts.map((a) => a.relPath));
  const checks = [];
  const conflicts = [];

  // 1. Artefatos que o handoff declara produzidos existem no corpus?
  const missingArtifacts = [];
  for (const row of (handoff && handoff.artifactTable) || []) {
    const nome = basename(row.artifact);
    if (!names.has(nome)) missingArtifacts.push(`handoff declara \`${row.artifact}\` (${row.producedBy}), ausente no corpus`);
  }
  checks.push(fail("handoff-artifacts", missingArtifacts));

  // 2. A ordem de leitura aponta para arquivos que existem?
  const missingReading = [];
  for (const nome of (handoff && handoff.readingOrder) || []) {
    if (!names.has(basename(nome))) missingReading.push(`ordem de leitura cita \`${nome}\`, ausente no corpus`);
  }
  checks.push(fail("reading-order", missingReading));

  // 3. Planos concorrentes: âncora de migração + reconstruction-plan vivos ao mesmo tempo.
  const planIssues = [];
  const temRecon = rels.has("_reversa_sdd/reconstruction-plan.md");
  const ancoraEhOutra = handoff?.found && handoff.rule !== "reconstruction-plan";
  if (temRecon && ancoraEhOutra) {
    const detalhe = `\`${handoff.relPath}\` é a âncora, mas \`_reversa_sdd/reconstruction-plan.md\` `
      + "coexiste e não é declarado superado. São pipelines diferentes, não versões — "
      + "'mais novo vence' seria adivinhação. Reconciliar no Planning.";
    planIssues.push(detalhe);
    conflicts.push({ id: "competing-plans", detail: detalhe });
  }
  checks.push(fail("competing-plans", planIssues));

  // 4. Quanto da classificação é palpite nosso?
  const untypedIssues = [];
  if (artifacts.length) {
    const heur = artifacts.filter((a) => a.kindSource === "heuristic").length;
    const ratio = heur / artifacts.length;
    if (ratio > UNTYPED_THRESHOLD) {
      untypedIssues.push(
        `${heur}/${artifacts.length} artefatos (${Math.round(ratio * 100)}%) classificados por heurística — `
        + "a fonte não declarou tipos. Conferir o INDEX antes de confiar na classificação.",
      );
    }
  }
  checks.push(fail("untyped-ratio", untypedIssues));

  // 5. Schema do IR.
  const v = validateIR({ artifacts, handoff, conflicts: [] });
  checks.push({ id: "schema", status: v.ok ? "pass" : "fail", issues: v.errors });

  return { checks, conflicts };
}
