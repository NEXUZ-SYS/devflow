// scripts/reversa-import/parsers/reconstruction-plan.mjs
// Parser do _reversa_sdd/reconstruction-plan.md → IR.tasks + IR.milestones.
// Tolerante: campos ausentes degradam para [] ou null.

const TASK_RE = /^###\s+Tarefa\s+(\d+)\s+[—-]\s+(.+?)\s*$/;
// Tolerante: casa "**Depende:**" e captura o resto da linha; os ids são extraídos
// depois, aceitando tanto "Tarefas 12 e 13" quanto "T04 (...)".
const DEP_RE = /\*\*Depende:\*\*\s*(.+?)\s*$/i;
const MILE_ROW_RE = /^\|\s*(M\d+)[^|]*\|\s*(T\d+)\s*\|\s*(.+?)\s*\|/;

function pad(n) { return `T${String(n).padStart(2, "0")}`; }

// Extrai ids de dependência de um trecho livre. Prioriza tokens "TNN"; se não
// houver, cai para números soltos (formato "Tarefas 12 e 13").
function extractDepIds(fragment) {
  const explicit = fragment.match(/T\d+/g);
  if (explicit) return explicit.map((t) => pad(t.slice(1)));
  const nums = fragment.match(/\d+/g) || [];
  return nums.map((n) => pad(n));
}

export function parseReconstructionPlan(text = "") {
  const lines = String(text).split("\n");
  const tasks = [];
  const milestones = [];
  let current = null;

  for (const line of lines) {
    const tm = line.match(TASK_RE);
    if (tm) {
      current = { id: pad(tm[1]), name: tm[2].trim(), dependsOn: [], milestone: null, confidence: "captured" };
      tasks.push(current);
      continue;
    }
    const dm = line.match(DEP_RE);
    if (dm && current) {
      current.dependsOn = extractDepIds(dm[1]);
      continue;
    }
    const mm = line.match(MILE_ROW_RE);
    if (mm) {
      milestones.push({ id: mm[1].trim(), after: mm[2].trim(), demo: mm[3].trim() });
    }
  }
  return { tasks, milestones };
}
