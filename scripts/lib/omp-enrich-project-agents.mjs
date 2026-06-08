import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseYaml } from "./frontmatter.mjs";
import { enrichAgentFrontmatter } from "./omp-enrich-agents.mjs";
const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
/** @param {string} projectRoot @returns {string[]} agentes alterados */
export function enrichProjectAgents(projectRoot) {
  const dir = join(projectRoot, ".context/agents");
  if (!existsSync(dir)) return [];
  const roles = parseYaml(readFileSync(join(PLUGIN_ROOT, "omp/omp-roles.yaml"), "utf-8"));
  const defaults = roles.agent_role_defaults ?? {};
  const changed = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".md"))) {
    const name = file.replace(/\.md$/, "");
    const fields = defaults[name];
    if (!fields) continue;
    // enrichAgentFrontmatter espera valores string; o parser pode devolver
    // não-string (ex.: número) — coage para string antes de aplicar.
    const stringified = Object.fromEntries(
      Object.entries(fields).map(([k, v]) => [k, String(v)]),
    );
    const path = join(dir, file);
    writeFileSync(path, enrichAgentFrontmatter(readFileSync(path, "utf-8"), stringified));
    changed.push(name);
  }
  return changed;
}
