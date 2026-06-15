// scripts/reversa-import/emitters/prd.mjs
// Emitter: IR → PRD faseado markdown. Fases = marcos; tarefas = itens de escopo
// com dependências preservadas. 1ª fase ⏳, demais ⬚ pending.
const CONF_GLYPH = { official: "🟦", captured: "🟢", inferred: "🟡", gap: "🔴" };

export function emitPrd(ir) {
  const name = ir.project.name || "projeto-importado";
  const out = [];
  out.push(`# PRD — ${name}`);
  out.push("");
  out.push("> Gerado pelo importador Reversa → DevFlow. Fases derivadas dos marcos do reconstruction-plan.");
  out.push("");

  const milestones = ir.milestones.length
    ? ir.milestones
    : [{ id: "M1", after: null, demo: "escopo único" }];

  milestones.forEach((m, i) => {
    const status = i === 0 ? "⏳ Em andamento" : "⬚ Pending";
    out.push(`## ${m.id} — ${m.demo}  ${status}`);
    out.push("");
    const tasks = ir.tasks.filter((t) => t.milestone === m.id);
    if (tasks.length === 0) out.push("_(sem tarefas mapeadas para este marco)_");
    for (const t of tasks) {
      const glyph = CONF_GLYPH[t.confidence] || "";
      const dep = t.dependsOn.length ? ` — depende de ${t.dependsOn.join(", ")}` : "";
      out.push(`- ${glyph} **${t.id}** ${t.name}${dep}`);
    }
    out.push("");
  });
  return out.join("\n");
}
