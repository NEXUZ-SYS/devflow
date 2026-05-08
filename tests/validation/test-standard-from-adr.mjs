#!/usr/bin/env node
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  parseAdrSections,
  guardrailsToAntiPatterns,
  enforcementToLinterRules,
  deriveStdId,
  deriveApplyTo,
  buildStandardFromAdrs,
  resolveAdrSlug,
} from "../../scripts/lib/standard-from-adr.mjs";

const TEST_TMP_ROOT = "./tests/validation/tmp/";

function fixture() {
  mkdirSync(TEST_TMP_ROOT, { recursive: true });
  const root = mkdtempSync(join(TEST_TMP_ROOT, "stdfromadr-"));
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

const ADR_TYPESCRIPT_FRONTEND = `---
type: adr
name: adr-typescript-frontend
description: TypeScript 5.9.x como linguagem tipada da camada Frontend
scope: organizational
source: local
stack: TypeScript 5.9.x
category: arquitetura
status: Proposto
version: 1.0.0
created: 2026-05-07
supersedes: []
refines: []
protocol_contract: null
decision_kind: firm
---

# ADR — TypeScript 5.9.x no Frontend

## Contexto
Componentes React 19 + Tauri 2 + Zustand. Necessário tipagem cross-componente.

## Decisão
Adotar TypeScript 5.9.x como linguagem única do Frontend. \`strict: true\` obrigatório. Tipos derivam de Zod schemas via \`z.infer\`. Generics em hooks/components.

## Alternativas Consideradas
- **JavaScript puro** — sem type safety, refactors quebram silenciosamente
- **Flow** — abandonado pelo ecossistema React
- **TypeScript 5.9.x** ✓ — type safety + ecossistema maduro

## Consequências

**Positivas**
- type safety cross-componente
- IDE autocomplete

**Negativas**
- build time +20%

**Riscos aceitos**
- compile errors em CI

## Guardrails
- SEMPRE usar \`strict: true\` no tsconfig.json
- NUNCA usar \`any\` exceto em type guards
- NUNCA declarar interfaces manualmente quando schema Zod existe — use \`z.infer\`
- QUANDO importar de pacotes externos sem tipos, ENTÃO criar \`.d.ts\` em \`@types/\`

## Enforcement
- [ ] Code review: nenhum \`as any\` em PR sem comment justificando
- [ ] Lint: \`@typescript-eslint/no-explicit-any\`
- [ ] Teste: \`tsc --noEmit\` no pre-commit
- [ ] Gate CI/PREVC: tipo-check obrigatório

## Evidências / Anexos

**Fontes oficiais:** [TypeScript Handbook](https://typescriptlang.org/docs) · [TC39](https://tc39.es)
\`\`\`typescript
const x: number = 1;
\`\`\`
`;

function writeAdr(root, filename, content) {
  const dir = join(root, ".context", "adrs");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, filename), content);
  return join(dir, filename);
}

// ─── parseAdrSections ───────────────────────────────────────────────────────

test("parseAdrSections: extracts Decisão, Guardrails, Enforcement, Evidências", () => {
  const sec = parseAdrSections(ADR_TYPESCRIPT_FRONTEND);
  assert.match(sec.decisao, /TypeScript 5\.9\.x como linguagem única/);
  assert.match(sec.guardrails, /SEMPRE usar `strict: true`/);
  assert.match(sec.guardrails, /NUNCA usar `any`/);
  assert.match(sec.enforcement, /no-explicit-any/);
  assert.match(sec.evidencias, /TypeScript Handbook/);
});

test("parseAdrSections: returns empty strings for missing sections", () => {
  const sec = parseAdrSections("# ADR\n\n## Decisão\nx\n");
  assert.equal(sec.decisao, "x");
  assert.equal(sec.guardrails, "");
  assert.equal(sec.enforcement, "");
});

// ─── guardrailsToAntiPatterns ───────────────────────────────────────────────

test("guardrailsToAntiPatterns: NUNCA bullet → antipattern row (errado from NUNCA, certo from inversion)", () => {
  const text = `- SEMPRE usar strict
- NUNCA usar \`any\` exceto em type guards
- NUNCA declarar interfaces manualmente quando schema Zod existe
- QUANDO X, ENTÃO Y`;
  const rows = guardrailsToAntiPatterns(text);
  assert.equal(rows.length, 2, "should extract 2 NUNCA bullets as anti-pattern rows");
  assert.match(rows[0].errado, /any.*type guards/);
  assert.match(rows[1].errado, /interfaces manualmente.*Zod/);
});

