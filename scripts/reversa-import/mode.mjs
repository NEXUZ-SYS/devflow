// scripts/reversa-import/mode.mjs
// Detecção de modo do Reversa: forward (greenfield) vs reverse (brownfield).
// Puro, só-leitura. Conservador: só classifica 'reverse' com alta confiança,
// para nunca bloquear um projeto forward legítimo (zero regressão).
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { stripInjection } from "./sanitize.mjs";

const REVERSE_ANALYSIS_ARTIFACTS = [
  "code-analysis.md",
  "erd-complete.md",
  "traceability",
  "revalidation-report.md",
  "confidence-report.md",
  "inventory.md",
];

function listDirs(p) {
  try {
    return readdirSync(p, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith("_"))
      .map((d) => d.name);
  } catch { return []; }
}

function forwardIsEmpty(sourceDir) {
  const fwd = join(sourceDir, "_reversa_forward");
  if (!existsSync(fwd)) return true;
  return listDirs(fwd).length === 0;
}

function anySddSpec(sourceDir) {
  const sdd = join(sourceDir, "_reversa_sdd");
  for (const d of listDirs(sdd)) {
    if (existsSync(join(sdd, d, "spec.md"))) return true;
  }
  return false;
}

function reverseAnalysisSignals(sourceDir) {
  const sdd = join(sourceDir, "_reversa_sdd");
  return REVERSE_ANALYSIS_ARTIFACTS.filter((a) => existsSync(join(sdd, a)));
}

function targetKind(sourceDir) {
  try {
    const state = JSON.parse(readFileSync(join(sourceDir, ".reversa", "state.json"), "utf-8"));
    const kind = state && state.target && state.target.kind;
    return typeof kind === "string" ? kind : null;
  } catch { return null; }
}

export function detectMode(sourceDir) {
  const reasons = [];
  const fwdEmpty = forwardIsEmpty(sourceDir);
  const hasSpec = anySddSpec(sourceDir);
  const analysis = reverseAnalysisSignals(sourceDir);

  if (fwdEmpty && !hasSpec && analysis.length > 0) {
    reasons.push("_reversa_forward/ ausente ou vazio");
    reasons.push("nenhum _reversa_sdd/*/spec.md");
    reasons.push(`artefatos de análise reversa: ${analysis.join(", ")}`);
    const kind = targetKind(sourceDir);
    if (kind) {
      const { text: sanitized } = stripInjection(kind);
      if (sanitized.trim()) {
        reasons.push(`state.target.kind=${sanitized} (reforço informativo)`);
      }
    }
    return { mode: "reverse", reasons };
  }

  if (!fwdEmpty) reasons.push("_reversa_forward/ tem features (forward)");
  else if (hasSpec) reasons.push("há _reversa_sdd/*/spec.md (forward)");
  else reasons.push("sem sinais de análise reversa — tratado como forward");
  return { mode: "forward", reasons };
}
