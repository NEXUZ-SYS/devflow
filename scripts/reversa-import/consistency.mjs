// scripts/reversa-import/consistency.mjs
// Plan Consistency Validation (lado DevFlow). Roda depois do map, antes do emit.
// Cada check retorna {id, status:'pass'|'fail', issues:[]}. As issues alimentam
// o loop de reconciliação interativa na skill.
import { validateIR } from "./ir.mjs";

const STUB_LINE_THRESHOLD = 10;

function detectCycle(tasks) {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const state = new Map(); // 0=unvisited,1=visiting,2=done
  let cyclic = false;
  function dfs(id) {
    const t = byId.get(id);
    if (!t) return;
    state.set(id, 1);
    for (const dep of t.dependsOn) {
      const s = state.get(dep) || 0;
      if (s === 1) { cyclic = true; return; }
      if (s === 0) dfs(dep);
    }
    state.set(id, 2);
  }
  for (const t of tasks) if ((state.get(t.id) || 0) === 0) dfs(t.id);
  return cyclic;
}

function waveIndex(milestones, milestoneId) {
  const idx = milestones.findIndex((m) => m.id === milestoneId);
  return idx === -1 ? Infinity : idx;
}

export function validateConsistency(ir) {
  const ids = new Set(ir.tasks.map((t) => t.id));
  const checks = [];

  // dep-graph: deps inexistentes + ciclo
  const depIssues = [];
  for (const t of ir.tasks) {
    for (const d of t.dependsOn) if (!ids.has(d)) depIssues.push(`${t.id}: blocked_by aponta para story inexistente ${d}`);
  }
  if (detectCycle(ir.tasks)) depIssues.push("ciclo detectado no grafo de dependências");
  checks.push({ id: "dep-graph", status: depIssues.length ? "fail" : "pass", issues: depIssues });

  // wave-order: story de onda anterior depende de onda posterior
  const waveIssues = [];
  for (const t of ir.tasks) {
    const tw = waveIndex(ir.milestones, t.milestone);
    for (const d of t.dependsOn) {
      const dep = ir.tasks.find((x) => x.id === d);
      if (dep && waveIndex(ir.milestones, dep.milestone) > tw) {
        waveIssues.push(`${t.id} (${t.milestone}) depende de ${d} (${dep.milestone}) — viola bottom-up`);
      }
    }
  }
  checks.push({ id: "wave-order", status: waveIssues.length ? "fail" : "pass", issues: waveIssues });

  // adr-plan: plano referencia D-NN sem ADR (decisão resolvida) correspondente
  const resolvedIds = new Set(ir.decisions.filter((d) => d.status === "resolved").map((d) => d.id));
  const adrIssues = [];
  for (const t of ir.tasks) {
    const refs = (t.name.match(/D-\d+/g) || []);
    for (const ref of refs) if (!resolvedIds.has(ref)) adrIssues.push(`${t.id} referencia ${ref} sem ADR correspondente`);
  }
  checks.push({ id: "adr-plan", status: adrIssues.length ? "fail" : "pass", issues: adrIssues });

  // coverage: feature sem nenhuma task mapeada
  const slugHit = (f) => ir.tasks.some((t) => t.name.toLowerCase().includes(f.slug.toLowerCase()));
  const covIssues = [];
  for (const f of ir.features) {
    if (!slugHit(f)) covIssues.push(`feature ${f.slug} não tem tarefa correspondente no plano`);
  }
  checks.push({ id: "coverage", status: covIssues.length ? "fail" : "pass", issues: covIssues });

  // spec-stub→story: story derivada de feature cuja spec é stub
  const stubIssues = [];
  for (const f of ir.features) {
    const isStub = (f.specLineCount ?? 0) < STUB_LINE_THRESHOLD;
    if (isStub && slugHit(f)) stubIssues.push(`feature ${f.slug}: story derivada de spec stub — marcar 🔴 "resolver lacuna"`);
  }
  checks.push({ id: "spec-stub", status: stubIssues.length ? "fail" : "pass", issues: stubIssues });

  // SDD↔forward órfão: feature presente num lado e ausente no outro
  const orphanIssues = [];
  for (const f of ir.features) {
    if (f.hasSdd && !f.hasForward) orphanIssues.push(`feature ${f.slug}: SDD sem contraparte forward`);
    if (f.hasForward && !f.hasSdd) orphanIssues.push(`feature ${f.slug}: forward sem contraparte SDD`);
  }
  checks.push({ id: "sdd-forward", status: orphanIssues.length ? "fail" : "pass", issues: orphanIssues });

  // schema: o IR mapeado satisfaz o schema DevFlow (reusa validateIR)
  const v = validateIR(ir);
  checks.push({ id: "schema", status: v.ok ? "pass" : "fail", issues: v.errors });

  return { checks };
}
