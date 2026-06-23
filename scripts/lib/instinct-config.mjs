// scripts/lib/instinct-config.mjs
// Decisão de ativação N2 (ADR-005): o opt-in é o PISO no .context/.devflow.yaml
// (instincts.enabled: true); as env vars só RESTRINGEM (nunca habilitam).
//   precedência: env opt-out (DEVFLOW_INSTINCTS_ENABLED=0 | DEVFLOW_INSTINCT_PROFILE=off)
//                > YAML instincts.enabled/profile
// Leitor mínimo do bloco `instincts:` — tolerante a comentário inline (lição do
// permissions.yaml, cujo parser não removia `# ...` e falhava fechado).
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

async function readInstinctsBlock(cwd) {
  let txt;
  try { txt = await readFile(join(cwd, '.context', '.devflow.yaml'), 'utf-8'); }
  catch { return {}; }
  const cfg = {};
  let inBlk = false;
  for (const raw of txt.split('\n')) {
    const line = raw.replace(/\s+#.*$/, '');          // tira comentário inline
    if (/^instincts:\s*$/.test(line)) { inBlk = true; continue; }
    if (/^\S/.test(line)) { if (inBlk) break; inBlk = false; continue; } // dedent fecha o bloco
    if (!inBlk) continue;
    const m = line.match(/^\s+(enabled|profile):\s*(.+?)\s*$/);
    if (m) cfg[m[1]] = m[2].trim();
  }
  return cfg;
}

export async function isEnabled(cwd = process.cwd(), env = process.env) {
  if (env.DEVFLOW_INSTINCTS_ENABLED === '0') return false;   // opt-out de sessão (restringe)
  if (env.DEVFLOW_INSTINCT_PROFILE === 'off') return false;  // profile off (restringe)
  const cfg = await readInstinctsBlock(cwd);
  return String(cfg.enabled).toLowerCase() === 'true';       // piso: só o YAML habilita
}

export async function profile(cwd = process.cwd(), env = process.env) {
  if (env.DEVFLOW_INSTINCT_PROFILE) return env.DEVFLOW_INSTINCT_PROFILE; // env ajusta/restringe
  const cfg = await readInstinctsBlock(cwd);
  return cfg.profile || 'standard';
}
