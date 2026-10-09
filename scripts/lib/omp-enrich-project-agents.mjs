import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseYaml, parseFrontmatter } from "./frontmatter.mjs";
import { enrichAgentFrontmatter } from "./omp-enrich-agents.mjs";
import { readModels } from "./models-config.mjs";
import { toRole, tierOf, capAtCeiling, effectiveConfig } from "./model-routing.mjs";
import { readRegularFileSafe, SAFE_READ_MAX_BYTES } from "./safe-read.mjs";
const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
/** @param {string} projectRoot @returns {string[]} agentes alterados */
export function enrichProjectAgents(projectRoot) {
  const dir = join(projectRoot, ".context/agents");
  if (!existsSync(dir)) return [];
  const roles = parseYaml(readFileSync(join(PLUGIN_ROOT, "omp/omp-roles.yaml"), "utf-8"));
  const defaults = roles.agent_role_defaults ?? {};
  const models = effectiveConfig(
    readModels(readRegularFileSafe(join(projectRoot, ".context/.devflow.yaml"), SAFE_READ_MAX_BYTES) ?? ""),
    process.env.DEVFLOW_MODEL_ROUTING,
  );
  const routes = models.enabled
    ? JSON.parse(readFileSync(join(PLUGIN_ROOT, "assets/model-routing/routes.json"), "utf-8"))
    : null;
  // Teto no omp (D5/D20): o role que o agente teria sem roteamento.
  // Agente sem entrada em agent_role_defaults: o teto é o model do próprio arquivo (nunca sobe).
  const routedRole = (name, content) => {
    if (!routes) return null;
    const want = models.overrides.agents[name] ?? routes.agents?.[name]?.tier;
    const ceilingSrc = defaults[name] ? defaults[name].model : parseFrontmatter(content).data.model;
    const ceiling = tierOf(ceilingSrc);
    return toRole(capAtCeiling(want, ceiling, models.maxTier));
  };
  const changed = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".md"))) {
    const name = file.replace(/\.md$/, "");
    const path = join(dir, file);
    const content = readFileSync(path, "utf-8");
    const role = routedRole(name, content);
    const fields = role ? { ...(defaults[name] ?? {}), model: role } : defaults[name];
    if (!fields) continue;
    // enrichAgentFrontmatter espera valores string; o parser pode devolver
    // não-string (ex.: número) — coage para string antes de aplicar.
    const stringified = Object.fromEntries(
      Object.entries(fields).map(([k, v]) => [k, String(v)]),
    );
    writeFileSync(path, enrichAgentFrontmatter(content, stringified));
    changed.push(name);
  }
  return changed;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = process.argv[2] || process.cwd();
  const changed = enrichProjectAgents(root);
  process.stdout.write(changed.length ? `Agentes omp-enriquecidos: ${changed.join(", ")}\n` : "Nenhum agente para enriquecer (.context/agents ausente ou sem matches).\n");
}
