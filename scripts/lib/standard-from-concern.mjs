// scripts/lib/standard-from-concern.mjs
//
// Generates a baseline standard document from a concern taxonomy entry.
// The standard is operational-rule oriented: ## Princípios comes from the
// concern's principleTemplate (NOT from any ADR's Decisão), anti-patterns
// from antiPatternTemplate, and ## Linter from linterHints + (optionally)
// enforcement bullets harvested from ADRs via standard-enrich.
//
// Public API:
//   generateStandardFromConcern({ concern, enrichment, applyTo? })
//     → { frontmatter: string, body: string, fullDocument: string }
//
//   concern     — taxonomy entry (see taxonomy-loader.mjs)
//   enrichment  — null OR { guardrails, enforcement, adrSlugs, boundaryList?, lib? }
//   applyTo     — optional string[] overriding concern.defaultApplyTo

function renderApplyTo(applyTo) {
  return applyTo.map(p => `  - "${p}"`).join("\n");
}

function renderRelatedAdrs(slugs) {
  if (!slugs || slugs.length === 0) return "relatedAdrs: []";
  return `relatedAdrs:\n${slugs.map(s => `  - "${s}"`).join("\n")}`;
}

function renderPrinciples(template, enrichment) {
  let out = template || "";
  if (enrichment) {
    if (enrichment.boundaryList) {
      out = out.replace(/\{\{boundaryList\}\}/g, enrichment.boundaryList);
    }
    if (enrichment.lib) {
      out = out.replace(/\{\{lib\}\}/g, enrichment.lib);
    }
  }
  return out.trim();
}

function renderAntiPatterns(rules) {
  const header = "| Errado | Certo |\n|---|---|";
  if (!rules || rules.length === 0) {
    return `${header}\n| _(sem anti-patterns na taxonomia)_ | _(preencher)_ |`;
  }
  const rows = rules.map(r => `| ${r.rule} | ${r.correct} |`).join("\n");
  return `${header}\n${rows}`;
}

function renderLinter(stdId, hints, enforcement) {
  const items = [];
  for (const h of hints || []) items.push(h);
  for (const e of enforcement || []) items.push(e);
  const numbered = items.length
    ? items.map((it, i) => `${i + 1}. ${it}`).join("\n")
    : "_(linter rules pendentes — humano implementa em machine/" + stdId + ".js)_";
  return numbered;
}

function renderReferencia(adrSlugs) {
  if (!adrSlugs || adrSlugs.length === 0) {
    return "_(standard concern-based — sem ADR de origem)_";
  }
  return "ADRs relacionadas:\n" + adrSlugs.map(s => `- ${s}`).join("\n");
}

export function generateStandardFromConcern({ concern, enrichment, applyTo }) {
  const stdId = `std-${concern.id}`;
  const apply = applyTo ?? concern.defaultApplyTo ?? [];
  const adrSlugs = enrichment?.adrSlugs ?? [];

  const frontmatter = `---
id: ${stdId}
description: ${concern.summary}
version: 1.0.0
applyTo:
${renderApplyTo(apply)}
${renderRelatedAdrs(adrSlugs)}
enforcement:
  linter: standards/machine/${stdId}.js
weakStandardWarning: true
---`;

  const body = `# Standard: ${concern.id}

## Princípios
${renderPrinciples(concern.principleTemplate, enrichment)}

## Anti-patterns
${renderAntiPatterns(concern.antiPatternTemplate)}

## Linter
\`./machine/${stdId}.js\` verifica:

${renderLinter(stdId, concern.linterHints, enrichment?.enforcement)}

Output em formato \`VIOLATION: <regra> (<file>:<line>) — <correção sugerida>\` per SI-4 contract.

## Referência
${renderReferencia(adrSlugs)}

Authoring guide: \`.context/standards/README.md\`
`;

  return { frontmatter, body, fullDocument: `${frontmatter}\n${body}` };
}
