// scripts/lib/test-weakening-guard.mjs — impede enfraquecimento de testes vs merge-base.
// Adicionar teste é livre; enfraquecer nunca é silencioso (D7). Override: trailer Weakens-Tests:.
//
// ALCANCE v1 (ADR-013): este guard reconhece SÓ testes JS/.mjs (node:assert, test(/it().
// Em projetos-cliente Python/Odoo ele é INERTE (não casa test_*.py) — o guard do contrato
// (verify-contract-guard) e o gate de V seguem valendo. Generalizar por linguagem = follow-up.
import { execFileSync } from "node:child_process";

const TEST_RE = /(^|\/)(test-[^/]*|[^/]*\.test)\.mjs$/;
// contagem aproximada de "força" do teste: asserts + casos.
const SIGNAL_RE = /\bassert\s*[.(]|\b(?:test|it)\s*\(/g;
const SKIP_RE = /\b(?:test|it|describe)\.skip\s*\(|\bxit\s*\(|\bxtest\s*\(|\btodo:\s*true\b/;

function sh(root, args) {
  try { return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }); }
  catch { return ""; }
}
function countSignals(text) { const m = text.match(SIGNAL_RE); return m ? m.length : 0; }

export function evaluateWeakening({ root, baseRef = "origin/main", ci = false }) {
  const base = sh(root, ["merge-base", "HEAD", baseRef]).trim();
  if (!base) {
    // R-C3: fail-OPEN local (dev sem a base buscada) mas fail-CLOSED em CI —
    // um controle anti-reward-hacking que se desliga em silêncio no árbitro é pior que inútil.
    if (ci) return { blocked: true, violations: [`merge-base com '${baseRef}' não resolve — o guard não pode verificar (fail-closed em CI). Garanta fetch-depth:0 e a base correta.`] };
    return { blocked: false, violations: [], note: `sem merge-base com '${baseRef}' (base rasa? local?) — skip` };
  }

  // Override global: trailer Weakens-Tests: em qualquer commit do range.
  const log = sh(root, ["log", `${base}..HEAD`, "--format=%B"]);
  if (/^Weakens-Tests:\s*\S/m.test(log)) return { blocked: false, violations: [], note: "override por trailer" };

  const baseFiles = sh(root, ["ls-tree", "-r", "--name-only", base]).split("\n").filter(f => TEST_RE.test(f));
  const violations = [];
  for (const f of baseFiles) {
    const before = sh(root, ["show", `${base}:${f}`]);
    let after = "";
    try { after = execFileSync("git", ["-C", root, "show", `HEAD:${f}`], { encoding: "utf8", stdio: ["ignore","pipe","ignore"] }); }
    catch { violations.push(`${f}: arquivo de teste removido`); continue; }
    if (SKIP_RE.test(after) && !SKIP_RE.test(before)) violations.push(`${f}: teste marcado como skip/todo`);
    const cb = countSignals(before), ca = countSignals(after);
    if (ca < cb) violations.push(`${f}: força de teste caiu (${cb}→${ca} asserts/casos)`);
  }
  return { blocked: violations.length > 0, violations };
}

function main(argv) {
  const root = (argv.find(a => a.startsWith("--root="))?.split("=")[1]) || ".";
  const baseRef = (argv.find(a => a.startsWith("--base-ref="))?.split("=")[1]) || "origin/main";
  const ci = argv.includes("--ci") || process.env.CI === "true";
  const r = evaluateWeakening({ root, baseRef, ci });
  if (r.blocked) {
    console.error("✗ enfraquecimento de testes detectado:");
    for (const v of r.violations) console.error("  " + v);
    console.error("  (override: adicione um trailer 'Weakens-Tests: <justificativa>' ao commit)");
    process.exit(1);
  }
  console.log(`✓ sem enfraquecimento de testes${r.note ? " ("+r.note+")" : ""}`);
  process.exit(0);
}
if (import.meta.url === `file://${process.argv[1]}`) main(process.argv.slice(2));
