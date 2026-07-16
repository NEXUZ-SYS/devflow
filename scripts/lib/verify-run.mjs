// scripts/lib/verify-run.mjs — executor de um sinal. Nunca decide o gate (D8).
// Valida o contrato (via parser único), roda via execFile (sem sh -c),
// faz append do resultado no ledger com o treeDigest da árvore ANTES da execução.
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { readVerifyFromPath } from "./devflow-config.mjs";
import { appendEntry } from "./verify-ledger.mjs";
import { treeDigest } from "./verify-tree-digest.mjs";

const CONFIG_REL = ".context/.devflow.yaml";

// Código de produção (não workflow script) → new Date() é permitido para o `at`.
export function runSignal(name, { root, phase = "" } = {}) {
  const { signals } = readVerifyFromPath(join(root, CONFIG_REL));
  const argv = signals[name];
  if (!argv) throw new Error(`sinal '${name}' não declarado em verify:`);
  const digest = treeDigest(root);
  const t0 = process.hrtime.bigint();
  let exit = 0;
  try {
    execFileSync(argv[0], argv.slice(1), { cwd: root, stdio: "inherit" });
  } catch (e) {
    exit = typeof e.status === "number" ? e.status : 1;
  }
  const durationMs = Number((process.hrtime.bigint() - t0) / 1000000n);
  const entry = { signal: name, exit, durationMs, treeDigest: digest, at: new Date().toISOString(), phase };
  appendEntry(root, entry);
  return entry;
}

function main(argv) {
  const name = argv[0];
  const root = argv[1] || process.cwd();
  const phase = argv[2] || "";
  if (!name) { console.error("uso: verify-run <signal> [root] [phase]"); process.exit(2); }
  const r = runSignal(name, { root, phase });
  process.stderr.write(`[verify] ${name}: exit ${r.exit} (${r.durationMs}ms)\n`);
  process.exit(r.exit);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2));
}
