// scripts/lib/workflow-resume.mjs — retomada de workflow no SessionStart (ADR-014).
// FRONTEIRA: o prevc.json NÃO é confiável (um repo hostil pode commitá-lo; o clone
// o materializa). Tudo que sai daqui é dado CONTIDO e EMOLDURADO, nunca instrução.
// NUNCA escreve; NUNCA lança (o hook roda em toda sessão — um crash aqui quebra tudo).
import { readFileSync, lstatSync, realpathSync } from "node:fs";
import { join, sep } from "node:path";

const STATE_REL = ".context/runtime/workflows/prevc.json";
const HANDOFF_REL = ".context/workflow/.checkpoint/handoff.md";
const PHASE_ORDER = ["P", "R", "E", "V", "C"];
const MAX_BYTES = 512 * 1024;

// Containment em duas camadas contra symlink (ADR-004):
//  (1) lstat no componente FINAL sem seguir — recusa qualquer symlink de arquivo
//      (não há razão legítima para o prevc.json/handoff ser symlink).
//  (2) realpath — o caminho REAL tem de ficar sob o REAL do root, o que recusa o
//      symlink de DIRETÓRIO intermediário (cujo componente final é um arquivo real,
//      invisível ao lstat, mas que escapa do root para ler algo sensível).
// Recusa também não-regular e arquivo gigante. Ler via node:fs escaparia do
// avaliador de permissões — por isso nunca seguimos link.
function statContained(root, rel) {
  try {
    const target = join(root, rel);
    const lst = lstatSync(target);
    if (lst.isSymbolicLink() || !lst.isFile() || lst.size > MAX_BYTES) return null;
    const base = realpathSync(root);
    const abs = realpathSync(target);
    if (abs !== base && !abs.startsWith(base + sep)) return null;   // escapou via symlink de diretório
    return { abs };
  } catch { return null; }
}

export function readWorkflowState(root) {
  const c = statContained(root, STATE_REL);
  if (!c) return null;
  let d;
  try { d = JSON.parse(readFileSync(c.abs, "utf8")); } catch { return null; }
  const p = d?.status?.project;
  if (!p?.name) return null;
  const phases = {};
  for (const [k, v] of Object.entries(d?.status?.phases ?? {})) {
    const outs = Array.isArray(v?.outputs) ? v.outputs : [];
    phases[k] = {
      status: typeof v?.status === "string" ? v.status : "unknown",
      outputs: outs.map(o => (typeof o === "string" ? o : o?.path ?? "")).filter(Boolean),
    };
  }
  return { name: p.name, scale: p.scale, phase: p.current_phase, plan: p.plan ?? null, started: p.started ?? null, phases };
}

// exportado para os TGs seguintes
export { statContained, STATE_REL, HANDOFF_REL, PHASE_ORDER };
