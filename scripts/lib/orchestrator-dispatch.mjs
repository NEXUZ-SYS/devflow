// Helpers puros para o despacho paralelo via AO. Consome a lib de ondas.
import { computeWaves } from "./orchestrator-waves.mjs";

/** Normaliza stories do stories.yaml para o formato das libs de ondas (blocked_by → depends_on). */
export function normalizeStories(stories) {
  return (stories || []).map((s) => ({
    ...s,
    depends_on: s.depends_on || s.blocked_by || [],
  }));
}

/** Sanitiza um nome para chave YAML / id de sessão (kebab seguro).
 * Remove hífen, ponto e underscore das bordas para não gerar chave YAML inválida. */
export function sanitizeProjectId(name) {
  const slug = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[-._]+|[-._]+$/g, "");
  return slug || "projeto";
}

/** Cap de largura de onda da config; Infinity se ausente/<=0. */
export function maxWidthFrom(config) {
  const w = config && config.orchestrator && config.orchestrator.maxWaveWidth;
  return typeof w === "number" && w > 0 ? w : Infinity;
}

/** Nº de stories na primeira onda (independentes) — entrada da heurística shouldParallelize. */
export function independentCount(stories) {
  const norm = normalizeStories(stories);
  if (norm.length === 0) return 0;
  return computeWaves(norm)[0].length;
}
