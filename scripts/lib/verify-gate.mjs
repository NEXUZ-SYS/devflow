// scripts/lib/verify-gate.mjs — decisão determinística do gate da fase V (D9).
// Só LÊ o ledger. Sem verify: → warn-only (exceto com std `block`: BLOCK). Com verify: →
// fail-closed por requiredSignal; std `block` acrescenta `standards` aos exigidos.
import { join } from "node:path";
import { readVerifyFromPath } from "./devflow-config.mjs";
import { lastEntry } from "./verify-ledger.mjs";
import { treeDigest } from "./verify-tree-digest.mjs";
import { loadEffectiveStandards } from "./standards-engine.mjs";
import { maxLevel } from "./standards-level.mjs";

// ADR-013 v1.1.0: algum standard pode chegar a `block`? Erro ao carregar → true (fail-closed).
export function hasBlockingStandard(root) {
  try { return loadEffectiveStandards(root).some(s => maxLevel(s) === "block"); } catch { return true; }
}

export function evaluateGate({ root, requiredSignals = [] }) {
  let signals;
  try {
    ({ signals } = readVerifyFromPath(join(root, ".context/.devflow.yaml")));
  } catch (e) {
    // R-C6: verify: presente mas inválido/inseguro → BLOCK explícito, nunca warn-only-pass nem crash.
    return { pass: false, warnOnly: false, blocks: [{ signal: "verify", reason: `contrato verify: inválido — fail-closed (${e.message})` }] };
  }
  const blocking = hasBlockingStandard(root);
  if (Object.keys(signals).length === 0) {
    // Com std `block`, a ausência de verify: não cai em warn-only (ADR-013 v1.1.0).
    if (blocking) {
      return { pass: false, warnOnly: false, blocks: [{ signal: "standards", reason: 'há standard de nível block e não existe verify: — declare verify.standards: ["devflow-standards", "gate"] (ADR-013 v1.1.0)' }] };
    }
    return { pass: true, warnOnly: true, blocks: [], note: "nenhum sinal declarado; validação auto-reportada" };
  }
  const required = [...requiredSignals];
  const blocks = [];
  if (blocking && !signals.standards) {
    blocks.push({ signal: "standards", reason: 'há standard de nível block e o verify: não declara o sinal — declare verify.standards: ["devflow-standards", "gate"] (ADR-013 v1.1.0)' });
  }
  if (blocking && signals.standards && !required.includes("standards")) required.push("standards");
  const now = treeDigest(root);
  for (const s of required) {
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
