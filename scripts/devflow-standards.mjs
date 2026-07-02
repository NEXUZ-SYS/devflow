#!/usr/bin/env node
// scripts/devflow-standards.mjs — CLI dispatcher for `devflow standards new|verify|eject`.
//
// Usage:
//   devflow standards new <id>          Scaffold .context/standards/std-<id>.md + linter template
//   devflow standards verify             Validate all standards (warnings on weak)
//   devflow standards verify --strict    Exit non-zero if any weak standards found
//   devflow standards verify <id>        Validate a single standard
//   devflow standards eject <id>         Copy plugin default std-<id>.md into project (customizable)
//
// Per Dependency Policy: pure node:* — uses scripts/lib/{glob,frontmatter,standards-loader}.mjs.

import { mkdir, writeFile, readFile, access, copyFile } from "node:fs/promises";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { parseArgs } from "node:util";
import { loadStandards } from "./lib/standards-loader.mjs";
import { validateSubset } from "./lib/glob.mjs";
import { contextPaths, resolveReadPaths } from "./lib/context-paths.mjs";
import { isWithinDir } from "./lib/path-guard.mjs";

const SCAFFOLD_TEMPLATE = (id) => `---
id: std-${id}
description: <one-line description>
version: 1.0.0
applyTo: ["src/**"]
relatedAdrs: []
enforcement:
  linter: standards/machine/std-${id}.js
# REMOVE este comment + flag quando body for preenchido:
scaffolded: true
---

# Standard: ${id}

> ⚠ SCAFFOLD INCOMPLETO — \`devflow standards audit ${id}\` falha enquanto este standard contém placeholders abaixo.
> Preencha as 3 seções obrigatórias (Princípios, Anti-patterns, Linter) e remova \`scaffolded: true\` do frontmatter.

## Princípios

TODO: substituir por prosa real. Standards são gatilho semântico para humanos
e LLMs — explique o **porquê** da regra (1-2 parágrafos), referenciando a
ADR de origem em \`relatedAdrs\` quando aplicável. Não copie a ADR; resuma a
intenção operacional.

## Anti-patterns

TODO: substituir a tabela placeholder abaixo por ≥3 pares (errado, certo)
extraídos da realidade do projeto. Cada \`certo\` deve incluir o import
corretivo ou patch concreto que o agent pode aplicar.

| Errado | Certo |
|---|---|
| TODO: padrão errado real | TODO: padrão correto + import corretivo |

## Linter

\`./machine/std-${id}.js\` (TODO: implementar regra real — scaffold inicial
apenas exit 0). O linter recebe \`process.argv[2]\` (filePath) e deve emitir
\`VIOLATION: <regra> (<file>:<line>) — <correção>\` quando detectar falha.

## Referência

- ADRs relacionadas: TODO listar slugs de ADRs em \`relatedAdrs\`
- Authoring guide: \`.context/standards/README.md\`
`;

const LINTER_TEMPLATE = (id) => `#!/usr/bin/env node
// .context/standards/machine/std-${id}.js
// Linter para std-${id}. Recebe filePath via process.argv[2].
// Saída: stdout 'VIOLATION: <msg>' + exit 1 quando violação detectada.

import { readFileSync } from "node:fs";

const filePath = process.argv[2];
if (!filePath) process.exit(0);

const content = readFileSync(filePath, "utf-8");

// TODO: implement rule check.
// Example pattern:
//   const matches = content.match(/badPattern/g);
//   if (matches) {
//     console.log(\`VIOLATION: \${matches.length} instances of badPattern in \${filePath}. Replace with goodPattern.\`);
//     process.exit(1);
//   }

process.exit(0);
`;

