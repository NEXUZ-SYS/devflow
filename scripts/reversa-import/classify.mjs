// scripts/reversa-import/classify.mjs
// Classificação de artefatos em DOIS NÍVEIS.
// Autoritativo (preferido): frontmatter kind: → migration/.state.json →
// tabela de artefatos do handoff. Heurístico só para o que sobrou sem tipo.
// Todo artefato carrega kindSource, tornando a classificação auditável.
//
// Isto substitui listFeatureDirs(): nenhum diretório "vira feature". Foi essa
// premissa que produzia features-fantasma (7, depois 8 quando screens/ surgiu).
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep, basename } from "node:path";
import { frontmatterValue } from "./handoff.mjs";

const TEXT_EXT = new Set([".md", ".yml", ".yaml", ".json", ".feature", ".txt"]);
const HEAD_BYTES = 2048;

// Nomes de arquivo de análise reversa, na raiz do _reversa_sdd.
const ANALYSIS_FILES = new Set([
  "architecture.md", "domain.md", "erd-complete.md", "data-dictionary.md",
  "state-machines.md", "permissions.md", "inventory.md", "code-analysis.md",
  "dependencies.md", "confidence-report.md", "revalidation-report.md",
  "gaps.md", "questions.md",
]);

// Diretórios cujo conteúdo é análise/referência, nunca unidade de trabalho.
const ANALYSIS_DIRS = new Set(["traceability", "user-stories", "flowcharts", "screenshots", "screens"]);
const PRODUCT_DIRS = new Set(["user-stories"]);

function ext(p) { const i = p.lastIndexOf("."); return i === -1 ? "" : p.slice(i).toLowerCase(); }
function toPosix(p) { return p.split(sep).join("/"); }

function walk(root) {
  const out = [];
  const stack = [root];
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try { entries = readdirSync(cur, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const p = join(cur, e.name);
      if (e.isSymbolicLink()) continue;   // nunca segue link (mesma regra do write.mjs)
      if (e.isDirectory()) { stack.push(p); continue; }
      if (e.isFile()) out.push(p);
    }
  }
  return out;
}

function readHead(p) {
  try {
    if (statSync(p).size > 1024 * 1024) return "";
    return readFileSync(p, "utf-8").slice(0, HEAD_BYTES);
  } catch { return ""; }
}

/** Mapa relPath-dentro-de-migration → true, vindo do .state.json. */
function manifestIndex(sddDir) {
  const p = join(sddDir, "migration", ".state.json");
  if (!existsSync(p)) return new Map();
  let data;
  try { data = JSON.parse(readFileSync(p, "utf-8")); } catch { return new Map(); }
  const map = new Map();
  for (const [key, meta] of Object.entries(data.artifacts || {})) {
    map.set(key, meta && typeof meta === "object" ? meta : {});
  }
  return map;
}

function heuristicKind(relPosix) {
  const name = basename(relPosix);
  const parts = relPosix.split("/");
  if (ext(name) === ".feature") return "test-input";
  if (parts.includes("adrs")) return "adr";
  if (name === "reconstruction-plan.md") return "plan-draft";
  if (parts.some((d) => ANALYSIS_DIRS.has(d))) return "analysis";
  if (parts.includes("_plan")) return "plan-draft";
  if (parts.includes("_decisions")) return "decision";
  if (parts.includes("_review")) return "review";
  if (parts.includes("migration")) return "design";
  if (ANALYSIS_FILES.has(name)) return "analysis";
  if (name === "spec.md" || name === "screens.md") return "spec-unit";
  if (["requirements.md", "design.md", "tasks.md", "questions.md", "decisions.md", "roadmap.md", "actions.md"]
      .includes(name)) return "spec-unit";
  return "unknown";
}

function layerFor(relPosix, kind) {
  const parts = relPosix.split("/");
  if (parts.some((d) => PRODUCT_DIRS.has(d))) return "product";
  if (kind === "adr" || kind === "analysis" || kind === "design" || kind === "decision") return "engineering";
  if (kind === "spec-unit") return "engineering";
  return null;
}

export function classifyArtifacts(sourceDir, { handoff } = {}) {
  const roots = [join(sourceDir, "_reversa_sdd"), join(sourceDir, "_reversa_forward")]
    .filter((d) => existsSync(d));
  const sdd = join(sourceDir, "_reversa_sdd");
  const manifest = manifestIndex(sdd);
  const migrationRoot = join(sdd, "migration");
  // As chaves do .state.json têm bases MISTAS no Reversa real: parity_tests/ é
  // relativo a migration/, mas screens/ é relativo a _reversa_sdd/. Aceitamos as
  // duas — daí `manifestHas` tentar relativo a migration/ e a sdd/.
  const manifestHas = (p) => {
    for (const base of [migrationRoot, sdd]) {
      const rel = toPosix(relative(base, p));
      if (!rel.startsWith("..") && manifest.has(rel)) return true;
    }
    return false;
  };

  // Tabela do handoff: nome de artefato → produtor (segunda fonte autoritativa).
  const fromTable = new Map();
  for (const row of (handoff && handoff.artifactTable) || []) {
    fromTable.set(row.artifact, row);
  }

  const out = [];
  for (const root of roots) {
    for (const p of walk(root)) {
      const relPosix = toPosix(relative(sourceDir, p));
      let size = 0;
      try { size = statSync(p).size; } catch { /* ilegível: mantém 0 */ }

      let kind = null;
      let kindSource = null;

      // Nível 1a — frontmatter kind:
      if (ext(p) === ".md") {
        const k = frontmatterValue(readHead(p), "kind");
        if (k) { kind = k; kindSource = "frontmatter"; }
      }

      // Nível 1b — .state.json do migration
      if (!kind && manifestHas(p)) {
        kind = ext(p) === ".feature" ? "test-input" : "design";
        kindSource = "manifest";
      }

      // Nível 1c — tabela de artefatos do handoff
      if (!kind && fromTable.has(basename(relPosix))) {
        kind = ext(p) === ".feature" ? "test-input" : "design";
        kindSource = "handoff-table";
      }

      // Nível 2 — heurística
      if (!kind) { kind = heuristicKind(relPosix); kindSource = "heuristic"; }

      out.push({ path: p, relPath: relPosix, kind, kindSource, layer: layerFor(relPosix, kind), size });
    }
  }
  out.sort((a, b) => a.relPath.localeCompare(b.relPath));
  return out;
}