test("guardrailsToAntiPatterns: empty when no NUNCA bullets", () => {
  const rows = guardrailsToAntiPatterns("- SEMPRE algo\n- QUANDO X, ENTÃO Y");
  assert.equal(rows.length, 0);
});

// ─── enforcementToLinterRules ────────────────────────────────────────────────

test("enforcementToLinterRules: extracts checkbox items as numbered rules", () => {
  const text = `- [ ] Code review: no \`as any\` in PR
- [ ] Lint: @typescript-eslint/no-explicit-any
- [ ] Teste: tsc --noEmit no pre-commit
- [ ] Gate CI/PREVC: typecheck`;
  const rules = enforcementToLinterRules(text);
  assert.equal(rules.length, 4);
  assert.match(rules[0], /no-explicit-any|as any/);
  assert.match(rules[1], /no-explicit-any/);
});

// ─── deriveStdId / deriveApplyTo ────────────────────────────────────────────

test("deriveStdId: strips adr- prefix and camada-suffix", () => {
  assert.equal(deriveStdId("adr-typescript-frontend"), "std-typescript");
  assert.equal(deriveStdId("adr-zod-bff"), "std-zod");
  assert.equal(deriveStdId("adr-husky-lint-staged-frontend"), "std-husky-lint-staged");
  assert.equal(deriveStdId("adr-error-handling"), "std-error-handling");
  // Already prefixed → idempotent
  assert.equal(deriveStdId("std-typescript"), "std-typescript");
});

test("deriveApplyTo: maps stack to glob list", () => {
  assert.deepEqual(deriveApplyTo("TypeScript 5.9.x"), ["**/*.ts", "**/*.tsx"]);
  assert.deepEqual(deriveApplyTo("Python 3.13"), ["**/*.py"]);
  assert.deepEqual(deriveApplyTo("Rust 1.75"), ["**/*.rs"]);
  // Unknown stack → fallback
  assert.deepEqual(deriveApplyTo("Datadog"), ["src/**"]);
  assert.deepEqual(deriveApplyTo(""), ["src/**"]);
});

// ─── resolveAdrSlug ─────────────────────────────────────────────────────────

test("resolveAdrSlug: resolves numeric prefix to file path", () => {
  const { root, cleanup } = fixture();
  try {
    writeAdr(root, "001-adr-typescript-frontend-v1.0.0.md", ADR_TYPESCRIPT_FRONTEND);
    writeAdr(root, "002-adr-typescript-bff-v1.0.0.md", ADR_TYPESCRIPT_FRONTEND);
    const path1 = resolveAdrSlug("001", root);
    assert.match(path1, /001-adr-typescript-frontend-v1\.0\.0\.md$/);
    const path2 = resolveAdrSlug("adr-typescript-bff", root);
    assert.match(path2, /002-adr-typescript-bff-v1\.0\.0\.md$/);
  } finally {
    cleanup();
  }
});

test("resolveAdrSlug: throws when no match", () => {
  const { root, cleanup } = fixture();
  try {
    mkdirSync(join(root, ".context", "adrs"), { recursive: true });
    assert.throws(() => resolveAdrSlug("ghost", root), /not found|no ADR/);
  } finally {
    cleanup();
  }
});

// ─── buildStandardFromAdrs (integration) ─────────────────────────────────────