async function cmdNew(id, projectRoot, opts = {}) {
  // Strip leading 'std-' if user passed a fully-prefixed id (chain-suggest
  // returns 'std-X' format; CLI consumers may paste it verbatim).
  if (typeof id === "string" && id.startsWith("std-")) {
    id = id.slice(4);
  }
  if (!id || !/^[a-z][a-z0-9-]*$/.test(id)) {
    console.error("Error: id must match /^[a-z][a-z0-9-]*$/ (after optional 'std-' prefix strip)");
    process.exit(2);
  }
  const stdsDir = join(projectRoot, ".context", "standards");
  const machineDir = join(stdsDir, "machine");
  await mkdir(machineDir, { recursive: true });

  const stdPath = join(stdsDir, `std-${id}.md`);
  const linterPath = join(machineDir, `std-${id}.js`);

  if (existsSync(stdPath) && !opts.force) {
    console.error(`Error: ${stdPath} already exists (use --force to overwrite)`);
    process.exit(1);
  }

  // ─── --from-adr mode: deterministic extraction from ADR(s) ─────────────
  if (opts.fromAdr && opts.fromAdr.length > 0) {
    await warnLegacyFromAdr(opts.fromAdr, projectRoot, opts);
    const { buildStandardFromAdrs } = await import("./lib/standard-from-adr.mjs");
    let stdContent;
    try {
      stdContent = buildStandardFromAdrs(opts.fromAdr, {
        projectRoot,
        id,
        weakStandardWarning: true,
      });
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
    await writeFile(stdPath, stdContent);
    if (!existsSync(linterPath)) {
      await writeFile(linterPath, LINTER_TEMPLATE(id));
    }
    console.log(`Created std-${id} (from ADR${opts.fromAdr.length > 1 ? 's' : ''}: ${opts.fromAdr.join(", ")}):`);
    console.log(`  ${stdPath}`);
    console.log(`  ${linterPath}`);
    console.log("");
    console.log(`Validate: node scripts/devflow-standards.mjs audit std-${id} --project=${projectRoot}`);
    return;
  }

  // ─── Default mode: SCAFFOLD with TODO markers (legacy) ─────────────────
  await writeFile(stdPath, SCAFFOLD_TEMPLATE(id));
  if (!existsSync(linterPath)) {
    await writeFile(linterPath, LINTER_TEMPLATE(id));
  }

  console.log(`Created std-${id} (SCAFFOLD — has TODO markers):`);
  console.log(`  ${stdPath}`);
  console.log(`  ${linterPath}`);
  console.log("");
  console.log("Next: edit Princípios + Anti-patterns; implement the linter rule check.");
  console.log("Tip: derive automatically from ADRs with --from-adr=<slug1>,<slug2>");
}

function defaultTaxonomyPath() {
  return resolve(import.meta.dirname, "../skills/standards-builder/references/taxonomy-of-concerns.yaml");
}

// Emits a stderr warning when --from-adr is used without --concern (legacy
// lib-centric path). Suggests the canonical operational concern via the
// taxonomy's inverseHints, logs the invocation, and pauses 3s (skipped with
// --yes) so a human can abort. Never blocks — legacy path stays functional.
async function warnLegacyFromAdr(fromAdr, projectRoot, opts) {
  const { loadTaxonomy } = await import("./lib/taxonomy-loader.mjs");
  const { mkdirSync, appendFileSync } = await import("node:fs");

  const distributedPath = opts.taxonomy || defaultTaxonomyPath();
  const tax = await loadTaxonomy({ distributedPath, projectRoot });

  // Derive a lib name for the first ADR. A numeric prefix ("009") carries no
  // lib name, so resolve the ADR file and read its frontmatter `stack`/`name`.
  // Fall back to the raw slug heuristic when resolution fails.
  let libName = (fromAdr[0] || "").replace(/^adr-/, "").split("-")[0].toLowerCase();
  try {
    const { resolveAdrSlug } = await import("./lib/standard-from-adr.mjs");
    const { parseFrontmatter } = await import("./lib/frontmatter.mjs");
    const { readFileSync } = await import("node:fs");
    const adrPath = resolveAdrSlug(fromAdr[0], projectRoot);
    const { data } = parseFrontmatter(readFileSync(adrPath, "utf-8"));
    const stackLib = (data?.stack || "").toLowerCase().split(/\s+/)[0];
    const nameLib = (data?.name || "").replace(/^adr-/, "").split("-")[0].toLowerCase();
    libName = stackLib || nameLib || libName;
  } catch {
    // best-effort — keep the raw-slug heuristic
  }
  const hint = tax.entries.find(e => (e.inverseHints || []).includes(libName));
  const hintId = hint?.id || "<concern não detectado>";

  process.stderr.write(
    `\n⚠️  std lib-centric detectado (--from-adr sem --concern).\n` +
    `   Concern operacional canônico: ${hintId}\n` +
    `   Preferido: devflow standards new --concern=${hint?.id || "<id>"} --enrich-from-adr=${fromAdr.join(",")}\n` +
    `   Prosseguindo em modo legado em ${opts.yes ? "0" : "3"}s (Ctrl-C para abortar)...\n\n`
  );

  // Audit log — one line per legacy invocation.
  try {
    const stdsDir = join(projectRoot, ".context", "standards");
    mkdirSync(stdsDir, { recursive: true });
    appendFileSync(
      join(stdsDir, ".legacy-from-adr.log"),
      `${new Date().toISOString()} from-adr=${fromAdr.join(",")} hint=${hint?.id || "none"}\n`
    );
  } catch {
    // logging is best-effort; never blocks the legacy path
  }

  if (!opts.yes) await new Promise(r => setTimeout(r, 3000));
}

// new --concern=<id> [--enrich-from-adr=<csv>] — concern-first generation.
async function cmdNewConcern(projectRoot, opts) {
  const { loadTaxonomy } = await import("./lib/taxonomy-loader.mjs");
  const { resolveConcern } = await import("./lib/concern-resolver.mjs");

  const distributedPath = opts.taxonomy || defaultTaxonomyPath();
  const tax = await loadTaxonomy({ distributedPath, projectRoot });

  if (tax.entries.length === 0) {
    console.error(`Error: taxonomy not found or empty: ${distributedPath}`);
    process.exit(1);
  }

  const resolution = resolveConcern(opts.concern, tax);
  if (resolution.status === "no-match") {
    console.error(`Error: concern not found: '${opts.concern}'`);
    console.error(`  Available concerns: ${tax.entries.map(e => e.id).join(", ")}`);
    process.exit(1);
  }
  if (resolution.status === "ambiguous") {
    console.error(`Error: concern '${opts.concern}' is ambiguous. Candidates:`);
    for (const c of resolution.candidates) {
      console.error(`  - ${c.entry.id} (score ${c.score.toFixed(2)})`);
    }
    console.error(`  Pass an exact concern id to disambiguate.`);
    process.exit(1);
  }

  const concern = resolution.match;
  const stdId = `std-${concern.id}`;
  const stdsDir = join(projectRoot, ".context", "standards");
  const machineDir = join(stdsDir, "machine");
  await mkdir(machineDir, { recursive: true });
  const stdPath = join(stdsDir, `${stdId}.md`);
  const linterPath = join(machineDir, `${stdId}.js`);

  if (existsSync(stdPath) && !opts.force) {
    console.error(`Error: ${stdPath} already exists (use --force to overwrite)`);
    process.exit(1);
  }

  // Optional enrichment from ADR(s).
  let enrichment = null;
  if (opts.enrichFromAdr && opts.enrichFromAdr.length > 0) {
    try {
      enrichment = await buildEnrichment(opts.enrichFromAdr, projectRoot);
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  }

  const { generateStandardFromConcern: gen } = await import("./lib/standard-from-concern.mjs");
  await writeConcernStandard(projectRoot, concern, enrichment, gen);

  const enrichNote = enrichment ? ` (enriched from: ${enrichment.adrSlugs.join(", ")})` : "";
  console.log(`Created ${stdId}${enrichNote}:`);
  console.log(`  ${stdPath}`);
  console.log(`  ${linterPath}`);
  console.log("");
  console.log(`Validate: node scripts/devflow-standards.mjs audit ${stdId} --project=${projectRoot}`);
}

// Writes std-<concern>.md + linter stub. Shared by cmdNewConcern and cmdMigrate.
async function writeConcernStandard(projectRoot, concern, enrichment, gen) {
  const stdId = `std-${concern.id}`;
  const stdsDir = join(projectRoot, ".context", "standards");
  const machineDir = join(stdsDir, "machine");
  await mkdir(machineDir, { recursive: true });
  const stdPath = join(stdsDir, `${stdId}.md`);
  const linterPath = join(machineDir, `${stdId}.js`);

  const { fullDocument } = gen({ concern, enrichment });
  await writeFile(stdPath, fullDocument);
  if (!existsSync(linterPath)) {
    await writeFile(linterPath, LINTER_TEMPLATE(concern.id));
  }
  return stdPath;
}

// Resolves --enrich-from-adr CSV (slugs/prefixes) into an enrichment object.
async function buildEnrichment(adrRefs, projectRoot) {
  const { enrichFromAdrs } = await import("./lib/standard-enrich.mjs");
  const { resolveAdrSlug } = await import("./lib/standard-from-adr.mjs");
  const { parseFrontmatter } = await import("./lib/frontmatter.mjs");
  const { readFileSync } = await import("node:fs");
  const adrPaths = [];
  const adrSlugs = [];
  for (const ref of adrRefs) {
    const p = resolveAdrSlug(ref, projectRoot);
    adrPaths.push(p);
    const { data } = parseFrontmatter(readFileSync(p, "utf-8"));
    adrSlugs.push(data?.name || ref);
  }
  const enrichment = await enrichFromAdrs(adrPaths);
  enrichment.adrSlugs = adrSlugs;
  return enrichment;
}

// new --migrate=<lib-std-id> — transitions a lib-centric std to a concern std.
async function cmdMigrate(projectRoot, opts) {
  const { readFileSync, unlinkSync } = await import("node:fs");
  const { parseFrontmatter } = await import("./lib/frontmatter.mjs");
  const { loadTaxonomy } = await import("./lib/taxonomy-loader.mjs");
  const { resolveConcern } = await import("./lib/concern-resolver.mjs");
  const { generateStandardFromConcern: gen } = await import("./lib/standard-from-concern.mjs");

  const oldId = opts.migrate.replace(/^std-/, "");
  const stdsDir = join(projectRoot, ".context", "standards");
  const oldStdPath = join(stdsDir, `std-${oldId}.md`);
  const deprecatedPath = join(stdsDir, `std-${oldId}.deprecated.md`);

  // Idempotent: already migrated.
  if (existsSync(deprecatedPath)) {
    console.error(`std-${oldId} already migrated (std-${oldId}.deprecated.md exists). No-op.`);
    process.exit(0);
  }
  if (!existsSync(oldStdPath)) {
    console.error(`Error: std-${oldId} not found at ${oldStdPath}`);
    process.exit(1);
  }

  const distributedPath = opts.taxonomy || defaultTaxonomyPath();
  const tax = await loadTaxonomy({ distributedPath, projectRoot });

  // Resolve target concern: explicit --target-concern, else inverseHints lookup.
  let targetConcern = opts.targetConcern;
  if (!targetConcern) {
    const match = tax.entries.find(e =>
      (e.inverseHints || []).map(h => h.toLowerCase()).includes(oldId.toLowerCase())
    );
    targetConcern = match?.id;
  }
  if (!targetConcern) {
    console.error(`Error: no concern hint for lib '${oldId}'. Pass --target-concern=<id>.`);
    process.exit(1);
  }

  // Read old std's relatedAdrs — they become the enrichment source.
  const oldContent = readFileSync(oldStdPath, "utf-8");
  const { data: oldFm } = parseFrontmatter(oldContent);
  const oldAdrs = Array.isArray(oldFm.relatedAdrs) ? oldFm.relatedAdrs : [];

  const newStdPath = join(stdsDir, `std-${targetConcern}.md`);

  if (existsSync(newStdPath)) {
    // INJECT path — concern std already exists: merge relatedAdrs.
    const newContent = readFileSync(newStdPath, "utf-8");
    const { data: newFm } = parseFrontmatter(newContent);
    const merged = Array.from(new Set([...(newFm.relatedAdrs || []), ...oldAdrs]));
    await writeFile(newStdPath, replaceRelatedAdrs(newContent, merged));
    console.log(`std-${targetConcern} já existe — merged relatedAdrs: ${merged.join(", ")}`);
    console.log(`  (revise INJECT de guardrails/enforcement manualmente via skill)`);
  } else {
    // CREATE path — generate concern std enriched from the old std's ADRs.
    const resolution = resolveConcern(targetConcern, tax);
    const concern = resolution.match ?? tax.entries.find(e => e.id === targetConcern);
    if (!concern) {
      console.error(`Error: concern '${targetConcern}' not in taxonomy.`);
      process.exit(1);
    }
    let enrichment = null;
    if (oldAdrs.length > 0) {
      try {
        enrichment = await buildEnrichment(oldAdrs, projectRoot);
      } catch (err) {
        console.error(`Warning: enrichment skipped — ${err.message}`);
      }
    }
    await writeConcernStandard(projectRoot, concern, enrichment, gen);
    console.log(`Created std-${targetConcern} from concern (migrated from std-${oldId}).`);
  }

  // Deprecate the old std.
  const today = new Date().toISOString().slice(0, 10);
  const deprecatedHeader = `---
id: std-${oldId}
deprecated: true
supersededBy: std-${targetConcern}
deprecatedReason: lib-centric — migrado para concern operacional
deprecatedAt: ${today}
---
`;
  const oldBody = oldContent.replace(/^---[\s\S]*?---\r?\n?/, "");
  if (opts.keepOld) {
    await writeFile(oldStdPath, deprecatedHeader + oldBody);
    console.log(`Marked std-${oldId}.md as deprecated (--keep-old).`);
  } else {
    await writeFile(deprecatedPath, deprecatedHeader + oldBody);
    unlinkSync(oldStdPath);
    console.log(`Renamed std-${oldId}.md → std-${oldId}.deprecated.md.`);
  }
  console.log(`Migrated std-${oldId} → std-${targetConcern}.`);
}

// Replaces the `relatedAdrs:` block in a frontmatter document with a fresh
// rendered list. Handles both `relatedAdrs: []` and multi-line block form.
function replaceRelatedAdrs(documentText, slugs) {
  const rendered = slugs.length === 0
    ? "relatedAdrs: []"
    : `relatedAdrs:\n${slugs.map(s => `  - "${s}"`).join("\n")}`;
  // Match `relatedAdrs:` followed by either ` []` or a block list.
  const re = /relatedAdrs:(?:[ \t]*\[\]|(?:\r?\n[ \t]+-[ \t].*)+)/;
  if (re.test(documentText)) {
    return documentText.replace(re, rendered);
  }
  return documentText;
}

// search --by-guardrail=<adr-slug> | --by-concern=<concern-id>
// Emits a JSON array to stdout for programmatic consumption (adr-builder
// Step 5e reverse hook, standards-builder Step 2).
async function cmdSearch(projectRoot, opts) {
  const { searchByGuardrail, searchByConcern } = await import("./lib/standards-search.mjs");
  let results;

  if (opts.byGuardrail) {
    const raw = await searchByGuardrail(opts.byGuardrail, { projectRoot });
    results = raw.map(r => ({
      id: r.id,
      file: r.file,
      deprecated: r.data?.deprecated ?? false,
    }));
  } else if (opts.byConcern) {
    const distributedPath = opts.taxonomy || defaultTaxonomyPath();
    const raw = await searchByConcern(opts.byConcern, { projectRoot, distributedPath });
    results = raw.map(r => ({
      slug: r.slug,
      file: r.file,
      stack: r.data?.stack ?? null,
      category: r.data?.category ?? null,
    }));
  } else {
    console.error("Usage: devflow standards search --by-guardrail=<adr> | --by-concern=<id>");
    return 2;
  }

  console.log(JSON.stringify(results, null, 2));
  return 0;
}

async function cmdVerify(targetId, strict, projectRoot) {
  let standards = loadStandards(projectRoot);

  if (targetId) {
    standards = standards.filter(s => s.id === targetId || s.id === `std-${targetId}`);
    if (standards.length === 0) {
      console.error(`No standard found matching: ${targetId}`);
      process.exit(1);
    }
  }

  if (standards.length === 0) {
    console.log("OK: no standards in .context/standards/.");
    return 0;
  }

  let weakCount = 0;
  let invalidCount = 0;

  for (const std of standards) {
    // Validate applyTo subset
    for (const pattern of std.applyTo || []) {
      try {
        validateSubset(pattern);
      } catch (err) {
        console.error(`INVALID ${std.id}: applyTo pattern '${pattern}' — ${err.message}`);
        invalidCount++;
      }
    }
    // Verify linter file exists if declared
    const linter = std.enforcement?.linter;
    if (linter) {
      const linterAbs = resolve(projectRoot, ".context", linter);
      if (!existsSync(linterAbs)) {
        console.error(`INVALID ${std.id}: linter file missing — ${linterAbs}`);
        invalidCount++;
      }
    }
    if (std.weak) {
      console.log(`weak-standard: ${std.id} (no linter, no weakStandardWarning opt-out)`);
      weakCount++;
    }
  }

  console.log("");
  console.log(`Summary: ${standards.length} standards, ${weakCount} weak, ${invalidCount} invalid`);
  if (invalidCount > 0) return 1;
  if (strict && weakCount > 0) {
    console.log("--strict: failing on weak-standards");
    return 1;
  }
  return 0;
}

// ── R5 path-containment helpers (replicated from devflow-knowledge.mjs) ──────

/**
 * Validate the final resolved path stays within the expected parent directory.
 * Secondary containment: catches edge cases that id-regex might miss.
 */
function assertWithinDir(filePath, parentDir) {
  if (!isWithinDir(filePath, parentDir)) {
    process.stderr.write(
      `Error: path traversal detected — resolved path escapes the target directory\n` +
        `  resolved: ${resolve(filePath)}\n  dir: ${resolve(parentDir)}\n`,
    );
    process.exit(1);
  }
}

// eject <id> --project=<path> [--force]
// Copies <pluginRoot>/assets/standards/std-<id>.md → <project>/.context/engineering/standards/std-<id>.md.
async function cmdEject(rawId, projectRoot, opts = {}) {
  // Strip leading 'std-' prefix if passed (accept both 'security' and 'std-security').
  let id = typeof rawId === "string" && rawId.startsWith("std-") ? rawId.slice(4) : rawId;

  // R5 validation: id must match /^[a-z][a-z0-9-]*$/ — rejects /, \, .., etc.
  if (!id || !/^[a-z][a-z0-9-]*$/.test(id)) {
    process.stderr.write(
      `Error: id inválido '${rawId}' — deve corresponder a /^[a-z][a-z0-9-]*$/ (sem /, \\, ..)\n`,
    );
    process.exit(1);
  }

  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || process.cwd();
  const assetsStandardsDir = resolve(pluginRoot, "assets", "standards");
  const src = resolve(assetsStandardsDir, `std-${id}.md`);

  // R5 containment: src must be inside pluginRoot/assets/standards
  assertWithinDir(src, assetsStandardsDir);

  if (!existsSync(src)) {
    process.stderr.write(`Error: default não encontrado: std-${id}\n  Caminho: ${src}\n`);
    process.exit(1);
  }

  const standardsDir = contextPaths(projectRoot).standards;
  const dest = resolve(standardsDir, `std-${id}.md`);

  // R5 containment: dest must be inside project standards dir
  assertWithinDir(dest, standardsDir);

  if (existsSync(dest) && !opts.force) {
    process.stderr.write(
      `Error: ${dest} já existe (use --force para sobrescrever)\n`,
    );
    process.exit(1);
  }

  // mkdir -p the standards dir
  mkdirSync(standardsDir, { recursive: true });

  await copyFile(src, dest);

  const canonicalLinterRel = `engineering/standards/machine/std-${id}.js`;

  if (opts.withLinter) {
    // --with-linter (R15): traz/cria o linter no machine/ do projeto e religa
    // enforcement.linter para o caminho CANÔNICO do projeto (allowlist SI-4 project).
    const machineDir = contextPaths(projectRoot).standardsMachine;
    const linterDest = resolve(machineDir, `std-${id}.js`);
    assertWithinDir(linterDest, machineDir); // SI-5 containment
    if (existsSync(linterDest) && !opts.force) {
      process.stderr.write(`Error: ${linterDest} já existe (use --force para sobrescrever)\n`);
      process.exit(1);
    }
    mkdirSync(machineDir, { recursive: true });

    const bundledLinter = resolve(assetsStandardsDir, "machine", `std-${id}.js`);
    if (existsSync(bundledLinter)) {
      await copyFile(bundledLinter, linterDest); // default enforçado: copia o linter real
    } else {
      await writeFile(linterDest, ejectLinterStub(id)); // warn-only: scaffolda stub TDD-ready
    }

    const wired = readFileSync(dest, "utf-8").replace(/^(\s*)linter:\s*.*$/m, `$1linter: ${canonicalLinterRel}`);
    await writeFile(dest, wired);

    process.stdout.write(`${dest}\n${linterDest}\n`);
    process.stdout.write(`(enforcement.linter religado para ${canonicalLinterRel})\n`);
    return;
  }

  // plain eject: NÃO traz o machine file, então anula enforcement.linter para não
  // deixar uma referência pendurada caso o default seja um std já enforçado.
  const orig = readFileSync(dest, "utf-8");
  const nulled = orig.replace(/^(\s*)linter:\s*.*$/m, `$1linter: null`);
  if (nulled !== orig) await writeFile(dest, nulled);

  process.stdout.write(`${dest}\n`);
  process.stdout.write(
    `(edite à vontade; use --with-linter para também trazer/criar o linter em machine/std-${id}.js)\n`,
  );
}

// Stub de linter TDD-ready para `eject --with-linter` de um default warn-only.
function ejectLinterStub(id) {
  return `#!/usr/bin/env node
// .context/engineering/standards/machine/std-${id}.js
// Linter para std-${id}. Contrato SI-4: filePath em process.argv[2];
// em violação imprime 'VIOLATION: <msg>' + exit 1; senão exit 0.
import { readFileSync } from "node:fs";
const filePath = process.argv[2];
if (!filePath) process.exit(0);
const content = readFileSync(filePath, "utf-8");
// TODO: implemente a regra do concern.
//   const m = content.match(/badPattern/g);
//   if (m) { console.log(\`VIOLATION: \${m.length} ... \`); process.exit(1); }
void content;
process.exit(0);
`;
}

async function main() {
  const rawArgs = process.argv.slice(2);
  // Honor --project=<path>, --from-adr=<csv>, --force before consuming
  // positional args (matches adr-audit/adr-update-index/adr-chain-suggest convention).
  let projectRoot = process.cwd();
  let fromAdr = null;
  let force = false;
  let withLinter = false;
  let concern = null;
  let enrichFromAdr = null;
  let taxonomy = null;
  let yes = false;
  let byGuardrail = null;
  let byConcern = null;
  let migrate = null;
  let targetConcern = null;
  let keepOld = false;
  const args = [];
  for (const a of rawArgs) {
    if (a.startsWith("--project=")) {
      projectRoot = resolve(a.slice("--project=".length));
    } else if (a.startsWith("--from-adr=")) {
      fromAdr = a.slice("--from-adr=".length).split(",").map(s => s.trim()).filter(Boolean);
    } else if (a.startsWith("--concern=")) {
      concern = a.slice("--concern=".length).trim();
    } else if (a.startsWith("--enrich-from-adr=")) {
      enrichFromAdr = a.slice("--enrich-from-adr=".length).split(",").map(s => s.trim()).filter(Boolean);
    } else if (a.startsWith("--taxonomy=")) {
      taxonomy = resolve(a.slice("--taxonomy=".length));
    } else if (a.startsWith("--by-guardrail=")) {
      byGuardrail = a.slice("--by-guardrail=".length).trim();
    } else if (a.startsWith("--by-concern=")) {
      byConcern = a.slice("--by-concern=".length).trim();
    } else if (a.startsWith("--migrate=")) {
      migrate = a.slice("--migrate=".length).trim();
    } else if (a.startsWith("--target-concern=")) {
      targetConcern = a.slice("--target-concern=".length).trim();
    } else if (a === "--keep-old") {
      keepOld = true;
    } else if (a === "--force") {
      force = true;
    } else if (a === "--with-linter") {
      withLinter = true;
    } else if (a === "--yes") {
      yes = true;
    } else {
      args.push(a);
    }
  }
  const sub = args[0];

  if (sub === "new") {
    if (migrate) {
      await cmdMigrate(projectRoot, { migrate, targetConcern, keepOld, taxonomy });
      return;
    }
    if (concern) {
      await cmdNewConcern(projectRoot, { concern, enrichFromAdr, taxonomy, force });
      return;
    }
    await cmdNew(args[1], projectRoot, { fromAdr, force, taxonomy, yes });
    return;
  }

  if (sub === "verify") {
    const rest = args.slice(1);
    const strict = rest.includes("--strict");
    const targetId = rest.find(a => !a.startsWith("--"));
    const code = await cmdVerify(targetId, strict, projectRoot);
    process.exit(code);
  }

  if (sub === "audit") {
    const code = await cmdAudit(args[1], projectRoot);
    process.exit(code);
  }

  if (sub === "search") {
    const code = await cmdSearch(projectRoot, { byGuardrail, byConcern, taxonomy });
    process.exit(code);
  }

  if (sub === "eject") {
    await cmdEject(args[1], projectRoot, { force, withLinter });
    return;
  }

  console.error("Usage: devflow standards <new|verify|audit|search|eject> [args]");
  console.error("  new --concern=<id>                    Generate std from concern taxonomy (concern-first — preferred)");
  console.error("  new --concern=<id> --enrich-from-adr=<csv>  Concern std enriched with ADR guardrails");
  console.error("  new <id>                              Scaffold std-<id>.md + machine/std-<id>.js (TODO markers)");
  console.error("  new <id> --from-adr=<slug>[,<slug>]   Derive std-<id> from ADR(s) — LEGACY lib-centric, emits warning");
  console.error("  new <id> --from-adr=<slug> --force    Overwrite existing std-<id>.md");
  console.error("  verify [<id>] [--strict]              Validate standards (lightweight)");
  console.error("  audit <id>                            Deep audit (5 checks: scaffold/linter/refs/...)");
  console.error("  search --by-guardrail=<adr-slug>      List stds referencing an ADR (JSON)");
  console.error("  search --by-concern=<concern-id>      List ADRs matching a concern (JSON)");
  console.error("  eject <id> [--force]                  Copy plugin default std-<id>.md → project (linter anulado)");
  console.error("  eject <id> --with-linter [--force]    Eject + traz/cria o linter no machine/ do projeto e religa enforcement");
  console.error("");
  console.error("  Common: --project=<path> to operate on a fixture/sub-project.");
  process.exit(2);
}

async function cmdAudit(targetId, projectRoot) {
  const { auditStandard } = await import("./lib/standard-audit.mjs");
  if (!targetId) {
    console.error("Usage: devflow standards audit <id>");
    return 2;
  }
  // Resolve id → file path (DDC v2: canônico engineering/standards + fallback legado)
  const fname = targetId.startsWith("std-") ? `${targetId}.md` : `std-${targetId}.md`;
  const readDirs = resolveReadPaths(projectRoot, "standards");
  let filePath = null;
  for (const dir of readDirs) {
    const cand = `${dir}/${fname}`;
    if (existsSync(cand)) { filePath = cand; break; }
  }
  // Não encontrado em nenhum path → aponta o canônico para o S0 reportar "not found".
  if (!filePath) filePath = `${readDirs[0]}/${fname}`;
  const r = auditStandard(filePath, projectRoot);
  console.log(`=== Audit: ${fname} ===`);
  console.log(`Resumo: ${r.summary.pass} PASS · ${r.summary.fail} FAIL · ${r.summary.warn} WARN\n`);
  for (const c of r.checks) {
    const icon = c.status === "PASS" ? "✅" : c.status === "WARN" ? "⚠️ " : "❌";
    console.log(`  ${icon} ${c.id} ${c.name.padEnd(32)} ${c.status.padEnd(4)} ${c.diagnosis}`);
  }
  console.log(`\nGate: ${r.gate}`);
  return r.gate === "PASSED" ? 0 : 1;
}

main().catch(err => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
