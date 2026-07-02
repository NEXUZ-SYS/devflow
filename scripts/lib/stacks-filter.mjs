// scripts/lib/stacks-filter.mjs — detecta deps do projeto e filtra os stacks
// mesclados (saída de loadStacksMerged) para o(s) framework(s) realmente usado(s).
//
// Regras de borda (decididas no design da Fase 7):
//   - node            → incluído sempre que houver package.json (runtime base JS)
//   - harness-engineering, gemini → NUNCA auto-incluídos (só via eject/override
//     ou keyword-match feito pelo skill stack-filter, não aqui)
//   - postgres/bigquery → detectados via pacote-cliente no alias map
//
// Per Dependency Policy: pure node:* — sem rede.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const NEVER_AUTO = new Set(["harness-engineering", "gemini"]);

// Aliases curados onde o nome do stack difere do pacote instalável.
// (Complementam o frontmatter `package:` que o loader pode anexar como fw.package.)
const CURATED_ALIAS = {
  tailwind: ["tailwindcss"],
  "vercel-ai-sdk": ["ai"],
  postgres: ["pg", "postgres", "drizzle-orm", "@prisma/client"],
  bigquery: ["@google-cloud/bigquery"],
};

// Lê nomes de dependências de package.json / pyproject.toml / go.mod / Cargo.toml.
export function detectProjectDeps(projectRoot) {
  const deps = new Set();
  const pkg = join(projectRoot, "package.json");
  const hasPackageJson = existsSync(pkg);
  if (hasPackageJson) {
    try {
      const j = JSON.parse(readFileSync(pkg, "utf-8"));
      for (const k of Object.keys({ ...(j.dependencies || {}), ...(j.devDependencies || {}) })) {
        deps.add(k);
      }
    } catch {
      /* package.json malformado → ignora */
    }
  }
  const py = join(projectRoot, "pyproject.toml");
  if (existsSync(py)) {
    for (const m of readFileSync(py, "utf-8").matchAll(/^\s*([A-Za-z0-9._-]+)\s*=/gm)) {
      deps.add(m[1].toLowerCase());
    }
  }
  const gomod = join(projectRoot, "go.mod");
  if (existsSync(gomod)) {
    for (const m of readFileSync(gomod, "utf-8").matchAll(/^\s*([\w./-]+)\s+v/gm)) deps.add(m[1]);
  }
  const cargo = join(projectRoot, "Cargo.toml");
  if (existsSync(cargo)) {
    for (const m of readFileSync(cargo, "utf-8").matchAll(/^\s*([A-Za-z0-9._-]+)\s*=/gm)) deps.add(m[1]);
  }
  return { deps, hasPackageJson };
}

/**
 * Seleção **nível de projeto** (project-level) por design: casa os stacks pelas
 * DEPENDÊNCIAS declaradas do projeto (package.json/pyproject/go.mod/Cargo.toml +
 * alias map), não pela semântica da task. Responde "quais stacks o projeto usa",
 * não "quais stacks esta task específica toca" — a relevância por task é papel
 * dos filtros de knowledge/std (knowledge-filter/adr-filter), não deste. Por isso
 * o resultado é invariante à task: mesma resposta para qualquer task no mesmo projeto.
 *
 * @param merged  saída de loadStacksMerged ({ frameworks })
 * @param projectRoot
 * @param opts.alias  override do alias map (default: CURATED_ALIAS + fw.package)
 * @returns { matched: [{lib, ...fw}], reason: {<lib>: "dep:<pkg>"|"runtime:package.json"} }
 */
export function filterStacks(merged, projectRoot, opts = {}) {
  const { deps, hasPackageJson } = detectProjectDeps(projectRoot);
  const alias = opts.alias || CURATED_ALIAS;
  const matched = [];
  const reason = {};
  for (const [lib, fw] of Object.entries(merged.frameworks || {})) {
    if (lib === "node") {
      if (hasPackageJson) {
        matched.push({ lib, ...fw });
        reason[lib] = "runtime:package.json";
      }
      continue;
    }
    if (NEVER_AUTO.has(lib)) continue;
    // candidatos: nome da lib + aliases curados + frontmatter `package:` (se o loader anexou)
    const names = [lib, ...(alias[lib] || []), ...(fw.package ? [fw.package] : [])];
    const hit = names.find((n) => deps.has(n));
    if (hit) {
      matched.push({ lib, ...fw });
      reason[lib] = `dep:${hit}`;
    }
  }
  return { matched, reason };
}
