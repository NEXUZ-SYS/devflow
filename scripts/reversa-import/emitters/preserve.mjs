// scripts/reversa-import/emitters/preserve.mjs
// Emitter: planeja a cópia FIEL das refs ricas Reversa para o namespace
// regenerável .context/imported/reversa/. Retorna plano {from,to}; a cópia
// efetiva (não-destrutiva) é executada pelo pipeline/skill.
// Os paths-fonte (specPath/screensPath) vêm do IR já resolvidos a partir do
// NOME REAL do diretório SDD — nunca reconstruídos do slug (que é sanitizado).
import { join } from "node:path";

export function planPreserve(ir) {
  const plan = [];
  const base = join(".context", "imported", "reversa");
  for (const f of ir.features) {
    if (f.specPath) plan.push({ from: f.specPath, to: join(base, f.slug, "spec.md"), kind: "spec", feature: f.slug });
    if (f.screensPath) plan.push({ from: f.screensPath, to: join(base, f.slug, "screens.md"), kind: "screens", feature: f.slug });
  }
  return plan;
}
