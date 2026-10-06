// scripts/lib/edit-nudge.mjs — Camada 2 (Read/Edit/Write nudge channel).
// On a tool event, returns a textual nudge listing standards applicable to the
// edited path + stack refs derived from those standards' related ADRs. Caches
// per-session to avoid spamming the LLM with the same nudge on every tool call.
//
// Public API:
//   buildNudge({ tool, path, projectRoot }) → string | null
//   loadCache(projectRoot) → { ts, injected: string[] }
//   recordInjection(projectRoot, stdId)     → mutates cache
//   isFresh(cacheObj)                       → boolean (TTL 6h)
//
// Cache lives at .context/cache/session-injected.json. TTL is 6h — long
// enough for a typical session, short enough to avoid stale state across
// days. On stale, cache is reset transparently.

import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { loadStandards, findApplicableStandards } from "./standards-loader.mjs";
import { readFrameworkVersionsFromPath } from "./devflow-config.mjs";
import { deriveRefsForStandards } from "./standard-refs.mjs";
import { frameProjectData, safeName, inlineSafe } from "./untrusted-frame.mjs";

// Teto por campo de contexto injetado: o Claude Code corta em 10.000 e entrega só uma prévia.
export const NUDGE_MAX_CHARS = 9000;
const FOOTER_ROOM = 160; // espaço guardado para o aviso do que ficou de fora

const CACHE_REL = ".context/cache/session-injected.json";
const TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const RELEVANT_TOOLS = new Set(["Read", "Edit", "Write"]);

export function buildNudge({ tool, path, projectRoot }) {
  if (!RELEVANT_TOOLS.has(tool)) return null;
  if (!path || typeof path !== "string") return null;

  const standards = loadStandards(projectRoot);
  // Mesmo escopo de versao do run-linter: o nudge nao pode sugerir standard
  // que o linter nao vai enforcar. Sem onSkip — o nudge e informativo.
  const applicable = findApplicableStandards(path, standards, {
    versions: readFrameworkVersionsFromPath(join(projectRoot, ".context", ".devflow.yaml")),
  });
  if (applicable.length === 0) return null;

  const cache = loadCache(projectRoot);
  const fresh = applicable.filter(s => !cache.injected.includes(s.id));
  if (fresh.length === 0) return null;

  const derivedRefs = deriveRefsForStandards(fresh, projectRoot);

  // Camada 3: on first touch (std not yet cached), extract Princípios +
  // Anti-patterns from the std body so the LLM sees the rules without
  // having to Read the std file separately.
  const rules = fresh
    .map(s => {
      const r = extractStandardRules(s.body || "");
      if (!r.principios && !r.antiPatterns) return null;
      return { stdId: s.id, principios: r.principios, antiPatterns: r.antiPatterns };
    })
    .filter(Boolean);

  return {
    tool,
    path,
    matchedStandards: fresh.map(s => s.id),
    derivedRefs,
    rules,
  };
}

// Extracts named sections from a standard's markdown body. Supports the
// canonical sections used by the standard-from-adr generator:
//   ## Princípios
//   ## Anti-patterns
// Returns empty strings when a section is missing — never undefined.
//
// Note: section names are pt-BR by convention (DevFlow standards are written
// in pt-BR). English-language standards using "## Principles" would not
// match — extend the regex if/when that becomes a project requirement.
export function extractStandardRules(body) {
  return {
    principios: extractSection(body, /Princ[íi]pios/i),
    antiPatterns: extractSection(body, /Anti-?patterns/i),
  };
}

function extractSection(body, headingRe) {
  if (!body) return "";
  const heading = new RegExp(`^##\\s+${headingRe.source}\\s*$`, "im");
  const m = body.match(heading);
  if (!m) return "";
  const start = m.index + m[0].length;
  const rest = body.slice(start);
  // Stop at next "## " or "# " heading (or EOF)
  const nextHeading = rest.match(/^#{1,2}\s/m);
  const slice = nextHeading ? rest.slice(0, nextHeading.index) : rest;
  return slice.trim();
}

// ─── Cache management ─────────────────────────────────────────────────────

export function loadCache(projectRoot) {
  const path = join(projectRoot, CACHE_REL);
  if (!existsSync(path)) return { ts: new Date().toISOString(), injected: [] };
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return { ts: new Date().toISOString(), injected: [] };
  }
  if (!isFresh(parsed)) {
    // Stale — reset (don't error)
    return { ts: new Date().toISOString(), injected: [] };
  }
  return {
    ts: parsed.ts,
    injected: Array.isArray(parsed.injected) ? parsed.injected : [],
  };
}

