// scripts/reversa-import/write.mjs
// Escrita NÃO-DESTRUTIVA do resultado do pipeline.
// Guards mantidos: confinamento em .context/, recusa de symlink, confirmação
// antes de sobrescrever. O que mudou: escreve ESPELHO + índice + ADRs, e nunca
// mais .context/workflow/ nem .context/plans/ — isso é do Planning.
import { existsSync, mkdirSync, readFileSync, writeFileSync, lstatSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { isWithinDir } from "../lib/path-guard.mjs";

const MIRROR_BASE = join(".context", "imported", "reversa");

function ensureDir(p) { mkdirSync(dirname(p), { recursive: true }); }

/**
 * Destino canônico de ADRs no projeto de destino.
 * Layout DDC v2 (`.context/engineering/adrs/`) vs v1 (`.context/adrs/`).
 * Detectado, nunca hardcoded — a migração v1→v2 move a pasta.
 */
export function adrDir(destDir) {
  if (existsSync(join(destDir, ".context", "engineering"))) {
    return join(".context", "engineering", "adrs");
  }
  try {
    const v = readFileSync(join(destDir, ".context", ".layout-version"), "utf-8").trim();
    if (Number.parseInt(v, 10) >= 2) return join(".context", "engineering", "adrs");
  } catch { /* sem marcador: v1 */ }
  return join(".context", "adrs");
}

export function writeArtifacts(result, { destDir, confirmOverwrite } = {}) {
  const { artifacts, ir } = result;
  const ctxRoot = join(destDir, ".context");
  const log = [];

  function safeWrite(label, absPath, content) {
    if (!isWithinDir(absPath, ctxRoot)) { log.push([label, "refused-traversal"]); return; }
    if (existsSync(absPath)) {
      if (readFileSync(absPath, "utf-8") === content) { log.push([label, "unchanged"]); return; }
      if (confirmOverwrite && !confirmOverwrite(absPath)) { log.push([label, "skipped"]); return; }
    }
    ensureDir(absPath);
    writeFileSync(absPath, content);
    log.push([label, "written"]);
  }

  // 1. Índice e manifesto do espelho.
  safeWrite("index", join(destDir, MIRROR_BASE, "INDEX.md"), artifacts.index);
  safeWrite("manifest", join(destDir, MIRROR_BASE, "manifest.json"), artifacts.manifest);

  // 2. ADRs convertidos, no layout detectado.
  const adrBase = adrDir(destDir);
  for (const adr of artifacts.adrs) {
    safeWrite(`adr:${adr.filename}`, join(destDir, adrBase, adr.filename), adr.body);
  }

  // 3. Espelho da evidência, preservando a árvore original.
  for (const p of (ir && ir.preservePlan) || []) {
    const label = `mirror:${p.relPath}`;
    if (p.disposition === "linked") { log.push([label, "linked"]); continue; }

    const to = join(destDir, p.to);
    if (!isWithinDir(to, ctxRoot)) { log.push([label, "refused-traversal"]); continue; }

    let st;
    try { st = lstatSync(p.from); } catch { log.push([label, "missing-source"]); continue; }
    if (st.isSymbolicLink()) { log.push([label, "refused-symlink"]); continue; }

    if (existsSync(to)) {
      let igual = false;
      try { igual = readFileSync(to).equals(readFileSync(p.from)); } catch { igual = false; }
      if (igual) { log.push([label, "unchanged"]); continue; }
      if (confirmOverwrite && !confirmOverwrite(to)) { log.push([label, "skipped"]); continue; }
    }
    ensureDir(to);
    copyFileSync(p.from, to);
    log.push([label, "written"]);
  }

  return { log };
}
