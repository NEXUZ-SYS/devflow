// scripts/lib/standard-from-adr.mjs — deterministic extraction of a Standard
// from one or more ADRs. Used by `devflow standards new --from-adr=<slug>` to
// avoid TODO/scaffold output: the standard inherits guardrails (NUNCA →
// anti-patterns), enforcement (→ linter rules), decisão (→ princípios), and
// derives applyTo from the ADR stack.
//
// Pure node:* — no LLM, no network. Output is deterministic given the ADR(s).

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseFrontmatter } from "./frontmatter.mjs";
import { resolveAdrPath } from "./path-resolver.mjs";

// ─── Section extraction ─────────────────────────────────────────────────────

/**
 * Extract a single `## Heading` section's body (until next `## ` or EOF).
 * Heading match is case-insensitive; accents tolerated.
 */
function extractSection(body, heading) {
  // Split body on `## ` headings, then locate the matching one.
  // More robust than a single regex (avoids JS-incompatible `\z` anchor).
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const startRe = new RegExp(`^##\\s+${escaped}\\s*$`, "im");
  const startMatch = body.match(startRe);
  if (!startMatch) return "";
  const startIdx = startMatch.index + startMatch[0].length;
  // Find next `## ` or `# ` heading after our start
  const after = body.slice(startIdx);
  const nextHead = after.match(/^#{1,2}\s+\S/m);
  const endIdx = nextHead ? startIdx + nextHead.index : body.length;
  return body.slice(startIdx, endIdx).trim();
}

export function parseAdrSections(content) {
  const { body } = parseFrontmatter(content);
  return {
    contexto:    extractSection(body, "Contexto"),
    decisao:     extractSection(body, "Decisão"),
    alternativas: extractSection(body, "Alternativas Consideradas"),
    consequencias: extractSection(body, "Consequências"),
    guardrails:  extractSection(body, "Guardrails"),
    enforcement: extractSection(body, "Enforcement"),
    evidencias:  extractSection(body, "Evidências / Anexos"),
  };
}

// ─── Guardrails → Anti-patterns inversion ────────────────────────────────────

/**
 * Convert a Guardrails section's NUNCA bullets into anti-pattern rows.
 * Each NUNCA bullet becomes a row with the prohibited form on the "errado"
 * side and a derivation on the "certo" side (best-effort heuristic).
 *
 * Heuristics for the "certo" side:
 *  - "NUNCA X exceto Y" → "Use Y as the only exception"
 *  - "NUNCA X quando Y existe" → "Use Y instead of X"
 *  - "NUNCA X" (bare) → "Avoid X; prefer the explicit alternative"
 */
export function guardrailsToAntiPatterns(guardrailsText) {
  if (!guardrailsText) return [];
  const lines = guardrailsText.split(/\r?\n/);
  const rows = [];
  for (const line of lines) {
    const m = line.match(/^[-*]\s+NUNCA\s+(.+?)\s*$/i);
    if (!m) continue;
    const rest = m[1].trim();
    let errado, certo;

    // "errado" = full prohibited form (preserves context for reader).
    // "certo" = derived inversion (best-effort heuristic).
    errado = rest;
    const exceptMatch = rest.match(/^(.+?)\s+exceto\s+(.+)$/i);
    const quandoMatch = rest.match(/^(.+?)\s+quando\s+(.+?)\s+(?:existe|disponível)/i);
    if (exceptMatch) {
      certo = `Permitido somente: ${exceptMatch[2].trim()}`;
    } else if (quandoMatch) {
      certo = `Use ${quandoMatch[2].trim()}`;
    } else {
      certo = "Aplicar a alternativa explicitada na ADR (Decisão / Enforcement)";
    }
    rows.push({ errado, certo });
  }
  return rows;
}

// ─── Enforcement → Linter rule list ──────────────────────────────────────────

/**
 * Convert `- [ ] <category>: <rule>` checkboxes into numbered linter rules.
 * Drops the category prefix when present (Code review:, Lint:, Teste:, Gate:),
 * preserves the rule body verbatim.
 */
export function enforcementToLinterRules(enforcementText) {
  if (!enforcementText) return [];
  const lines = enforcementText.split(/\r?\n/);
  const rules = [];
  for (const line of lines) {
    const m = line.match(/^[-*]\s+\[[\sx]\]\s+(.+)$/i);
    if (!m) continue;
    let rule = m[1].trim();
    // Strip leading "Category: " prefix to keep rules tool-focused
    rule = rule.replace(/^(Code review|Lint|Teste|Gate(?:\s+CI\/PREVC)?|CI|PREVC)\s*:\s*/i, "");
    rules.push(rule);
  }
  return rules;
}

// ─── Standard ID derivation (mirrors adr-chain.deriveStdId) ──────────────────

const STD_LAYER_SUFFIX_RE = /-(frontend|bff|backend|data-infra|web|api|server|client|cli)$/;

export function deriveStdId(adrSlugOrStdId) {
  if (typeof adrSlugOrStdId !== "string" || adrSlugOrStdId.length === 0) {
    return "std-from-adr";
  }
  // Already prefixed → idempotent (still strip camada-suffix)
  let core = adrSlugOrStdId
    .replace(/^std-/i, "")
    .replace(/^adr-/i, "")
    .replace(/^(adopt|use|migrate|introduce)-/i, "")
    .replace(/-strategy$|-policy$/i, "")
    .replace(STD_LAYER_SUFFIX_RE, "");
  return `std-${core}`;
}

// ─── applyTo derivation from ADR stack ────────────────────────────────────────

const STACK_GLOBS = {
  // Languages
  typescript:  ["**/*.ts", "**/*.tsx"],
  javascript:  ["**/*.js", "**/*.mjs", "**/*.jsx"],
  python:      ["**/*.py"],
  rust:        ["**/*.rs"],
  go:          ["**/*.go"],
  // Frameworks (file-flavored)
  react:       ["**/*.tsx", "**/*.jsx"],
  nextjs:      ["app/**/*.tsx", "app/**/*.ts", "src/app/**/*.tsx", "src/app/**/*.ts"],
  next:        ["app/**/*.tsx", "app/**/*.ts", "src/app/**/*.tsx", "src/app/**/*.ts"],
  fastapi:     ["**/*.py", "pyproject.toml"],
  pydantic:    ["**/*.py"],
  zod:         ["**/*.ts", "**/*.tsx"],
  pytest:      ["tests/**/*.py", "**/test_*.py", "**/*_test.py"],
  vitest:      ["**/*.test.ts", "**/*.test.tsx", "**/*.spec.ts"],
  // CI / tooling
  biome:       ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"],
  ruff:        ["**/*.py", "pyproject.toml"],
  eslint:      ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"],
  prettier:    ["**/*"],
  husky:       [".husky/**", "package.json"],
  // Default fallback
};

/**
 * Map an ADR.stack value (e.g., "TypeScript 5.9.x", "Python 3.13", "Tauri 2")
 * to a list of applyTo globs. Falls back to ["src/**"] for unknown stacks.
 */
export function deriveApplyTo(stackString) {
  if (!stackString || typeof stackString !== "string") return ["src/**"];
  const normalized = stackString
    .toLowerCase()
    .replace(/[^a-z0-9]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  for (const word of normalized) {
    if (STACK_GLOBS[word]) return STACK_GLOBS[word];
  }
  return ["src/**"];
}

// ─── ADR resolution (slug | numeric prefix | full path) ──────────────────────

/**
 * Resolve an ADR slug or numeric prefix to an absolute file path.
 * Accepts: "001", "adr-typescript-frontend", "001-adr-typescript-frontend",
 * or absolute/relative path.
 */
export function resolveAdrSlug(slugOrPath, projectRoot) {
  // Absolute or relative path with .md → use as-is if exists
  if (slugOrPath.endsWith(".md")) {
    if (existsSync(slugOrPath)) return slugOrPath;
    // Try relative to projectRoot/.context/adrs
    const info = resolveAdrPath(projectRoot);
    for (const dir of info.readPaths) {
      const candidate = join(dir, slugOrPath);
      if (existsSync(candidate)) return candidate;
    }
    throw new Error(`ADR file not found: ${slugOrPath}`);
  }

  const info = resolveAdrPath(projectRoot);
  const candidates = [];
  for (const dir of info.readPaths) {
    if (!existsSync(dir)) continue;
    const files = readdirSync(dir).filter(f => /^\d{3}-.*\.md$/.test(f) && f !== "README.md");
    for (const f of files) candidates.push({ dir, file: f });
  }
  if (candidates.length === 0) {
    throw new Error(`no ADR found in ${info.readPaths.join(" or ")}`);
  }

  // Match by numeric prefix (e.g. "001")
  if (/^\d{3}$/.test(slugOrPath)) {
    const hit = candidates.find(c => c.file.startsWith(`${slugOrPath}-`));
    if (hit) return join(hit.dir, hit.file);
  }

  // Match by full filename prefix (e.g., "001-adr-typescript-frontend")
  const hit = candidates.find(c =>
    c.file.startsWith(slugOrPath + "-") ||
    c.file.startsWith(slugOrPath + ".") ||
    // Match by slug embedded in file (e.g. "adr-typescript-frontend")
    c.file.match(new RegExp(`^\\d{3}-${slugOrPath}-v\\d+\\.\\d+\\.\\d+\\.md$`))
  );
  if (hit) return join(hit.dir, hit.file);

  throw new Error(`no ADR matches slug/prefix: '${slugOrPath}'`);
}

// ─── Standard markdown builder ───────────────────────────────────────────────

/**
 * Build a complete standard markdown from one or more ADRs.
 *
 * @param {string[]} adrSlugs   List of slug/prefix/path identifiers
 * @param {object}   options    {projectRoot, id?, applyTo?, weakStandardWarning?}
 * @returns {string} full markdown with frontmatter
 */
export function buildStandardFromAdrs(adrSlugs, options = {}) {
  const { projectRoot, id: explicitId, applyTo: explicitApplyTo,
          weakStandardWarning = true } = options;
  if (!projectRoot) throw new Error("buildStandardFromAdrs: projectRoot required");
  if (!Array.isArray(adrSlugs) || adrSlugs.length === 0) {
    throw new Error("buildStandardFromAdrs: at least 1 ADR slug required");
  }

  // Resolve each slug to an ADR file + parse
  const adrs = adrSlugs.map(slug => {
    const path = resolveAdrSlug(slug, projectRoot);
    const content = readFileSync(path, "utf-8");
    const { data: fm } = parseFrontmatter(content);
    const sections = parseAdrSections(content);
    return { path, fm, sections };
  });

  // Derive standard id
  const stdId = explicitId
    ? (explicitId.startsWith("std-") ? explicitId : `std-${explicitId}`)
    : deriveStdId(adrs[0].fm.name);
  const stdName = stdId.replace(/^std-/, "");

  // Derive applyTo (from first ADR's stack unless overridden)
  const applyTo = explicitApplyTo || deriveApplyTo(adrs[0].fm.stack);

  // Description: single-ADR uses ADR description; multi-ADR synthesizes
  const description = adrs.length === 1
    ? (adrs[0].fm.description || `Convenções derivadas de ${adrs[0].fm.name}`)
    : `Convenções consolidadas para ${stdName} (cobre ${adrs.length} ADRs cross-camada)`;

  // relatedAdrs: collect slugs
  const relatedAdrs = adrs.map(a => a.fm.name).filter(Boolean);

  // ─── Princípios ─────────────────────────────────────────────────────────
  // For single-ADR: use Decisão verbatim. For multi-ADR: header + each ADR's
  // Decisão prefixed with the camada.
  let principios;
  if (adrs.length === 1) {
    principios = adrs[0].sections.decisao || "Convenção derivada do contexto da ADR.";
  } else {
    const blocks = adrs.map(a => {
      const camadaMatch = a.fm.name.match(/-(frontend|bff|backend|data-infra)$/);
      const camada = camadaMatch ? camadaMatch[1] : "geral";
      return `**${camada}** (${a.fm.name}): ${a.sections.decisao || "—"}`;
    });
    principios = blocks.join("\n\n");
  }

  // ─── Anti-patterns table ─────────────────────────────────────────────────
  const allRows = adrs.flatMap(a => guardrailsToAntiPatterns(a.sections.guardrails));
  // De-dup by errado field
  const seen = new Set();
  const rows = allRows.filter(r => {
    if (seen.has(r.errado)) return false;
    seen.add(r.errado);
    return true;
  });
  const antiPatternsTable = rows.length > 0
    ? [
        "| Errado | Certo |",
        "|---|---|",
        ...rows.map(r => `| ${escapePipe(r.errado)} | ${escapePipe(r.certo)} |`),
      ].join("\n")
    : "_Nenhuma proibição (`NUNCA`) extraída das ADRs cobertas. Adicione manualmente conforme necessário._";

  // ─── Linter section ──────────────────────────────────────────────────────
  const allRules = adrs.flatMap(a => enforcementToLinterRules(a.sections.enforcement));
  const seenRule = new Set();
  const rules = allRules.filter(r => {
    if (seenRule.has(r)) return false;
    seenRule.add(r);
    return true;
  });
  const linterSection = rules.length > 0
    ? [
        `\`./machine/${stdId}.js\` verifica:`,
        "",
        ...rules.map((r, i) => `${i + 1}. ${r}`),
        "",
        "Output em formato `VIOLATION: <regra> (<file>:<line>) — <correção sugerida>` per SI-4 contract.",
      ].join("\n")
    : `\`./machine/${stdId}.js\` ainda sem regras automáticas. Sinalizado por \`weakStandardWarning: true\`.`;

  // ─── Referência ──────────────────────────────────────────────────────────
  const adrRefs = adrs.map(a => `- ${a.fm.name} (\`${a.path.split("/").pop()}\`)`).join("\n");
  const evidenciasMerged = adrs
    .map(a => a.sections.evidencias)
    .filter(Boolean)
    .map(e => e.split(/\r?\n/).filter(l => /^\*\*Fontes oficiais|\[/.test(l)).join("\n"))
    .filter(Boolean)
    .join("\n");

  // ─── Frontmatter ─────────────────────────────────────────────────────────
  const fmLines = [
    "---",
    `id: ${stdId}`,
    `description: ${description}`,
    `version: 1.0.0`,
    `applyTo: [${applyTo.map(g => `"${g}"`).join(", ")}]`,
    `relatedAdrs: [${relatedAdrs.map(s => `"${s}"`).join(", ")}]`,
    `enforcement:`,
    `  linter: standards/machine/${stdId}.js`,
    weakStandardWarning ? `weakStandardWarning: true` : null,
    "---",
  ].filter(Boolean);

  // ─── Compose ─────────────────────────────────────────────────────────────
  const md = [
    fmLines.join("\n"),
    "",
    `# Standard: ${stdName}`,
    "",
    "## Princípios",
    "",
    principios,
    "",
    "## Anti-patterns",
    "",
    antiPatternsTable,
    "",
    "## Linter",
    "",
    linterSection,
    "",
    "## Referência",
    "",
    "ADRs derivadas:",
    adrRefs,
    "",
    evidenciasMerged ? "Fontes oficiais (consolidadas das ADRs):\n\n" + evidenciasMerged : "",
    "",
    "Authoring guide: `.context/standards/README.md`",
    "",
  ].filter(s => s !== "").join("\n");

  return md + "\n";
}

function escapePipe(s) {
  return String(s || "").replace(/\|/g, "\\|");
}