export function recordInjection(projectRoot, stdId) {
  const cache = loadCache(projectRoot);
  if (!cache.injected.includes(stdId)) cache.injected.push(stdId);
  cache.ts = new Date().toISOString();
  const path = join(projectRoot, CACHE_REL);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(cache, null, 2));
  return cache;
}

// Removes the cache file so next session starts clean. Called by
// hooks/session-start — the time-based TTL alone could silence nudges across
// distinct conversations within the same 6h window.
export function clearCache(projectRoot) {
  const path = join(projectRoot, CACHE_REL);
  if (existsSync(path)) rmSync(path, { force: true });
}

export function isFresh(cache) {
  if (!cache || !cache.ts) return false;
  const t = Date.parse(cache.ts);
  if (isNaN(t)) return false;
  return Date.now() - t < TTL_MS;
}

// ─── Render ────────────────────────────────────────────────────────────────

/**
 * Texto do nudge, com no máximo `maxChars` caracteres (unidades UTF-16, como o Claude Code mede
 * o campo) e nunca mais que NUDGE_MAX_CHARS. Quem chama desconta de `maxChars` o que mais vai
 * no mesmo `additionalContext`.
 */
export function renderNudgeText(nudge, { maxChars = NUDGE_MAX_CHARS } = {}) {
  if (!nudge) return "";
  const limit = Math.min(Number.isFinite(maxChars) ? maxChars : 0, NUDGE_MAX_CHARS);
  // O que sai FORA da moldura também vem do projeto: o id do standard (frontmatter), o caminho
  // do arquivo e o `lib@version`/`refPath` do manifesto de stacks. Passam pelos mesmos helpers
  // do contexto pré-edição e do SessionStart — id por `safeName`, o resto por `inlineSafe` (uma
  // linha, sem controle nem `<>`). O cache de entrega continua pelo id real (`matchedStandards`).
  const libRef = (r) => inlineSafe(`${r.lib}@${r.version}`, 160);
  const lines = [];
  lines.push(`DevFlow: ${nudge.tool} em ${inlineSafe(nudge.path, 240)}`);
  lines.push(`Standards aplicáveis: ${nudge.matchedStandards.map(id => safeName(id)).join(", ")}`);
  if (nudge.derivedRefs.length > 0) {
    // Fase B: 3 ref states. MCP-indexed libs query via MCP tool; legacy
    // .md refs read from disk; pending-scrape are declared but not indexed.
    const mcpIndexed = nudge.derivedRefs.filter(r => r.status === "mcp-indexed");
    const scraped = nudge.derivedRefs
      .filter(r => r.status === "scraped")
      .map(r => inlineSafe(`.context/stacks/${r.refPath}`, 240));
    const pending = nudge.derivedRefs
      .filter(r => r.status === "pending-scrape")
      .map(libRef);
    if (mcpIndexed.length > 0) {
      const libList = mcpIndexed.map(libRef).join(", ");
      lines.push(`Refs MCP-indexed: ${libList}`);
      lines.push(`  → query: mcp__docs-mcp-server__search_docs(<lib>, "<question>")`);
    }
    if (scraped.length > 0) {
      lines.push(`Refs disponíveis (legacy .md): ${scraped.join(", ")}`);
    }
    if (pending.length > 0) {
      lines.push(`Refs declarados sem scrape: ${pending.join(", ")}`);
    }
  }

  // Sem espaço nem para o cabeçalho: nada sai (quem chama não marca os standards como entregues).
  let out = lines.join("\n");
  if (out.length > limit) return "";

  // Camada 3: include rule body on first-touch. The cache (recordInjection)
  // ensures these only ship once per std per session.
  // O corpo vem do repositório: cada standard sai numa moldura de dado não confiável
  // (frameProjectData, a mesma do contexto pré-edição). Uma moldura entra inteira ou não entra:
  // cortar no meio deixaria o bloco sem o fechamento. O que não cabe no teto vira um aviso.
  let omitted = 0;
  for (const rule of nudge.rules || []) {
    const body =
      (rule.principios ? `#### Princípios\n${rule.principios}\n` : "") +
      (rule.antiPatterns ? `#### Anti-patterns\n${rule.antiPatterns}\n` : "");
    const name = safeName(rule.stdId);
    const block = `\n\n### Regras de ${name} (primeira aparição)\n${frameProjectData(name, body).trimEnd()}`;
    if (out.length + block.length <= limit - FOOTER_ROOM) out += block;
    else omitted++;
  }
  if (omitted > 0) {
    const footer = `\n\n(regras de ${omitted} standard(s) não couberam no limite deste aviso; leia o arquivo de cada standard listado acima)`;
    if (out.length + footer.length <= limit) out += footer;
  }
  return out;
}
