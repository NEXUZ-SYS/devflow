// scripts/lib/context-paths.mjs
// Única fonte dos paths canônicos do .context/ (layout v2 — DDC knowledge layer).
// Todo lib/hook que precise de um path do .context/ deve perguntar aqui.
import { existsSync } from "node:fs";
import { join } from "node:path";

export const LAYOUT_VERSION = 2;

// Mapa de cada subsistema/camada para seu path canônico relativo ao projeto.
export function contextPaths(projectRoot) {
  const c = (...segs) => join(projectRoot, ".context", ...segs);
  return {
    root: c(),
    // dotcontext-managed (INTOCADOS — listados só para referência)
    docs: c("docs"),
    agents: c("agents"),
    skills: c("skills"),
    plans: c("plans"),
    // camadas de conhecimento DDC
    business: c("business"),
    product: c("product"),
    operations: c("operations"),
    engineering: c("engineering"),
    // subsistemas DevFlow-native sob engineering/
    adrs: c("engineering", "adrs"),
    standards: c("engineering", "standards"),
    standardsMachine: c("engineering", "standards", "machine"),
    stacks: c("engineering", "stacks"),
    templates: c("engineering", "templates"),
    // metadados
    layoutVersionFile: c(".layout-version"),
  };
}

// Para subsistemas relocados, lista os paths de LEITURA: canonical primeiro,
// depois fallbacks legados que existam no disco (tolerância pré-migração).
const LEGACY = {
  adrs: [["adrs"], ["docs", "adrs"]],
  standards: [["standards"]],
  stacks: [["stacks"]],
  templates: [["templates"]],
};

export function resolveReadPaths(projectRoot, key) {
  const p = contextPaths(projectRoot);
  const canonical = p[key];
  if (!canonical) throw new Error(`context-paths: unknown key '${key}'`);
  const reads = [canonical];
  for (const segs of LEGACY[key] ?? []) {
    const legacy = join(projectRoot, ".context", ...segs);
    if (legacy !== canonical && existsSync(legacy)) reads.push(legacy);
  }
  return reads;
}
