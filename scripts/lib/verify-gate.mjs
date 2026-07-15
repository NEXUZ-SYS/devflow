// scripts/lib/verify-gate.mjs — decisão determinística do gate da fase V (D9).
// Só LÊ o ledger. Sem verify: → warn-only. Com verify: → fail-closed por requiredSignal.
import { join } from "node:path";
import { readVerifyFromPath } from "./devflow-config.mjs";
import { lastEntry } from "./verify-ledger.mjs";
import { treeDigest } from "./verify-tree-digest.mjs";

export function evaluateGate({ root, requiredSignals = [] }) {
  let signals;
  try {
    ({ signals } = readVerifyFromPath(join(root, ".context/.devflow.yaml")));
  } catch (e) {
    // R-C6: verify: presente mas inválido/inseguro → BLOCK explícito, nunca warn-only-pass nem crash.
    return { pass: false, warnOnly: false, blocks: [{ signal: "verify", reason: `contrato verify: inválido — fail-closed (${e.message})` }] };
  }
  if (Object.keys(signals).length === 0) {
    return { pass: true, warnOnly: true, blocks: [], note: "nenhum sinal declarado; validação auto-reportada" };
  }
  const now = treeDigest(root);
  const blocks = [];
  for (const s of requiredSignals) {
    const e = lastEntry(root, s);
    if (!e) { blocks.push({ signal: s, reason: `sem observação: V afirmaria '${s}' sem rodar o sinal` }); continue; }
    if (e.treeDigest !== now) { blocks.push({ signal: s, reason: `prova vencida para '${s}': re-rode o sinal (árvore mudou)` }); continue; }
    if (e.exit !== 0) { blocks.push({ signal: s, reason: `sinal vermelho: '${s}' saiu com exit ${e.exit}` }); continue; }
  }
  return { pass: blocks.length === 0, warnOnly: false, blocks };
}

function main(argv) {
  const root = argv[0] || process.cwd();
  const required = (argv[1] || "").split(",").map(s => s.trim()).filter(Boolean);
  const r = evaluateGate({ root, requiredSignals: required });
  if (r.warnOnly) { console.log(`⚠ ${r.note}`); process.exit(0); }
  if (!r.pass) { console.error("✗ gate de V bloqueado:"); for (const b of r.blocks) console.error(`  ${b.signal}: ${b.reason}`); process.exit(1); }
  console.log("✓ gate de V: todos os requiredSignals observados verdes com digest atual"); process.exit(0);
}
if (import.meta.url === `file://${process.argv[1]}`) main(process.argv.slice(2));
