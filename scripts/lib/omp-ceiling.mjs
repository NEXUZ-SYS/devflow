// scripts/lib/omp-ceiling.mjs — teto de tier no omp (D5): o role que o agente teria sem roteamento.
// Ordem: agent_role_defaults[nome].model → model do .context/agents/<nome>.md → activities.execution.
// null = teto ilegível (quem chama não roteia).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseYaml, parseFrontmatter } from "./frontmatter.mjs";
import { agentName, tierOf } from "./model-routing.mjs";
import { readRegularFileSafe, SAFE_READ_MAX_BYTES } from "./safe-read.mjs";

export function ompCeilingTier(pluginRoot, projectRoot, agentType) {
  let roles;
  try { roles = parseYaml(readFileSync(join(pluginRoot, "omp/omp-roles.yaml"), "utf-8")) ?? {}; } catch { return null; }
  const name = agentName(agentType);
  const defaults = roles.agent_role_defaults ?? {};
  const def = Object.hasOwn(defaults, name) ? defaults[name]?.model : undefined;
  if (def !== undefined && def !== null) return tierOf(String(def));
  if (/^[a-z0-9-]+$/.test(name)) {
    const content = readRegularFileSafe(join(projectRoot, ".context/agents", `${name}.md`), SAFE_READ_MAX_BYTES);
    if (content) {
      try {
        const model = parseFrontmatter(content).data?.model;
        if (model !== undefined && model !== null && model !== "") return tierOf(String(model));
      } catch { /* frontmatter inválido: segue para o genérico */ }
    }
  }
  return tierOf(String(roles.activities?.execution ?? ""));
}
