// scripts/reversa-import/write.mjs
// Escrita não-destrutiva + contida. Nunca sobrescreve em silêncio (confirmOverwrite)
// e nunca escreve/copia fora de .context/ (isWithinDir). Recusa symlinks na cópia.
import { existsSync, mkdirSync, readFileSync, writeFileSync, lstatSync } from "node:fs";
import { dirname, join } from "node:path";
import { isWithinDir } from "../lib/path-guard.mjs";

function ensureDir(p) { mkdirSync(dirname(p), { recursive: true }); }

export function writeArtifacts(result, { destDir, prdFilename = "imported-prd.md", confirmOverwrite } = {}) {
  const { artifacts, preservePlan } = result;
  const ctxRoot = join(destDir, ".context");
  const ctx = (...s) => join(ctxRoot, ...s);
  const log = [];

  // Escreve conteúdo gerado, com guard de contenção + não-destrutividade.
  function safeWrite(label, path, content) {
    if (!isWithinDir(path, ctxRoot)) { log.push([label, "refused-traversal"]); return; }
    if (existsSync(path)) {
      if (readFileSync(path, "utf-8") === content) { log.push([label, "unchanged"]); return; }
      if (confirmOverwrite && !confirmOverwrite(path)) { log.push([label, "skipped"]); return; }
    }
    ensureDir(path);
    writeFileSync(path, content);
    log.push([label, "written"]);
  }

  safeWrite("prd", ctx("plans", prdFilename), artifacts.prd);
  safeWrite("plans.json", ctx("workflow", "plans.json"), artifacts.plansJson);
  safeWrite("stories", ctx("workflow", "stories.yaml"), artifacts.stories);
  safeWrite("fidelity", ctx("imported", "reversa", "fidelity-report.md"), artifacts.fidelityReport);
  safeWrite("manifest", ctx("imported", "reversa", "manifest.json"), artifacts.manifest);

  for (const adr of artifacts.adrs) {
    safeWrite(adr.filename, ctx("engineering", "adrs", adr.filename), adr.body);
  }
  for (const sk of artifacts.planSkeletons) {
    safeWrite(`plan:${sk.feature}`, ctx("plans", `${sk.feature}.md`), sk.body);
  }

  // Cópia de refs preservadas: recusa symlink, contém o destino, respeita confirmOverwrite.
  for (const p of preservePlan || []) {
    const to = join(destDir, p.to);
    if (!isWithinDir(to, ctxRoot)) { log.push([`preserve:${p.feature}`, "refused-traversal"]); continue; }
    let st;
    try { st = lstatSync(p.from); } catch { log.push([`preserve:${p.feature}`, "missing-source"]); continue; }
    if (st.isSymbolicLink()) { log.push([`preserve:${p.feature}`, "refused-symlink"]); continue; }
    const content = readFileSync(p.from, "utf-8");
    safeWrite(`preserve:${p.feature}`, to, content);
  }
  return { log };
}