test("buildStandardFromAdrs: single ADR produces complete standard (no TODO, no scaffolded:true)", () => {
  const { root, cleanup } = fixture();
  try {
    writeAdr(root, "001-adr-typescript-frontend-v1.0.0.md", ADR_TYPESCRIPT_FRONTEND);
    const std = buildStandardFromAdrs(["001"], { projectRoot: root });

    // Frontmatter checks
    assert.match(std, /^---/);
    assert.match(std, /id: std-typescript/);
    assert.match(std, /applyTo: \["\*\*\/\*\.ts", "\*\*\/\*\.tsx"\]/);
    assert.match(std, /relatedAdrs: \["adr-typescript-frontend"\]/);
    assert.match(std, /enforcement:\n  linter: standards\/machine\/std-typescript\.js/);

    // No scaffolded flag
    assert.doesNotMatch(std, /scaffolded:\s*true/, "must NOT include scaffolded:true");

    // No TODO markers
    assert.doesNotMatch(std, /\bTODO\b/, "must NOT include TODO");
    assert.doesNotMatch(std, /<padrão errado>|<one-line description>|<a definir>/i,
      "must NOT include scaffold placeholders");

    // Required sections
    assert.match(std, /^# Standard: typescript/m);
    assert.match(std, /^## Princípios/m);
    assert.match(std, /^## Anti-patterns/m);
    assert.match(std, /^## Linter/m);
    assert.match(std, /^## Referência/m);

    // Content extracted from ADR
    assert.match(std, /TypeScript 5\.9\.x/, "should mention stack from ADR");
  } finally {
    cleanup();
  }
});

test("buildStandardFromAdrs: multi-ADR consolidates relatedAdrs", () => {
  const { root, cleanup } = fixture();
  try {
    writeAdr(root, "001-adr-typescript-frontend-v1.0.0.md", ADR_TYPESCRIPT_FRONTEND);
    const adr2 = ADR_TYPESCRIPT_FRONTEND
      .replace("adr-typescript-frontend", "adr-typescript-bff")
      .replace("Camada Frontend", "Camada BFF");
    writeAdr(root, "002-adr-typescript-bff-v1.0.0.md", adr2);

    const std = buildStandardFromAdrs(["001", "002"], { projectRoot: root });
    assert.match(std, /relatedAdrs: \["adr-typescript-frontend",\s*"adr-typescript-bff"\]/);
    // Description should signal cross-ADR consolidation
    assert.match(std, /id: std-typescript/);
  } finally {
    cleanup();
  }
});

test("buildStandardFromAdrs: throws when no ADR resolved", () => {
  const { root, cleanup } = fixture();
  try {
    mkdirSync(join(root, ".context", "adrs"), { recursive: true });
    assert.throws(
      () => buildStandardFromAdrs(["999"], { projectRoot: root }),
      /not found|no ADR/
    );
  } finally {
    cleanup();
  }
});

test("buildStandardFromAdrs: preserves at least 1 anti-pattern row from NUNCA guardrails", () => {
  const { root, cleanup } = fixture();
  try {
    writeAdr(root, "001-adr-typescript-frontend-v1.0.0.md", ADR_TYPESCRIPT_FRONTEND);
    const std = buildStandardFromAdrs(["001"], { projectRoot: root });
    // Anti-patterns table must have at least 1 row (from NUNCA `any` and NUNCA interfaces)
    const apMatch = std.match(/## Anti-patterns([\s\S]*?)(?:\n## |\n# |$)/);
    assert.ok(apMatch, "Anti-patterns section must exist");
    const apRows = (apMatch[1].match(/^\|.*\|.*\|$/gm) || []).filter(r => !/^\|\s*-+\s*\|/.test(r));
    assert.ok(apRows.length >= 2,
      `Anti-patterns table must have ≥2 rows (header + ≥1 data); got ${apRows.length}`);
  } finally {
    cleanup();
  }
});

test("buildStandardFromAdrs: passes audit S1-S5 when written to disk", async () => {
  const { root, cleanup } = fixture();
  try {
    writeAdr(root, "001-adr-typescript-frontend-v1.0.0.md", ADR_TYPESCRIPT_FRONTEND);
    const std = buildStandardFromAdrs(["001"], { projectRoot: root });

    // Write the standard + a stub linter, then audit it
    const stdsDir = join(root, ".context", "standards");
    const machineDir = join(stdsDir, "machine");
    mkdirSync(machineDir, { recursive: true });
    writeFileSync(join(stdsDir, "std-typescript.md"), std);
    writeFileSync(join(machineDir, "std-typescript.js"), "#!/usr/bin/env node\nprocess.exit(0);\n");

    const { auditStandard } = await import("../../scripts/lib/standard-audit.mjs");
    const result = auditStandard(join(stdsDir, "std-typescript.md"), root);
    assert.equal(result.gate, "PASSED",
      `Generated standard must pass audit; got ${result.gate}. Failures: ${
        result.checks.filter(c => c.status !== "PASS").map(c => `${c.id}=${c.status}:${c.diagnosis}`).join("; ")
      }`);
  } finally {
    cleanup();
  }
});
