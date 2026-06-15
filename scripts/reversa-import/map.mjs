// scripts/reversa-import/map.mjs
// Estágio `map`: atribui cada tarefa a uma onda (marco) conforme thresholds `after`.
// Função pura, testável. Sinaliza degradação quando o mapeamento colapsa na 1ª onda.

function num(x) { return parseInt(String(x).replace(/\D/g, ""), 10); }

// Atribui a tarefa TNN à 1ª onda (por after crescente) cujo `after` cobre seu número.
export function assignMilestone(taskId, milestones) {
  if (!milestones.length) return null;
  const n = num(taskId);
  const ordered = milestones
    .map((m) => ({ id: m.id, after: num(m.after) }))
    .filter((m) => !Number.isNaN(m.after))
    .sort((a, b) => a.after - b.after);
  if (!ordered.length) return milestones[0].id; // nenhum after parseável → degrada p/ 1º
  if (Number.isNaN(n)) return ordered[0].id;
  for (const m of ordered) if (n <= m.after) return m.id;
  return ordered[ordered.length - 1].id;
}

// Mapeia todas as tarefas; degraded=true quando há marcos mas nenhum after parseável
// (todas caem no 1º marco — a skill deve avisar o usuário).
export function mapTasksToMilestones(tasks, milestones) {
  const anyParseable = milestones.some((m) => !Number.isNaN(num(m.after)));
  const degraded = milestones.length > 0 && !anyParseable;
  const mapped = tasks.map((t) => ({ ...t, milestone: assignMilestone(t.id, milestones) }));
  return { tasks: mapped, degraded };
}
