// scripts/reversa-import/emitters/stories.mjs
// Emitter: SÓ a 1ª onda vira stories.yaml (rascunho-a-revisar) no schema do
// runner (scripts/runner-lib.mjs). Demais ondas ficam no PRD como ⬚ pending.
const RULES = [
  ["backend-specialist", /\b(rest|oauth|endpoint|api|service|backend|server|webhook)\b/i],
  ["database-specialist", /\b(rls|schema|migra|postgres|sql|index|banco|database|eav|jsonb)\b/i],
  ["frontend-specialist", /\b(kanban|react|component|ui|tela|token|design|frontend|view|owl)\b/i],
  ["devops-specialist", /\b(\bci\b|cd|deploy|infra|docker|k8s|devops)\b/i],
];

// Retorna {agent, ambiguous}. Ambíguo (2+ categorias) → feature-developer + flag
// p/ reconciliação (§3.2). Zero categorias → feature-developer não-ambíguo.
export function inferAgentDetailed(taskName = "") {
  const matched = RULES.filter(([, re]) => re.test(taskName)).map(([a]) => a);
  if (matched.length === 1) return { agent: matched[0], ambiguous: false };
  return { agent: "feature-developer", ambiguous: matched.length > 1 };
}

export function inferAgent(taskName = "") { return inferAgentDetailed(taskName).agent; }

function yamlEscape(s) { return String(s).replace(/"/g, '\\"'); }

export function emitStories(ir, { now = "1970-01-01T00:00:00.000Z" } = {}) {
  const firstMilestone = ir.milestones[0]?.id ?? null;
  const wave = ir.tasks.filter((t) => firstMilestone == null || t.milestone === firstMilestone);
  const tToS = new Map();
  wave.forEach((t, i) => tToS.set(t.id, `S${i + 1}`));

  const lines = [
    "# stories.yaml — rascunho a revisar (1ª onda importada do Reversa)",
    `feature: "${yamlEscape(ir.project.name || "importado")}"`,
    "autonomy: supervised",
    `created: "${now}"`,
    "escalation:",
    "  max_retries_per_story: 2",
    "  max_consecutive_failures: 3",
    "  security_immediate: true",
    "  upgrade_after_streak: 5",
    "stats:",
    `  total: ${wave.length}`,
    "  completed: 0",
    "  failed: 0",
    "  escalated: 0",
    "  consecutive_failures: 0",
    "  current_autonomy: supervised",
    "stories:",
  ];
  wave.forEach((t, i) => {
    const { agent, ambiguous } = inferAgentDetailed(t.name);
    const blocked = t.dependsOn.filter((d) => tToS.has(d)).map((d) => tToS.get(d));
    lines.push(`  - id: "${tToS.get(t.id)}"`);
    lines.push(`    title: "${yamlEscape(t.name)}"`);
    lines.push(`    description: "${yamlEscape(t.name)} (derivado de ${t.id}; revisar escopo)"`);
    lines.push(`    agent: ${agent}`);
    lines.push(`    priority: ${i + 1}`);
    lines.push(`    status: pending`);
    lines.push(`    attempts: 0`);
    lines.push(`    blocked_by: [${blocked.map((b) => `"${b}"`).join(", ")}]`);
    lines.push(`    provenance: "${t.id}"`);
    lines.push(`    confidence: ${ambiguous ? "inferred" : t.confidence}`);
  });
  return lines.join("\n") + "\n";
}
