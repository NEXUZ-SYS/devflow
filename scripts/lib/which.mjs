// which — resolve um binário no PATH. Extraído de scripts/doctor.mjs para ser
// compartilhado: o run-checks precisa do mesmo comportamento, e um stub que
// devolve false faria o mempalace-env acusar "binário ausente" numa máquina
// onde ele está instalado.
import { existsSync, statSync } from "node:fs";
import { join, delimiter } from "node:path";

export function which(bin) {
  if (!bin || /[/\\]/.test(bin)) return bin ? existsSync(bin) : false;
  const dirs = (process.env.PATH || "").split(delimiter).filter(Boolean);
  for (const d of dirs) {
    const p = join(d, bin);
    try {
      const st = statSync(p);
      if (st.isFile() && (st.mode & 0o111)) return true;
    } catch { /* segue */ }
  }
  return false;
}
