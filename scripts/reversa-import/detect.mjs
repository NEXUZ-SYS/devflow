// scripts/reversa-import/detect.mjs
// Detecção tolerante: .reversa/ é obrigatório; forward/sdd são esperados mas
// ausências viram "missing" (degradação graciosa), não erro fatal.
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

export function detectReversa(sourceDir) {
  const reasons = [];
  const missing = [];
  const artifacts = [];

  const reversaDir = join(sourceDir, ".reversa");
  const hasReversa = existsSync(reversaDir);
  if (!hasReversa) reasons.push("ausente: .reversa/ (diretório de controle do Reversa)");

  if (hasReversa) {
    for (const f of ["state.json", "plan.md", "soul.md"]) {
      if (existsSync(join(reversaDir, f))) artifacts.push(f);
      else missing.push(`.reversa/${f}`);
    }
  }
  const hasSdd = existsSync(join(sourceDir, "_reversa_sdd"));
  const hasForward = existsSync(join(sourceDir, "_reversa_forward"));
  if (!hasSdd) missing.push("_reversa_sdd");
  if (!hasForward) missing.push("_reversa_forward");

  // Critério mínimo: .reversa/ presente E (sdd OU forward).
  const isReversa = hasReversa && (hasSdd || hasForward);
  if (hasReversa && !hasSdd && !hasForward) {
    reasons.push("ausente: nenhum de _reversa_sdd/ ou _reversa_forward/");
  }

  return { isReversa, artifacts, missing, reasons, hasForward, hasSdd };
}
