// skills/scrape-stack-batch/scripts/pipeline.mjs — RESOLVE (validate only).
//
// Fase "hosted MCP": o scrape NÃO roda mais neste script. O docs-mcp-server
// hospedado (https://docs-mcp.nexuz.app/mcp) executa o scrape como tool MCP
// (`mcp__docs-mcp-server__scrape_docs`, job assíncrono), orquestrada pela skill
// `devflow:scrape-stack-batch`. Ferramentas MCP só são chamáveis pelo LLM/skill,
// não de dentro de um .mjs — por isso este módulo só VALIDA e devolve o spec.
//
// Estágio único:
//   RESOLVE — valida lib/version/url e devolve o scrape spec (library, version,
//             url, type, scope, maxPages, maxDepth) que a skill passa à tool MCP.
//
// Removido nesta fase:
//   - Estágio SCRAPE via `recursiveScrape()`/npx (scripts/lib/scrape-recursive.mjs)
//     — o scrape agora roda server-side no hospedado, não há subprocess local.
//
// Invariantes de segurança:
//   SI-2: N/A — sem exec/subprocess local; o scrape roda server-side no hospedado.
//   SI-3: URL validada por `resolve()` (defesa-em-profundidade). O anti-SSRF
//         efetivo é do servidor hospedado (allowlist server-side verificado:
//         RFC1918/169.254-metadata/file:// negados). NENHUMA url deve chegar à
//         tool MCP sem passar por `resolve()` primeiro (invariante da skill).

import { validateUrl } from "../../../scripts/lib/url-validator.mjs";

// Knobs default repassados à tool MCP scrape_docs (espelham os limites de crawl).
const DEFAULT_SCOPE = "hostname";
const DEFAULT_MAX_PAGES = 50;
const DEFAULT_MAX_DEPTH = 3;

// SECURITY (Semana 2 audit CRITICAL): npm-spec compliant pattern — optional
// scope prefix `@scope/`, then a single segment. No '..', no leading dot,
// no slashes outside the scope prefix.
const SLUG_RE = /^(@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i;
const VERSION_RE = /^[0-9][a-zA-Z0-9.+-]*$/;

// ─── Stage 1: RESOLVE ──────────────────────────────────────────────────────

export async function resolve({ library, version, url, type }) {
  if (!library || !SLUG_RE.test(library) || library.includes("..")) {
    throw new Error(`RESOLVE: invalid library name '${library}' (npm-spec required, no traversal)`);
  }
  if (!version || !VERSION_RE.test(version)) {
    throw new Error(`RESOLVE: invalid version '${version}'`);
  }
  if (!url) throw new Error(`RESOLVE: url required for ${library}@${version}`);
  // SI-3 defense in depth — re-validate even though caller should have
  await validateUrl(url);

  return { library, version, url, type };
}

// ─── Orchestrator ──────────────────────────────────────────────────────────
// Valida o input e devolve o scrape spec. NÃO executa o scrape — quem indexa é
// a tool MCP `mcp__docs-mcp-server__scrape_docs` (servidor hospedado), invocada
// pela skill. A skill consome este spec validado e o passa à tool; depois faz
// polling de `list_jobs`/`get_job_info` e verifica via `search_docs`.

export async function runPipeline(input) {
  const r = await resolve(input);
  return {
    library: r.library,
    version: r.version,
    url: r.url,
    type: r.type,
    scope: input.scope ?? DEFAULT_SCOPE,
    maxPages: input.maxPages ?? DEFAULT_MAX_PAGES,
    maxDepth: input.maxDepth ?? DEFAULT_MAX_DEPTH,
  };
}
