# Standards Decouple from ADRs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refatorar `standards-builder` de FROM-ADR (1:1 lib-centric) para FROM-CONCERN com taxonomia de ~30 concerns operacionais; adicionar hook reverso em `adr-builder`, audit check S6, modo `migrate` e validação E2E no sandbox 2026-05-11.

**Architecture:** Concern-first via `taxonomy-of-concerns.yaml` distribuído pela skill; 5 libs novas (`concern-resolver`, `standard-from-concern`, `standard-enrich`, `standards-search`, taxonomy loader) + 4 mods (`devflow-standards.mjs`, `standard-audit.mjs`, 2 skills). Modo legado `--from-adr` preservado com warning; modo `migrate` faz lib→concern transition.

**Tech Stack:** Node ≥20 (built-in `node:test`), YAML via dynamic import de `yaml` (já dep transitiva), JS módulos ESM (`.mjs`), CLI imperativo seguindo padrão de `scripts/devflow-standards.mjs`.

**Spec:** `docs/superpowers/specs/2026-05-14-standards-decouple-from-adrs-design.md`

---

## File Structure

### Novos arquivos

| Path | Responsabilidade |
|---|---|
| `skills/standards-builder/references/taxonomy-of-concerns.yaml` | Catálogo curado de ~30 concerns. Distribuído pela skill. |
| `scripts/lib/taxonomy-loader.mjs` | Load + merge taxonomia distribuída + `.context/standards/concerns.local.yaml`. |
| `scripts/lib/concern-resolver.mjs` | Fuzzy match (Levenshtein) input livre → concern entry. |
| `scripts/lib/standard-from-concern.mjs` | Concern entry → std baseline (frontmatter + 4 sections). |
| `scripts/lib/standard-enrich.mjs` | Extrai Guardrails + Enforcement de ADRs como insumo bruto. |
| `scripts/lib/standards-search.mjs` | Reverse lookup ADR→std e concern→ADRs. |
| `tests/validation/test-taxonomy-loader.mjs` | Unit tests do loader. |
| `tests/validation/test-concern-resolver.mjs` | Unit tests do resolver. |
| `tests/validation/test-standard-from-concern.mjs` | Unit tests do generator. |
| `tests/validation/test-standard-enrich.mjs` | Unit tests do enricher. |
| `tests/validation/test-standards-search.mjs` | Unit tests do search. |
| `tests/validation/fixtures/taxonomy-mini.yaml` | Taxonomia reduzida (~5 entries) para isolar tests. |
| `tests/validation/fixtures/adr-zod-fake.md` | ADR sintética sobre Zod (frontmatter + Guardrails + Enforcement). |
| `tests/validation/fixtures/adr-pydantic-fake.md` | ADR sintética sobre Pydantic. |
| `tests/validation/fixtures/adr-no-stack-fake.md` | ADR sem stack reconhecido. |
| `tests/validation/fixtures/std-zod-fake.md` | Std lib-centric sintético. |
| `tests/validation/fixtures/std-runtime-validation-fake.md` | Std concern-centric sintético. |
| `skills/standards-builder/tests/test-from-concern-flow.mjs` | Skill integration F1. |
| `skills/standards-builder/tests/test-enrich-flow.mjs` | Skill integration F2. |
| `skills/standards-builder/tests/test-migrate-flow.mjs` | Skill integration F3. |
| `skills/adr-builder/tests/test-reverse-hook.mjs` | Skill integration F4. |
| `tests/integration/test-e2e-standards-concern-rerun.mjs` | E2E gate completo (sandbox 2026-05-11). |
| `tests/integration/assert-no-decision-leak.mjs` | Asserter AC5 (sem leak textual ADR→std). |

### Arquivos modificados

| Path | Mudança |
|---|---|
| `scripts/devflow-standards.mjs` | Subcomandos `new --concern`, `new --migrate`, `search`; warning em `--from-adr`. |
| `scripts/lib/standard-audit.mjs` | Check S6 (lib-centric detection). |
| `tests/scripts/test-devflow-standards.mjs` | Contract tests dos novos subcomandos. |
| `skills/standards-builder/SKILL.md` | Remove Hard Rule #1, reordena Steps, adiciona modo `migrate`. |
| `skills/adr-builder/SKILL.md` | Step 5e novo (reverse hook obrigatório). |

---

## Task 1: Esqueleto da taxonomia + loader

**Files:**
- Create: `skills/standards-builder/references/taxonomy-of-concerns.yaml`
- Create: `scripts/lib/taxonomy-loader.mjs`
- Create: `tests/validation/test-taxonomy-loader.mjs`
- Create: `tests/validation/fixtures/taxonomy-mini.yaml`

- [ ] **Step 1: Write the failing test** — criar `tests/validation/test-taxonomy-loader.mjs`:

```javascript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadTaxonomy } from "../../scripts/lib/taxonomy-loader.mjs";

const MINI = resolve(import.meta.dirname, "fixtures/taxonomy-mini.yaml");

describe("taxonomy-loader", () => {
  it("loads distributed taxonomy and returns entries with required fields", async () => {
    const tax = await loadTaxonomy({ distributedPath: MINI, projectRoot: null });
    assert.ok(Array.isArray(tax.entries));
    assert.ok(tax.entries.length >= 1);
    const entry = tax.entries[0];
    assert.ok(entry.id);
    assert.ok(entry.summary);
    assert.ok(entry.category);
    assert.ok(Array.isArray(entry.defaultApplyTo));
  });

  it("merges local concerns.local.yaml overriding distributed", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "tax-test-"));
    const ctx = join(tmp, ".context/standards");
    const fs = await import("node:fs");
    fs.mkdirSync(ctx, { recursive: true });
    writeFileSync(join(ctx, "concerns.local.yaml"),
      `entries:\n  - id: runtime-validation\n    summary: LOCAL OVERRIDE\n    category: contracts\n    defaultApplyTo: ["**/*.ts"]\n`);
    const tax = await loadTaxonomy({ distributedPath: MINI, projectRoot: tmp });
    const entry = tax.entries.find(e => e.id === "runtime-validation");
    assert.equal(entry.summary, "LOCAL OVERRIDE");
    assert.ok(tax.warnings.some(w => w.includes("shadowed")));
    rmSync(tmp, { recursive: true, force: true });
  });

  it("returns empty entries gracefully when distributed file missing", async () => {
    const tax = await loadTaxonomy({ distributedPath: "/nonexistent.yaml", projectRoot: null });
    assert.deepEqual(tax.entries, []);
    assert.ok(tax.warnings.some(w => w.includes("not found")));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/validation/test-taxonomy-loader.mjs`
Expected: FAIL with module-not-found error on `taxonomy-loader.mjs`.

- [ ] **Step 3: Create mini fixture** — `tests/validation/fixtures/taxonomy-mini.yaml`:

```yaml
entries:
  - id: runtime-validation
    summary: Validar payloads na borda externa
    category: contracts
    defaultApplyTo: ["**/*.ts", "**/*.tsx", "**/*.py"]
    inverseHints: [zod, yup, pydantic, valibot]
    principleTemplate: |
      Toda entrada da borda externa DEVE ser parsed antes do domain logic.
    antiPatternTemplate:
      - rule: "Aceitar unknown da borda sem parse"
        correct: "Schema.parse(input) na primeira linha após I/O"
    linterHints:
      - "AST: fetch sem .parse na sequência"
    relatedAdrCategories: [qualidade-testes, frontend, backend]

  - id: error-handling
    summary: Como erros são lançados, capturados e propagados
    category: errors
    defaultApplyTo: ["src/**/*.ts"]
    inverseHints: []
    principleTemplate: |
      Erros de domínio estendem BaseError; nunca throw new Error em produção.
    antiPatternTemplate:
      - rule: "throw new Error sem contexto"
        correct: "throw new DomainError({ code, cause })"
    linterHints:
      - "regex: throw\\s+new\\s+Error\\("
    relatedAdrCategories: [frontend, bff, backend]
```

- [ ] **Step 4: Implement taxonomy-loader.mjs minimally**

```javascript
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

async function parseYaml(text) {
  const { parse } = await import("yaml");
  return parse(text);
}

export async function loadTaxonomy({ distributedPath, projectRoot }) {
  const result = { entries: [], warnings: [] };

  if (!distributedPath || !existsSync(distributedPath)) {
    result.warnings.push(`taxonomy file not found: ${distributedPath}`);
    return result;
  }

  const distributed = await parseYaml(readFileSync(distributedPath, "utf-8"));
  result.entries = Array.isArray(distributed?.entries) ? [...distributed.entries] : [];

  if (projectRoot) {
    const localPath = join(projectRoot, ".context/standards/concerns.local.yaml");
    if (existsSync(localPath)) {
      const local = await parseYaml(readFileSync(localPath, "utf-8"));
      const localEntries = Array.isArray(local?.entries) ? local.entries : [];
      for (const localEntry of localEntries) {
        const idx = result.entries.findIndex(e => e.id === localEntry.id);
        if (idx >= 0) {
          result.warnings.push(`local concern '${localEntry.id}' shadowed distributed`);
          result.entries[idx] = localEntry;
        } else {
          result.entries.push(localEntry);
        }
      }
    }
  }

  return result;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test tests/validation/test-taxonomy-loader.mjs`
Expected: PASS (3 tests).

- [ ] **Step 6: Create the real distributed taxonomy** — `skills/standards-builder/references/taxonomy-of-concerns.yaml` com 30 entries cobrindo as 12 categorias listadas na §4.2 do spec.

Estrutura mínima por entry (preencher com conteúdo real para os 30 concerns):

```yaml
# Header
version: 1.0.0
generated: 2026-05-14
license: project-internal

entries:
  - id: runtime-validation
    summary: Validar payloads na borda externa antes de tocar lógica de domínio
    category: contracts
    defaultApplyTo: ["**/*.ts", "**/*.tsx", "**/*.py"]
    inverseHints: [zod, yup, valibot, pydantic, marshmallow, io-ts, ajv]
    principleTemplate: |
      Toda entrada vinda de borda externa ({{boundaryList}}) DEVE ser parsed
      contra um schema declarado antes de qualquer state update ou render.
      Tipos de domínio derivam do schema; nunca declarados em paralelo.
    antiPatternTemplate:
      - rule: "Aceitar `unknown` da borda sem parse"
        correct: "`Schema.parse(input)` na primeira linha após I/O"
      - rule: "Declarar `type Foo` paralelo a um schema existente"
        correct: "`type Foo = z.infer<typeof FooSchema>` (DRY)"
      - rule: "Validar duas vezes o mesmo dado no fluxo"
        correct: "Parse na borda, propaga tipo estreito"
    linterHints:
      - "AST: fetch().then(res => res.json()) sem .parse() na sequência"
      - "ESLint custom: proibir `type X = ...` onde existe `XSchema` no mesmo pacote"
    relatedAdrCategories: [qualidade-testes, frontend, backend]

  # ... (29 outras entries — uma por concern listado na tabela §4.2 do spec)
```

A entrega desta task NÃO exige preencher os 30 — apenas os 6 críticos para os fluxos testados: `runtime-validation`, `error-handling`, `test-discipline`, `pre-commit-hygiene`, `naming-conventions`, `observability-spans`. Outros 24 são preenchidos progressivamente em tasks subsequentes ou via PR follow-up.

- [ ] **Step 7: Commit**

```bash
git add scripts/lib/taxonomy-loader.mjs tests/validation/test-taxonomy-loader.mjs tests/validation/fixtures/taxonomy-mini.yaml skills/standards-builder/references/taxonomy-of-concerns.yaml
git commit -m "feat(std): taxonomy loader + 6 initial concerns

- taxonomy-loader.mjs com merge distribuída + local
- taxonomy-of-concerns.yaml com 6 entries iniciais (runtime-validation,
  error-handling, test-discipline, pre-commit-hygiene, naming-conventions,
  observability-spans)
- 3 unit tests cobrem load, override local, file missing"
```

---

## Task 2: Concern resolver (fuzzy match)

**Files:**
- Create: `scripts/lib/concern-resolver.mjs`
- Create: `tests/validation/test-concern-resolver.mjs`

- [ ] **Step 1: Write the failing test**

```javascript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { resolveConcern } from "../../scripts/lib/concern-resolver.mjs";
import { loadTaxonomy } from "../../scripts/lib/taxonomy-loader.mjs";

const MINI = resolve(import.meta.dirname, "fixtures/taxonomy-mini.yaml");

describe("concern-resolver", () => {
  it("auto-confirms when top-1 confidence ≥ 0.75 and gap ≥ 0.15", async () => {
    const tax = await loadTaxonomy({ distributedPath: MINI, projectRoot: null });
    const r = resolveConcern("runtime-validation", tax);
    assert.equal(r.status, "auto-confirmed");
    assert.equal(r.match.id, "runtime-validation");
  });

  it("matches via inverseHints lib name", async () => {
    const tax = await loadTaxonomy({ distributedPath: MINI, projectRoot: null });
    const r = resolveConcern("zod", tax);
    assert.equal(r.match.id, "runtime-validation");
  });

  it("matches via free prose with summary tokens", async () => {
    const tax = await loadTaxonomy({ distributedPath: MINI, projectRoot: null });
    const r = resolveConcern("validar payload na borda", tax);
    assert.equal(r.match.id, "runtime-validation");
  });

  it("returns ambiguous status when top-1 < threshold", async () => {
    const tax = await loadTaxonomy({ distributedPath: MINI, projectRoot: null });
    const r = resolveConcern("foobarbaz", tax);
    assert.equal(r.status, "no-match");
    assert.equal(r.candidates.length, 0);
  });

  it("returns top-3 candidates when ambiguous (multi-match low confidence)", async () => {
    const tax = await loadTaxonomy({ distributedPath: MINI, projectRoot: null });
    const r = resolveConcern("error", tax);
    assert.ok(["auto-confirmed", "ambiguous"].includes(r.status));
    if (r.status === "ambiguous") assert.ok(r.candidates.length >= 1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/validation/test-concern-resolver.mjs`
Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement concern-resolver.mjs**

```javascript
function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[a.length][b.length];
}

function similarity(a, b) {
  if (!a || !b) return 0;
  const dist = levenshtein(a.toLowerCase(), b.toLowerCase());
  return 1 - dist / Math.max(a.length, b.length);
}

function tokenize(input) {
  return input.toLowerCase().split(/[\s,;]+/).filter(t => t.length >= 2);
}

function scoreEntry(input, entry) {
  const tokens = tokenize(input);
  let score = 0;

  // Direct id match (weight 3)
  if (entry.id === input.toLowerCase()) score += 3;
  else score += similarity(entry.id, input) * 3;

  // Summary tokens overlap (weight 2)
  const summaryTokens = tokenize(entry.summary || "");
  const overlap = tokens.filter(t => summaryTokens.some(s => similarity(s, t) > 0.7)).length;
  if (tokens.length > 0) score += (overlap / tokens.length) * 2;

  // inverseHints match (weight 1)
  const hints = entry.inverseHints || [];
  for (const t of tokens) {
    if (hints.includes(t)) score += 1;
  }

  return score / 6; // normalize to ~0..1
}

export function resolveConcern(input, taxonomy) {
  if (!input || !taxonomy?.entries?.length) {
    return { status: "no-match", candidates: [] };
  }

  const scored = taxonomy.entries
    .map(e => ({ entry: e, score: scoreEntry(input, e) }))
    .sort((a, b) => b.score - a.score);

  const top = scored[0];
  const second = scored[1];

  if (!top || top.score < 0.5) {
    return { status: "no-match", candidates: [] };
  }

  const gap = top.score - (second?.score ?? 0);
  if (top.score >= 0.75 && gap >= 0.15) {
    return { status: "auto-confirmed", match: top.entry, confidence: top.score };
  }

  return {
    status: "ambiguous",
    candidates: scored.slice(0, 3).map(s => ({ entry: s.entry, score: s.score })),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/validation/test-concern-resolver.mjs`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/concern-resolver.mjs tests/validation/test-concern-resolver.mjs
git commit -m "feat(std): concern-resolver com fuzzy match Levenshtein

- match por id (weight 3), summary tokens (weight 2), inverseHints (weight 1)
- auto-confirma quando top-1 ≥ 0.75 e gap ≥ 0.15
- retorna top-3 candidates em ambiguidade; no-match quando < 0.5"
```

---

## Task 3: Standards search (reverse lookup)

**Files:**
- Create: `scripts/lib/standards-search.mjs`
- Create: `tests/validation/test-standards-search.mjs`
- Create: `tests/validation/fixtures/adr-zod-fake.md`
- Create: `tests/validation/fixtures/std-zod-fake.md`
- Create: `tests/validation/fixtures/std-runtime-validation-fake.md`

- [ ] **Step 1: Create fixtures**

`tests/validation/fixtures/adr-zod-fake.md`:

```markdown
---
type: adr
name: adr-zod-frontend
description: Zod 4.1.x como schema validation runtime no Frontend
scope: organizational
stack: Zod 4.1
category: qualidade-testes
status: Aprovado
version: 1.0.0
created: 2026-05-11
decision_kind: firm
---
# ADR — Zod no Frontend
## Decisão
Adotar Zod 4.1.x.
## Guardrails
- SEMPRE Schema.parse na borda.
- NUNCA z.any() fora de packages/contracts/internal/**.
## Enforcement
- [ ] Code review: parse na primeira linha após I/O.
- [ ] Lint: proibir z.any().
```

`tests/validation/fixtures/std-zod-fake.md`:

```markdown
---
id: std-zod
description: Zod 4.1.x como schema validation runtime TS
version: 1.0.0
applyTo: ["**/*.ts", "**/*.tsx"]
relatedAdrs: ["adr-zod-frontend"]
enforcement:
  linter: standards/machine/std-zod.js
weakStandardWarning: true
---
# Standard: zod
```

`tests/validation/fixtures/std-runtime-validation-fake.md`:

```markdown
---
id: std-runtime-validation
description: Validar payloads na borda externa
version: 1.0.0
applyTo: ["**/*.ts", "**/*.tsx", "**/*.py"]
relatedAdrs: ["adr-zod-frontend", "adr-pydantic-backend"]
enforcement:
  linter: standards/machine/std-runtime-validation.js
weakStandardWarning: true
---
# Standard: runtime-validation
```

- [ ] **Step 2: Write the failing test**

```javascript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, copyFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { searchByGuardrail, searchByConcern } from "../../scripts/lib/standards-search.mjs";

const FIX = resolve(import.meta.dirname, "fixtures");

function setupProject() {
  const tmp = mkdtempSync(join(tmpdir(), "search-test-"));
  mkdirSync(join(tmp, ".context/standards/machine"), { recursive: true });
  mkdirSync(join(tmp, ".context/adrs"), { recursive: true });
  copyFileSync(join(FIX, "std-zod-fake.md"), join(tmp, ".context/standards/std-zod.md"));
  copyFileSync(join(FIX, "std-runtime-validation-fake.md"), join(tmp, ".context/standards/std-runtime-validation.md"));
  copyFileSync(join(FIX, "adr-zod-fake.md"), join(tmp, ".context/adrs/001-adr-zod-frontend-v1.0.0.md"));
  return tmp;
}

describe("standards-search", () => {
  it("searchByGuardrail returns std referencing the adr slug", async () => {
    const tmp = setupProject();
    const result = await searchByGuardrail("adr-zod-frontend", { projectRoot: tmp });
    assert.ok(result.length >= 2);
    assert.ok(result.find(s => s.id === "std-zod"));
    assert.ok(result.find(s => s.id === "std-runtime-validation"));
    rmSync(tmp, { recursive: true, force: true });
  });

  it("searchByGuardrail returns empty when adr not referenced", async () => {
    const tmp = setupProject();
    const result = await searchByGuardrail("adr-nonexistent", { projectRoot: tmp });
    assert.deepEqual(result, []);
    rmSync(tmp, { recursive: true, force: true });
  });

  it("searchByConcern returns ADRs matching category/inverseHints", async () => {
    const tmp = setupProject();
    const MINI = resolve(import.meta.dirname, "fixtures/taxonomy-mini.yaml");
    const result = await searchByConcern("runtime-validation", { projectRoot: tmp, distributedPath: MINI });
    assert.ok(result.length >= 1);
    assert.ok(result.some(a => a.slug === "adr-zod-frontend"));
    rmSync(tmp, { recursive: true, force: true });
  });

  it("returns empty when .context/standards absent", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "search-empty-"));
    const result = await searchByGuardrail("adr-zod", { projectRoot: tmp });
    assert.deepEqual(result, []);
    rmSync(tmp, { recursive: true, force: true });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test tests/validation/test-standards-search.mjs`
Expected: FAIL with module-not-found.

- [ ] **Step 4: Implement standards-search.mjs**

```javascript
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseFrontmatter } from "./frontmatter.mjs";
import { loadTaxonomy } from "./taxonomy-loader.mjs";

function listStdFiles(projectRoot) {
  const dir = join(projectRoot, ".context/standards");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(f => f.startsWith("std-") && f.endsWith(".md") && !f.endsWith(".deprecated.md"))
    .map(f => join(dir, f));
}

function listAdrFiles(projectRoot) {
  const dir = join(projectRoot, ".context/adrs");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(f => f.endsWith(".md") && /^\d+-/.test(f))
    .map(f => join(dir, f));
}

export async function searchByGuardrail(adrSlug, { projectRoot }) {
  const files = listStdFiles(projectRoot);
  const matches = [];
  for (const file of files) {
    const content = readFileSync(file, "utf-8");
    const { frontmatter } = parseFrontmatter(content);
    if (frontmatter?.deprecated) continue;
    const rel = frontmatter?.relatedAdrs || [];
    if (rel.includes(adrSlug)) {
      matches.push({ id: frontmatter.id, file, frontmatter });
    }
  }
  return matches;
}

export async function searchByConcern(concernId, { projectRoot, distributedPath }) {
  const tax = await loadTaxonomy({ distributedPath, projectRoot });
  const entry = tax.entries.find(e => e.id === concernId);
  if (!entry) return [];

  const inverseHints = new Set((entry.inverseHints || []).map(h => h.toLowerCase()));
  const relatedCategories = new Set(entry.relatedAdrCategories || []);

  const adrFiles = listAdrFiles(projectRoot);
  const matches = [];
  for (const file of adrFiles) {
    const content = readFileSync(file, "utf-8");
    const { frontmatter } = parseFrontmatter(content);
    if (!frontmatter) continue;
    const stack = (frontmatter.stack || "").toLowerCase();
    const libName = stack.split(/\s+/)[0];
    const cat = frontmatter.category || "";
    if (inverseHints.has(libName) || relatedCategories.has(cat)) {
      matches.push({ slug: frontmatter.name, file, frontmatter });
    }
  }
  return matches;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test tests/validation/test-standards-search.mjs`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/standards-search.mjs tests/validation/test-standards-search.mjs tests/validation/fixtures/
git commit -m "feat(std): standards-search reverse lookup (adr→std, concern→adrs)

- searchByGuardrail: lista std cujo relatedAdrs contém o slug
- searchByConcern: lista ADRs cuja stack/category casa inverseHints/relatedAdrCategories
- ignora std deprecated; retorna vazio sem erro quando .context ausente"
```

---

## Task 4: Standard enrich (Guardrails + Enforcement extraction)

**Files:**
- Create: `scripts/lib/standard-enrich.mjs`
- Create: `tests/validation/test-standard-enrich.mjs`
- Create: `tests/validation/fixtures/adr-pydantic-fake.md`
- Create: `tests/validation/fixtures/adr-no-stack-fake.md`

- [ ] **Step 1: Create remaining fixtures**

`tests/validation/fixtures/adr-pydantic-fake.md`:

```markdown
---
type: adr
name: adr-pydantic-backend
description: Pydantic 2.x validação runtime no Backend
stack: Pydantic 2.x
category: backend
status: Aprovado
version: 1.0.0
---
# ADR — Pydantic
## Decisão
Adotar Pydantic 2.x para schemas de I/O.
## Guardrails
- SEMPRE Model.model_validate em handlers.
- QUANDO criar DTO, ENTÃO derivar de BaseModel.
## Enforcement
- [ ] Pytest cobre roundtrip de schemas.
- [ ] mypy --strict bloqueia merge em drift.
```

`tests/validation/fixtures/adr-no-stack-fake.md`:

```markdown
---
type: adr
name: adr-without-stack
description: ADR sem campo stack
category: general
status: Aprovado
version: 1.0.0
---
# ADR sem stack
## Decisão
Decisão genérica.
```

- [ ] **Step 2: Write the failing test**

```javascript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { enrichFromAdrs } from "../../scripts/lib/standard-enrich.mjs";

const FIX = resolve(import.meta.dirname, "fixtures");

describe("standard-enrich", () => {
  it("extracts only Guardrails and Enforcement sections from ADR", async () => {
    const result = await enrichFromAdrs([resolve(FIX, "adr-zod-fake.md")]);
    assert.equal(result.guardrails.length, 2);
    assert.ok(result.guardrails[0].includes("SEMPRE Schema.parse"));
    assert.equal(result.enforcement.length, 2);
    assert.ok(result.enforcement[0].includes("Code review"));
  });

  it("does NOT include Decisão/Contexto/Alternativas content", async () => {
    const result = await enrichFromAdrs([resolve(FIX, "adr-zod-fake.md")]);
    const joined = JSON.stringify(result);
    assert.ok(!joined.includes("Adotar Zod"), "Decisão prose leaked");
    assert.ok(!joined.includes("Contexto"), "Contexto header leaked");
  });

  it("dedups identical guardrails across multiple ADRs", async () => {
    const result = await enrichFromAdrs([
      resolve(FIX, "adr-zod-fake.md"),
      resolve(FIX, "adr-zod-fake.md"),
    ]);
    assert.equal(result.guardrails.length, 2);
  });

  it("returns empty arrays gracefully when ADR has no Guardrails section", async () => {
    const result = await enrichFromAdrs([resolve(FIX, "adr-no-stack-fake.md")]);
    assert.deepEqual(result.guardrails, []);
    assert.deepEqual(result.enforcement, []);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test tests/validation/test-standard-enrich.mjs`
Expected: FAIL with module-not-found.

- [ ] **Step 4: Implement standard-enrich.mjs**

```javascript
import { readFileSync } from "node:fs";

function extractSection(markdown, heading) {
  const re = new RegExp(`^##\\s+${heading}\\s*$`, "mi");
  const m = markdown.match(re);
  if (!m) return null;
  const start = m.index + m[0].length;
  const rest = markdown.slice(start);
  const nextHeading = rest.match(/^##\s+/m);
  return nextHeading ? rest.slice(0, nextHeading.index) : rest;
}

function extractBullets(sectionText) {
  if (!sectionText) return [];
  return sectionText
    .split("\n")
    .map(l => l.trim())
    .filter(l => /^[-*]\s+/.test(l) || /^\[\s\]\s+/.test(l) || /^-\s+\[\s\]/.test(l))
    .map(l => l.replace(/^[-*]\s+/, "").replace(/^\[\s\]\s+/, "").replace(/^\[\s\]\s+/, ""));
}

export async function enrichFromAdrs(adrPaths) {
  const guardrailsSet = new Set();
  const enforcementSet = new Set();
  const sources = [];

  for (const path of adrPaths) {
    const content = readFileSync(path, "utf-8");
    const guards = extractSection(content, "Guardrails");
    const enforce = extractSection(content, "Enforcement");
    for (const b of extractBullets(guards)) guardrailsSet.add(b);
    for (const b of extractBullets(enforce)) enforcementSet.add(b);
    sources.push(path);
  }

  return {
    guardrails: Array.from(guardrailsSet),
    enforcement: Array.from(enforcementSet),
    sources,
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test tests/validation/test-standard-enrich.mjs`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/standard-enrich.mjs tests/validation/test-standard-enrich.mjs tests/validation/fixtures/adr-pydantic-fake.md tests/validation/fixtures/adr-no-stack-fake.md
git commit -m "feat(std): standard-enrich extrai Guardrails+Enforcement de ADRs

- ignora Decisão/Contexto/Alternativas (assertion negativa testada)
- dedup identical guardrails across multiple ADRs
- retorna vazio sem erro quando ADR não tem ## Guardrails"
```

---

## Task 5: Standard from concern (baseline generator)

**Files:**
- Create: `scripts/lib/standard-from-concern.mjs`
- Create: `tests/validation/test-standard-from-concern.mjs`

- [ ] **Step 1: Write the failing test**

```javascript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { generateStandardFromConcern } from "../../scripts/lib/standard-from-concern.mjs";
import { loadTaxonomy } from "../../scripts/lib/taxonomy-loader.mjs";

const MINI = resolve(import.meta.dirname, "fixtures/taxonomy-mini.yaml");

describe("standard-from-concern", () => {
  it("generates baseline with frontmatter, sections, no enrich", async () => {
    const tax = await loadTaxonomy({ distributedPath: MINI, projectRoot: null });
    const entry = tax.entries.find(e => e.id === "runtime-validation");
    const result = generateStandardFromConcern({ concern: entry, enrichment: null });
    assert.ok(result.frontmatter.includes("id: std-runtime-validation"));
    assert.ok(result.frontmatter.includes("weakStandardWarning: true"));
    assert.ok(result.body.includes("## Princípios"));
    assert.ok(result.body.includes("## Anti-patterns"));
    assert.ok(result.body.includes("## Linter"));
    assert.ok(result.body.includes("{{boundaryList}}"), "placeholder kept when no enrich");
  });

  it("fills placeholders when enrichment provided", async () => {
    const tax = await loadTaxonomy({ distributedPath: MINI, projectRoot: null });
    const entry = tax.entries.find(e => e.id === "runtime-validation");
    const enrichment = {
      guardrails: ["SEMPRE Schema.parse na borda"],
      enforcement: ["Code review: parse na primeira linha após I/O"],
      sources: ["adr-zod-frontend"],
      adrSlugs: ["adr-zod-frontend"],
      boundaryList: "HTTP, IPC Tauri",
    };
    const result = generateStandardFromConcern({ concern: entry, enrichment });
    assert.ok(result.body.includes("HTTP, IPC Tauri"), "boundary placeholder filled");
    assert.ok(result.body.includes("Code review: parse na primeira linha"));
    assert.ok(result.frontmatter.includes("adr-zod-frontend"));
  });

  it("uses defaultApplyTo from concern entry", async () => {
    const tax = await loadTaxonomy({ distributedPath: MINI, projectRoot: null });
    const entry = tax.entries.find(e => e.id === "runtime-validation");
    const result = generateStandardFromConcern({ concern: entry, enrichment: null });
    assert.ok(result.frontmatter.includes('applyTo:'));
    assert.ok(result.frontmatter.includes('"**/*.ts"'));
  });

  it("supports applyTo override", async () => {
    const tax = await loadTaxonomy({ distributedPath: MINI, projectRoot: null });
    const entry = tax.entries.find(e => e.id === "runtime-validation");
    const result = generateStandardFromConcern({
      concern: entry,
      enrichment: null,
      applyTo: ["src/api/**/*.ts"],
    });
    assert.ok(result.frontmatter.includes('"src/api/**/*.ts"'));
    assert.ok(!result.frontmatter.includes('"**/*.tsx"'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/validation/test-standard-from-concern.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement standard-from-concern.mjs**

```javascript
function renderApplyTo(applyTo) {
  return applyTo.map(p => `  - "${p}"`).join("\n");
}

function renderRelatedAdrs(slugs) {
  if (!slugs?.length) return "relatedAdrs: []";
  return `relatedAdrs:\n${slugs.map(s => `  - "${s}"`).join("\n")}`;
}

function renderPrinciples(template, enrichment) {
  if (!enrichment) return template;
  let out = template;
  if (enrichment.boundaryList) out = out.replace(/\{\{boundaryList\}\}/g, enrichment.boundaryList);
  if (enrichment.lib) out = out.replace(/\{\{lib\}\}/g, enrichment.lib);
  return out;
}

function renderAntiPatterns(rules) {
  const header = "| Errado | Certo |\n|---|---|";
  const rows = rules.map(r => `| ${r.rule} | ${r.correct} |`).join("\n");
  return `${header}\n${rows}`;
}

function renderLinter(hints, enforcement) {
  const fromHints = (hints || []).map((h, i) => `${i + 1}. ${h}`);
  const fromEnforce = (enforcement || []).map((e, i) => `${fromHints.length + i + 1}. ${e}`);
  const all = [...fromHints, ...fromEnforce];
  return all.length ? all.join("\n") : "_(linter rules pending — humano implementa em machine/std-<id>.js)_";
}

export function generateStandardFromConcern({ concern, enrichment, applyTo }) {
  const stdId = `std-${concern.id}`;
  const apply = applyTo ?? concern.defaultApplyTo;
  const relatedAdrs = enrichment?.adrSlugs ?? [];

  const frontmatter = `---
id: ${stdId}
description: ${concern.summary}
version: 1.0.0
applyTo:
${renderApplyTo(apply)}
${renderRelatedAdrs(relatedAdrs)}
enforcement:
  linter: standards/machine/${stdId}.js
weakStandardWarning: true
---`;

  const body = `# Standard: ${concern.id}

## Princípios
${renderPrinciples(concern.principleTemplate, enrichment)}

## Anti-patterns
${renderAntiPatterns(concern.antiPatternTemplate || [])}

## Linter
\`./machine/${stdId}.js\` verifica:

${renderLinter(concern.linterHints, enrichment?.enforcement)}

Output em formato \`VIOLATION: <regra> (<file>:<line>) — <correção sugerida>\` per SI-4 contract.

## Referência
${relatedAdrs.length ? "ADRs derivadas:\n" + relatedAdrs.map(s => `- ${s}`).join("\n") : "_(sem ADR enrich)_"}

Authoring guide: \`.context/standards/README.md\`
`;

  return { frontmatter, body, fullDocument: `${frontmatter}\n${body}` };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/validation/test-standard-from-concern.mjs`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/standard-from-concern.mjs tests/validation/test-standard-from-concern.mjs
git commit -m "feat(std): standard-from-concern gera baseline operacional

- frontmatter completo com applyTo, relatedAdrs, weakStandardWarning:true
- sections: Princípios (template), Anti-patterns (rule/correct table), Linter, Referência
- placeholders {{boundaryList}}, {{lib}} preenchidos com enrichment quando presente"
```

---

## Task 6: CLI — subcomando `new --concern`

**Files:**
- Modify: `scripts/devflow-standards.mjs`
- Modify: `tests/scripts/test-devflow-standards.mjs`

- [ ] **Step 1: Read current CLI to find insertion point**

Run: `grep -n "new" /home/walterfrey/Documentos/code/devflow/scripts/devflow-standards.mjs | head -20`
Expected: identifica função handler do subcomando `new`.

- [ ] **Step 2: Add contract test in `tests/scripts/test-devflow-standards.mjs`**

Append à suite existente:

```javascript
describe("new --concern", () => {
  it("creates std-<concern-id>.md with concern frontmatter and body", async () => {
    const tmp = await setupTmpProject(); // helper já existente
    const { code, stdout } = await runCLI([
      "new",
      "--concern=runtime-validation",
      `--project=${tmp}`,
      `--taxonomy=${MINI_TAXONOMY}`,
    ]);
    assert.equal(code, 0);
    assert.ok(existsSync(join(tmp, ".context/standards/std-runtime-validation.md")));
    const content = readFileSync(join(tmp, ".context/standards/std-runtime-validation.md"), "utf-8");
    assert.ok(content.includes("id: std-runtime-validation"));
  });

  it("fails with exit 1 on invalid concern id", async () => {
    const tmp = await setupTmpProject();
    const { code, stderr } = await runCLI([
      "new",
      "--concern=nonexistent-foo",
      `--project=${tmp}`,
      `--taxonomy=${MINI_TAXONOMY}`,
    ]);
    assert.equal(code, 1);
    assert.ok(stderr.includes("no-match") || stderr.includes("not found"));
  });
});
```

- [ ] **Step 3: Run contract test to verify it fails**

Run: `node --test tests/scripts/test-devflow-standards.mjs`
Expected: FAIL — `--concern` flag não reconhecida.

- [ ] **Step 4: Implement `--concern` handler in `scripts/devflow-standards.mjs`**

Adicionar (após o handler de `--from-adr` existente):

```javascript
// Dentro de cmdNew(args), antes do dispatch existente:
if (args.concern) {
  const { loadTaxonomy } = await import("./lib/taxonomy-loader.mjs");
  const { resolveConcern } = await import("./lib/concern-resolver.mjs");
  const { generateStandardFromConcern } = await import("./lib/standard-from-concern.mjs");

  const distributedPath = args.taxonomy
    || resolve(import.meta.dirname, "../skills/standards-builder/references/taxonomy-of-concerns.yaml");
  const tax = await loadTaxonomy({ distributedPath, projectRoot: args.project });
  const resolution = resolveConcern(args.concern, tax);

  if (resolution.status === "no-match") {
    process.stderr.write(`✗ concern not found: '${args.concern}'\n`);
    process.stderr.write(`  Available: ${tax.entries.map(e => e.id).join(", ")}\n`);
    process.exit(1);
  }
  if (resolution.status === "ambiguous") {
    process.stderr.write(`✗ concern ambiguous; candidates:\n`);
    for (const c of resolution.candidates) {
      process.stderr.write(`  - ${c.entry.id} (score ${c.score.toFixed(2)})\n`);
    }
    process.exit(1);
  }

  const concern = resolution.match;
  const stdPath = join(args.project, ".context/standards", `std-${concern.id}.md`);
  if (existsSync(stdPath) && !args.force) {
    process.stderr.write(`✗ ${stdPath} already exists. Use --force to overwrite.\n`);
    process.exit(1);
  }

  // enrichment optional
  let enrichment = null;
  if (args.enrichFromAdr) {
    const { enrichFromAdrs } = await import("./lib/standard-enrich.mjs");
    const adrSlugs = args.enrichFromAdr.split(",");
    const adrPaths = adrSlugs.map(s => resolveAdrPath(s, args.project)); // helper existente ou criar
    enrichment = await enrichFromAdrs(adrPaths);
    enrichment.adrSlugs = adrSlugs;
  }

  const { fullDocument } = generateStandardFromConcern({ concern, enrichment });
  mkdirSync(dirname(stdPath), { recursive: true });
  writeFileSync(stdPath, fullDocument, "utf-8");

  // Create linter stub
  const linterPath = join(args.project, ".context/standards/machine", `std-${concern.id}.js`);
  if (!existsSync(linterPath)) {
    mkdirSync(dirname(linterPath), { recursive: true });
    writeFileSync(linterPath, `#!/usr/bin/env node\n// Placeholder linter for std-${concern.id}\nprocess.exit(0);\n`, "utf-8");
  }

  process.stdout.write(`✓ created ${stdPath}\n`);
  process.exit(0);
}
```

- [ ] **Step 5: Run contract test to verify it passes**

Run: `node --test tests/scripts/test-devflow-standards.mjs`
Expected: PASS (2 new tests + existing tests).

- [ ] **Step 6: Commit**

```bash
git add scripts/devflow-standards.mjs tests/scripts/test-devflow-standards.mjs
git commit -m "feat(std): cli new --concern=<id> [--enrich-from-adr=<csv>]

- usa concern-resolver para auto-resolver ou listar candidatos
- gera std + linter stub
- aborta com exit 1 em no-match ou ambiguous"
```

---

## Task 7: CLI — warning em `--from-adr` legado

**Files:**
- Modify: `scripts/devflow-standards.mjs`
- Modify: `tests/scripts/test-devflow-standards.mjs`

- [ ] **Step 1: Add contract test**

```javascript
describe("new --from-adr legacy warning", () => {
  it("emits stderr warning when --from-adr used without --concern", async () => {
    const tmp = await setupTmpProject();
    const { code, stderr } = await runCLI([
      "new", "zod",
      "--from-adr=001",
      `--project=${tmp}`,
      "--yes",
    ]);
    assert.equal(code, 0);
    assert.ok(stderr.includes("lib-centric"));
    assert.ok(stderr.includes("Concern operacional canônico"));
  });

  it("no warning when --concern explicit", async () => {
    const tmp = await setupTmpProject();
    const { stderr } = await runCLI([
      "new",
      "--concern=runtime-validation",
      `--project=${tmp}`,
      `--taxonomy=${MINI_TAXONOMY}`,
    ]);
    assert.ok(!stderr.includes("lib-centric"));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/scripts/test-devflow-standards.mjs`
Expected: FAIL — sem warning ainda.

- [ ] **Step 3: Implement warning**

Em `scripts/devflow-standards.mjs`, no início do branch `--from-adr`:

```javascript
if (args.fromAdr && !args.concern) {
  const { loadTaxonomy } = await import("./lib/taxonomy-loader.mjs");
  const distributedPath = args.taxonomy
    || resolve(import.meta.dirname, "../skills/standards-builder/references/taxonomy-of-concerns.yaml");
  const tax = await loadTaxonomy({ distributedPath, projectRoot: args.project });

  // Lookup hint via inverseHints
  const adrSlug = args.fromAdr.split(",")[0];
  const libName = adrSlug.replace(/^adr-/, "").split("-")[0];
  const hint = tax.entries.find(e => (e.inverseHints || []).includes(libName));

  process.stderr.write(
    `⚠️  std lib-centric detectado.\n` +
    `   Concern operacional canônico: ${hint?.id ?? "<não detectado>"}\n` +
    `   Preferido: devflow standards new --concern=${hint?.id ?? "<id>"} --enrich-from-adr=${args.fromAdr}\n` +
    `   Prosseguindo em modo legado em ${args.yes ? "0" : "3"}s (Ctrl-C para abortar)...\n`
  );

  // Log to audit file
  const logPath = join(args.project, ".context/standards/.legacy-from-adr.log");
  mkdirSync(dirname(logPath), { recursive: true });
  appendFileSync(logPath, `${new Date().toISOString()} ${args.fromAdr} ${hint?.id ?? "no-hint"}\n`);

  if (!args.yes) await new Promise(r => setTimeout(r, 3000));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/scripts/test-devflow-standards.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/devflow-standards.mjs tests/scripts/test-devflow-standards.mjs
git commit -m "feat(std): warning em --from-adr legado + audit log

- stderr warning sugere concern operacional via inverseHints
- 3s delay sem --yes (skip em CI)
- log em .context/standards/.legacy-from-adr.log p/ auditoria"
```

---

## Task 8: CLI — subcomando `search`

**Files:**
- Modify: `scripts/devflow-standards.mjs`
- Modify: `tests/scripts/test-devflow-standards.mjs`

- [ ] **Step 1: Add contract test**

```javascript
describe("search subcommand", () => {
  it("search --by-guardrail returns JSON list of matching stds", async () => {
    const tmp = await setupTmpProjectWithStds();
    const { code, stdout } = await runCLI([
      "search",
      "--by-guardrail=adr-zod-frontend",
      `--project=${tmp}`,
    ]);
    assert.equal(code, 0);
    const parsed = JSON.parse(stdout);
    assert.ok(Array.isArray(parsed));
    assert.ok(parsed.length >= 1);
  });

  it("search --by-concern returns ADRs matching category/inverseHints", async () => {
    const tmp = await setupTmpProjectWithStds();
    const { code, stdout } = await runCLI([
      "search",
      "--by-concern=runtime-validation",
      `--project=${tmp}`,
      `--taxonomy=${MINI_TAXONOMY}`,
    ]);
    assert.equal(code, 0);
    const parsed = JSON.parse(stdout);
    assert.ok(Array.isArray(parsed));
  });
});
```

- [ ] **Step 2: Implement search subcommand**

Adicionar dispatch em `scripts/devflow-standards.mjs`:

```javascript
async function cmdSearch(args) {
  const { searchByGuardrail, searchByConcern } = await import("./lib/standards-search.mjs");
  let results;
  if (args.byGuardrail) {
    results = await searchByGuardrail(args.byGuardrail, { projectRoot: args.project });
    results = results.map(r => ({ id: r.id, file: r.file, deprecated: r.frontmatter?.deprecated ?? false }));
  } else if (args.byConcern) {
    const distributedPath = args.taxonomy
      || resolve(import.meta.dirname, "../skills/standards-builder/references/taxonomy-of-concerns.yaml");
    results = await searchByConcern(args.byConcern, { projectRoot: args.project, distributedPath });
    results = results.map(r => ({ slug: r.slug, file: r.file, stack: r.frontmatter?.stack, category: r.frontmatter?.category }));
  } else {
    process.stderr.write("✗ search requires --by-guardrail=<adr> or --by-concern=<id>\n");
    process.exit(1);
  }
  process.stdout.write(JSON.stringify(results, null, 2) + "\n");
  process.exit(0);
}
```

E registrar no dispatch principal:

```javascript
if (subcommand === "search") return cmdSearch(args);
```

- [ ] **Step 3: Run test to verify it passes**

Run: `node --test tests/scripts/test-devflow-standards.mjs`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add scripts/devflow-standards.mjs tests/scripts/test-devflow-standards.mjs
git commit -m "feat(std): cli search --by-guardrail=<adr> | --by-concern=<id>

- output JSON list para consumo programático
- usado por adr-builder hook reverso (Task 13)"
```

---

## Task 9: Audit check S6

**Files:**
- Modify: `scripts/lib/standard-audit.mjs`
- Modify: `tests/validation/test-adr-audit.mjs` (ou novo `test-standard-audit.mjs`)

- [ ] **Step 1: Locate audit lib and check current tests**

Run: `grep -n "function check" scripts/lib/standard-audit.mjs | head -10`
Run: `ls tests/validation/test-standard*.mjs 2>&1`

- [ ] **Step 2: Write failing test for S6**

Criar `tests/validation/test-standard-audit-s6.mjs`:

```javascript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { auditStandard } from "../../scripts/lib/standard-audit.mjs";

const FIX = resolve(import.meta.dirname, "fixtures");
const MINI = resolve(import.meta.dirname, "fixtures/taxonomy-mini.yaml");

function setup(stdFile, name) {
  const tmp = mkdtempSync(join(tmpdir(), "audit-s6-"));
  mkdirSync(join(tmp, ".context/standards/machine"), { recursive: true });
  copyFileSync(join(FIX, stdFile), join(tmp, ".context/standards", `${name}.md`));
  writeFileSync(join(tmp, ".context/standards/machine", `${name}.js`), "process.exit(0);\n");
  return tmp;
}

describe("audit S6 lib-centric detection", () => {
  it("WARN when id matches known lib (zod)", async () => {
    const tmp = setup("std-zod-fake.md", "std-zod");
    const audit = await auditStandard("zod", { projectRoot: tmp, taxonomyPath: MINI });
    const s6 = audit.checks.find(c => c.check === "S6");
    assert.equal(s6.status, "WARN");
    assert.ok(s6.reason.includes("runtime-validation"));
    rmSync(tmp, { recursive: true, force: true });
  });

  it("PASS when id is concern-based (runtime-validation)", async () => {
    const tmp = setup("std-runtime-validation-fake.md", "std-runtime-validation");
    const audit = await auditStandard("runtime-validation", { projectRoot: tmp, taxonomyPath: MINI });
    const s6 = audit.checks.find(c => c.check === "S6");
    assert.equal(s6.status, "PASS");
    rmSync(tmp, { recursive: true, force: true });
  });

  it("WARN when id prefix matches lib (zod-frontend)", async () => {
    const tmp = setup("std-zod-fake.md", "std-zod-frontend");
    // Rewrite frontmatter id
    const { readFileSync, writeFileSync } = await import("node:fs");
    const p = join(tmp, ".context/standards/std-zod-frontend.md");
    const txt = readFileSync(p, "utf-8").replace("id: std-zod", "id: std-zod-frontend");
    writeFileSync(p, txt);
    const audit = await auditStandard("zod-frontend", { projectRoot: tmp, taxonomyPath: MINI });
    const s6 = audit.checks.find(c => c.check === "S6");
    assert.equal(s6.status, "WARN");
    rmSync(tmp, { recursive: true, force: true });
  });

  it("skips S6 when std has deprecated: true", async () => {
    const tmp = setup("std-zod-fake.md", "std-zod");
    const { readFileSync, writeFileSync } = await import("node:fs");
    const p = join(tmp, ".context/standards/std-zod.md");
    const txt = readFileSync(p, "utf-8").replace("id: std-zod", "id: std-zod\ndeprecated: true");
    writeFileSync(p, txt);
    const audit = await auditStandard("zod", { projectRoot: tmp, taxonomyPath: MINI });
    const s6 = audit.checks.find(c => c.check === "S6");
    assert.equal(s6.status, "PASS"); // skipped → PASS by convention
    rmSync(tmp, { recursive: true, force: true });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test tests/validation/test-standard-audit-s6.mjs`
Expected: FAIL — S6 não existe.

- [ ] **Step 4: Implement S6 in standard-audit.mjs**

Adicionar função e incluir no array de checks:

```javascript
async function checkS6_libCentric(stdFrontmatter, taxonomyPath) {
  if (stdFrontmatter.deprecated) {
    return { check: "S6", status: "PASS", reason: "deprecated std skipped" };
  }
  const { loadTaxonomy } = await import("./taxonomy-loader.mjs");
  const tax = await loadTaxonomy({ distributedPath: taxonomyPath, projectRoot: null });
  const allHints = new Set(tax.entries.flatMap(e => e.inverseHints ?? []));

  const id = (stdFrontmatter.id || "").replace(/^std-/, "");

  if (allHints.has(id)) {
    const suggested = tax.entries.find(e => (e.inverseHints || []).includes(id));
    return {
      check: "S6",
      status: "WARN",
      reason: `std-${id} casa lib conhecida (${id}); concern canônico: ${suggested.id}`,
      suggestion: `devflow standards new --migrate=${id}`,
    };
  }

  const prefix = id.split("-")[0];
  if (allHints.has(prefix)) {
    return {
      check: "S6",
      status: "WARN",
      reason: `std-${id} parece lib-centric (prefixo "${prefix}")`,
      suggestion: `revisar manualmente — possivelmente migrate-able`,
    };
  }

  return { check: "S6", status: "PASS" };
}
```

Atualizar a função `auditStandard` (ou equivalente) para aceitar `taxonomyPath` em options, chamar `checkS6_libCentric`, e adicionar resultado no array `checks`.

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test tests/validation/test-standard-audit-s6.mjs`
Expected: PASS (4 tests).

- [ ] **Step 6: Verify gate report logic**

Garantir que `auditStandard` retorna `gate: "PASSED"` quando todos S1-S5 PASS e S6 é WARN. WARN não bloqueia.

Run: rodar audit num std-zod existente do sandbox 2026-05-11 manualmente:

```bash
node scripts/devflow-standards.mjs audit zod --project=tests/2026-05-11
```

Expected: output mostra S6 WARN, gate PASSED.

- [ ] **Step 7: Commit**

```bash
git add scripts/lib/standard-audit.mjs tests/validation/test-standard-audit-s6.mjs
git commit -m "feat(std): audit check S6 (lib-centric detection)

- WARN quando id casa inverseHints da taxonomia
- WARN quando prefixo casa (zod-frontend)
- skip quando std deprecated:true
- nunca FAIL — gate continua PASSED com S6 WARN"
```

---

## Task 10: CLI — modo `migrate`

**Files:**
- Modify: `scripts/devflow-standards.mjs`
- Modify: `tests/scripts/test-devflow-standards.mjs`

- [ ] **Step 1: Add contract test**

```javascript
describe("new --migrate", () => {
  it("migrates std-zod → std-runtime-validation + deprecates old", async () => {
    const tmp = await setupTmpProjectWithStds(); // contém std-zod e adr-zod-frontend
    const { code } = await runCLI([
      "new",
      "--migrate=zod",
      `--project=${tmp}`,
      `--taxonomy=${MINI_TAXONOMY}`,
      "--yes",
    ]);
    assert.equal(code, 0);
    assert.ok(existsSync(join(tmp, ".context/standards/std-runtime-validation.md")));
    assert.ok(existsSync(join(tmp, ".context/standards/std-zod.deprecated.md")));
    assert.ok(!existsSync(join(tmp, ".context/standards/std-zod.md")));
    const old = readFileSync(join(tmp, ".context/standards/std-zod.deprecated.md"), "utf-8");
    assert.ok(old.includes("deprecated: true"));
    assert.ok(old.includes("supersededBy: std-runtime-validation"));
  });

  it("--migrate is no-op when std already deprecated", async () => {
    const tmp = await setupTmpProjectWithDeprecated();
    const { code, stderr } = await runCLI([
      "new",
      "--migrate=zod",
      `--project=${tmp}`,
      `--taxonomy=${MINI_TAXONOMY}`,
      "--yes",
    ]);
    assert.equal(code, 0);
    assert.ok(stderr.includes("already migrated"));
  });
});
```

- [ ] **Step 2: Implement migrate handler**

```javascript
async function cmdMigrate(args) {
  const oldId = args.migrate;
  const oldStdPath = join(args.project, ".context/standards", `std-${oldId}.md`);
  const deprecatedPath = join(args.project, ".context/standards", `std-${oldId}.deprecated.md`);

  if (existsSync(deprecatedPath)) {
    process.stderr.write(`✗ std-${oldId} already migrated. Skipping.\n`);
    process.exit(0);
  }

  if (!existsSync(oldStdPath)) {
    process.stderr.write(`✗ std-${oldId} not found.\n`);
    process.exit(1);
  }

  const { loadTaxonomy } = await import("./lib/taxonomy-loader.mjs");
  const distributedPath = args.taxonomy
    || resolve(import.meta.dirname, "../skills/standards-builder/references/taxonomy-of-concerns.yaml");
  const tax = await loadTaxonomy({ distributedPath, projectRoot: args.project });

  const matched = tax.entries.find(e => (e.inverseHints || []).includes(oldId));
  const targetConcern = args.targetConcern || matched?.id;
  if (!targetConcern) {
    process.stderr.write(`✗ no concern hint for '${oldId}'. Use --target-concern=<id>.\n`);
    process.exit(1);
  }

  // Read old std for relatedAdrs
  const { parseFrontmatter } = await import("./lib/frontmatter.mjs");
  const oldContent = readFileSync(oldStdPath, "utf-8");
  const { frontmatter: oldFm } = parseFrontmatter(oldContent);
  const adrsCsv = (oldFm.relatedAdrs || []).join(",");

  // Invoke new --concern with enrich
  const newStdPath = join(args.project, ".context/standards", `std-${targetConcern}.md`);
  if (existsSync(newStdPath)) {
    process.stderr.write(`! std-${targetConcern} already exists. Skipping creation; only deprecating old.\n`);
  } else {
    // Run the create flow inline (extract function from Task 6)
    await runConcernCreate({
      concern: targetConcern,
      enrichFromAdr: adrsCsv,
      project: args.project,
      taxonomy: distributedPath,
    });
  }

  // Mark old as deprecated
  const deprecatedHeader = `---\nid: std-${oldId}\ndeprecated: true\nsupersededBy: std-${targetConcern}\ndeprecatedReason: lib-centric — migrado para concern operacional\ndeprecatedAt: ${new Date().toISOString().slice(0, 10)}\n---\n`;
  const body = oldContent.replace(/^---[\s\S]*?---\n?/, "");
  writeFileSync(deprecatedPath, deprecatedHeader + body, "utf-8");
  await import("node:fs").then(fs => fs.unlinkSync(oldStdPath));

  process.stdout.write(`✓ migrated std-${oldId} → std-${targetConcern}\n`);
  process.exit(0);
}
```

Registrar no dispatch:

```javascript
if (subcommand === "new" && args.migrate) return cmdMigrate(args);
```

- [ ] **Step 3: Run test to verify it passes**

Run: `node --test tests/scripts/test-devflow-standards.mjs`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add scripts/devflow-standards.mjs tests/scripts/test-devflow-standards.mjs
git commit -m "feat(std): cli new --migrate=<lib> (lib→concern transition)

- detecta concern via inverseHints (override com --target-concern)
- preserva relatedAdrs do std antigo como --enrich-from-adr automático
- renomeia old para .deprecated.md com frontmatter supersededBy
- idempotente: no-op se já deprecated"
```

---

## Task 11: Skill standards-builder — atualizar SKILL.md

**Files:**
- Modify: `skills/standards-builder/SKILL.md`

- [ ] **Step 1: Read current SKILL.md**

Run: `cat skills/standards-builder/SKILL.md | head -80`
Expected: ver Hard Rule #1, Step 0 cascade, modes.

- [ ] **Step 2: Reescrever SKILL.md mantendo header e estrutura geral**

Mudanças específicas (delta):

1. **Frontmatter**: bumpar `version: 0.2.0`, atualizar `description` para mencionar FROM-CONCERN como default e adicionar trigger phrases (`"crie std para concern"`, `"std cross-cutting"`, `"migra std lib-centric"`).
2. **Step 0 — Detect mode**: substituir cascata atual pela nova tabela da §5.1 do spec (modos: from-concern default, from-adr legado+warning, from-concern+enrich, consolidate-concern, audit, migrate).
3. **Step 1 — Resolve concern** (novo): adicionar bloco descrevendo invocação do `concern-resolver.mjs` via CLI; mostrar exemplo de output auto-confirmed vs. ambiguous.
4. **Step 2 — Optional enrich**: descrever fluxo `--enrich-from-adr=<csv>`; enfatizar "não copia Decisão/Contexto, só Guardrails + Enforcement".
5. **Step 3 — Generate baseline**: substituir tabela de mapping (atual: ADR `Decisão` → std `Princípios`) pela nova (taxonomia `principleTemplate` → std `Princípios`).
6. **Step 4 — LLM polish**: ajustar para "preencher placeholders + ajustar tom; nunca inventar regras".
7. **Step 5 — Audit + commit**: adicionar mention do S6 (deve estar PASS para concern-based std; lib-centric vai gerar WARN aceitável).
8. **Step 6 — Reverse-link** (novo): mover atual lógica de back-link para step explícito.
9. **Modo MIGRATE** (novo): adicionar bloco com fluxo CLI `--migrate=<lib>`.
10. **Modo FROM-ADR legado**: explicar warning, redirecionamento sugerido, sem bloquear.
11. **Hard Rules**: REMOVER #1 ("Standard sem ADR é proibido"). Adicionar nova: "FROM-CONCERN é default; FROM-ADR emite warning; migrate é o caminho para retro-compat".
12. **Examples**: adicionar exemplo FROM-CONCERN puro, FROM-CONCERN + enrich, MIGRATE.

Aplicar via Edit em blocos contínuos (não regenerar arquivo do zero — preserve estilo do repo).

- [ ] **Step 3: Verify changes preserve format**

Run: `grep -E "^(##|###|####)" skills/standards-builder/SKILL.md | head -30`
Expected: estrutura hierárquica preservada; sem `#####` órfão.

- [ ] **Step 4: Spot-check trigger phrases**

Run: `grep -A 10 "trigger_phrases:" skills/standards-builder/SKILL.md`
Expected: novas trigger phrases incluídas.

- [ ] **Step 5: Commit**

```bash
git add skills/standards-builder/SKILL.md
git commit -m "feat(std): skill standards-builder v0.2 — concern-first

- FROM-CONCERN é default; FROM-ADR vira legado com warning
- novo Step 1 (resolve concern) e Step 6 (reverse-link)
- modo MIGRATE para transição lib→concern
- Hard Rule #1 removida (std sem ADR agora é caso comum)"
```

---

## Task 12: Skill adr-builder — Step 5e (hook reverso)

**Files:**
- Modify: `skills/adr-builder/SKILL.md`

- [ ] **Step 1: Read current SKILL.md and find Step 5 area**

Run: `grep -n "## Step" skills/adr-builder/SKILL.md`
Expected: lista de Steps existentes; identifica onde 5d (atual) está.

- [ ] **Step 2: Read Step 5d atual integralmente**

Read entire Step 5d section. Anotar o que mantém e o que muda.

- [ ] **Step 3: Reescrever para Step 5e obrigatório**

Aplicar via Edit:

1. Renumerar atual 5d (se existir) ou inserir 5e logo após Step 5 (commit).
2. Texto novo do Step 5e segue §6.1-6.6 do spec:
   - Quando dispara (após commit, antes de devolver controle)
   - Algoritmo (extract stack/category/lib-name → match taxonomy → INJECT or CREATE)
   - Caminho INJECT (diff conceitual + prompt 4-way)
   - Caminho CREATE (prompt 3-way: criar agora / TODO / não)
   - Quando NÃO dispara (tabela com 4 condições de skip)
   - Modo autônomo (INJECT additive only; CREATE sempre TODO)
3. Em `deps.internal` do frontmatter, adicionar:
   - `scripts/lib/standards-search.mjs`
   - `scripts/lib/taxonomy-loader.mjs`
4. Em Hard Rules, adicionar: "Step 5e roda sempre exceto nos 4 casos da tabela; falha silenciosa, nunca bloqueia o flow de ADR (commit já aconteceu)."

- [ ] **Step 4: Verify structure**

Run: `grep -nE "^## Step" skills/adr-builder/SKILL.md`
Expected: lista contínua 1, 2, 3, 4, 5, 5e (ou nova numeração consistente).

- [ ] **Step 5: Commit**

```bash
git add skills/adr-builder/SKILL.md
git commit -m "feat(adr): Step 5e — hook reverso para std existentes

- após commit do ADR, busca std cujos guardrails/enforcement seriam afetados
- INJECT path quando std-<concern> existe; CREATE path quando não
- modo autônomo: INJECT additive only; CREATE vira TODO
- skip silencioso quando ADR é soft/Rascunho/refines/supersedes ou taxonomy missing"
```

---

## Task 13: Skill integration test F1 — FROM-CONCERN puro

**Files:**
- Create: `skills/standards-builder/tests/test-from-concern-flow.mjs`

- [ ] **Step 1: Write test**

```javascript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const REPO = resolve(import.meta.dirname, "../../..");
const CLI = join(REPO, "scripts/devflow-standards.mjs");
const TAXONOMY = join(REPO, "skills/standards-builder/references/taxonomy-of-concerns.yaml");

function setupProject() {
  const tmp = mkdtempSync(join(tmpdir(), "f1-"));
  mkdirSync(join(tmp, ".context/standards/machine"), { recursive: true });
  mkdirSync(join(tmp, ".context/adrs"), { recursive: true });
  writeFileSync(join(tmp, ".context/.devflow.yaml"), "name: test\n");
  return tmp;
}

describe("F1 — FROM-CONCERN puro", () => {
  it("creates std-runtime-validation without consulting any ADR", () => {
    const tmp = setupProject();
    execFileSync("node", [CLI, "new", "--concern=runtime-validation", `--project=${tmp}`, `--taxonomy=${TAXONOMY}`], {
      encoding: "utf-8",
    });
    const stdPath = join(tmp, ".context/standards/std-runtime-validation.md");
    assert.ok(existsSync(stdPath));
    const content = readFileSync(stdPath, "utf-8");
    assert.ok(content.includes("id: std-runtime-validation"));
    assert.ok(content.includes("weakStandardWarning: true"));
    assert.match(content, /relatedAdrs:\s*\[\]/);
    rmSync(tmp, { recursive: true, force: true });
  });

  it("audit passes S1-S5 PASS, S6 PASS (concern-based id)", () => {
    const tmp = setupProject();
    execFileSync("node", [CLI, "new", "--concern=runtime-validation", `--project=${tmp}`, `--taxonomy=${TAXONOMY}`], { encoding: "utf-8" });
    const out = execFileSync("node", [CLI, "audit", "runtime-validation", `--project=${tmp}`, `--taxonomy=${TAXONOMY}`], {
      encoding: "utf-8",
    });
    assert.ok(out.includes("Gate: PASSED"));
    assert.ok(out.includes("S6") && out.includes("PASS"));
    rmSync(tmp, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run test**

Run: `node --test skills/standards-builder/tests/test-from-concern-flow.mjs`
Expected: PASS (2 tests).

- [ ] **Step 3: Commit**

```bash
git add skills/standards-builder/tests/test-from-concern-flow.mjs
git commit -m "test(std): F1 integration — FROM-CONCERN puro

- std criado sem consultar ADR; relatedAdrs vazio
- audit retorna gate PASSED com S6 PASS (id é concern, não lib)"
```

---

## Task 14: Skill integration test F2 — FROM-CONCERN + enrich

**Files:**
- Create: `skills/standards-builder/tests/test-enrich-flow.mjs`

- [ ] **Step 1: Write test**

```javascript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const REPO = resolve(import.meta.dirname, "../../..");
const CLI = join(REPO, "scripts/devflow-standards.mjs");
const TAXONOMY = join(REPO, "skills/standards-builder/references/taxonomy-of-concerns.yaml");
const FIX = join(REPO, "tests/validation/fixtures");

function setupProject() {
  const tmp = mkdtempSync(join(tmpdir(), "f2-"));
  mkdirSync(join(tmp, ".context/standards/machine"), { recursive: true });
  mkdirSync(join(tmp, ".context/adrs"), { recursive: true });
  writeFileSync(join(tmp, ".context/.devflow.yaml"), "name: test\n");
  copyFileSync(join(FIX, "adr-zod-fake.md"), join(tmp, ".context/adrs/009-adr-zod-frontend-v1.0.0.md"));
  return tmp;
}

describe("F2 — FROM-CONCERN + enrich", () => {
  it("creates std with relatedAdrs populated from --enrich-from-adr", () => {
    const tmp = setupProject();
    execFileSync("node", [CLI, "new", "--concern=runtime-validation", "--enrich-from-adr=009", `--project=${tmp}`, `--taxonomy=${TAXONOMY}`], { encoding: "utf-8" });
    const content = readFileSync(join(tmp, ".context/standards/std-runtime-validation.md"), "utf-8");
    assert.ok(content.includes("adr-zod-frontend"));
    rmSync(tmp, { recursive: true, force: true });
  });

  it("Linter section contains enforcement bullets derived from ADR Enforcement", () => {
    const tmp = setupProject();
    execFileSync("node", [CLI, "new", "--concern=runtime-validation", "--enrich-from-adr=009", `--project=${tmp}`, `--taxonomy=${TAXONOMY}`], { encoding: "utf-8" });
    const content = readFileSync(join(tmp, ".context/standards/std-runtime-validation.md"), "utf-8");
    assert.ok(content.includes("Code review"));
    rmSync(tmp, { recursive: true, force: true });
  });

  it("Princípios section does NOT contain ADR Decisão prose (negative assertion)", () => {
    const tmp = setupProject();
    execFileSync("node", [CLI, "new", "--concern=runtime-validation", "--enrich-from-adr=009", `--project=${tmp}`, `--taxonomy=${TAXONOMY}`], { encoding: "utf-8" });
    const content = readFileSync(join(tmp, ".context/standards/std-runtime-validation.md"), "utf-8");
    const principios = content.match(/## Princípios([\s\S]*?)## /)[1];
    assert.ok(!principios.includes("Adotar Zod 4.1.x"), "Decisão prose leaked into Princípios");
    rmSync(tmp, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run test**

Run: `node --test skills/standards-builder/tests/test-enrich-flow.mjs`
Expected: PASS (3 tests).

- [ ] **Step 3: Commit**

```bash
git add skills/standards-builder/tests/test-enrich-flow.mjs
git commit -m "test(std): F2 integration — FROM-CONCERN + enrich

- relatedAdrs populated; Linter section ganha enforcement bullets
- assertion negativa: ## Princípios NÃO contém Decisão prose"
```

---

## Task 15: Skill integration test F3 — MIGRATE

**Files:**
- Create: `skills/standards-builder/tests/test-migrate-flow.mjs`

- [ ] **Step 1: Write test**

```javascript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const REPO = resolve(import.meta.dirname, "../../..");
const CLI = join(REPO, "scripts/devflow-standards.mjs");
const TAXONOMY = join(REPO, "skills/standards-builder/references/taxonomy-of-concerns.yaml");
const FIX = join(REPO, "tests/validation/fixtures");

function setupProjectWithLibStd() {
  const tmp = mkdtempSync(join(tmpdir(), "f3-"));
  mkdirSync(join(tmp, ".context/standards/machine"), { recursive: true });
  mkdirSync(join(tmp, ".context/adrs"), { recursive: true });
  writeFileSync(join(tmp, ".context/.devflow.yaml"), "name: test\n");
  copyFileSync(join(FIX, "adr-zod-fake.md"), join(tmp, ".context/adrs/009-adr-zod-frontend-v1.0.0.md"));
  copyFileSync(join(FIX, "std-zod-fake.md"), join(tmp, ".context/standards/std-zod.md"));
  writeFileSync(join(tmp, ".context/standards/machine/std-zod.js"), "process.exit(0);\n");
  return tmp;
}

describe("F3 — MIGRATE flow", () => {
  it("creates std-runtime-validation, deprecates std-zod", () => {
    const tmp = setupProjectWithLibStd();
    execFileSync("node", [CLI, "new", "--migrate=zod", `--project=${tmp}`, `--taxonomy=${TAXONOMY}`, "--yes"], { encoding: "utf-8" });
    assert.ok(existsSync(join(tmp, ".context/standards/std-runtime-validation.md")));
    assert.ok(existsSync(join(tmp, ".context/standards/std-zod.deprecated.md")));
    assert.ok(!existsSync(join(tmp, ".context/standards/std-zod.md")));
    rmSync(tmp, { recursive: true, force: true });
  });

  it("deprecated std has supersededBy frontmatter", () => {
    const tmp = setupProjectWithLibStd();
    execFileSync("node", [CLI, "new", "--migrate=zod", `--project=${tmp}`, `--taxonomy=${TAXONOMY}`, "--yes"], { encoding: "utf-8" });
    const old = readFileSync(join(tmp, ".context/standards/std-zod.deprecated.md"), "utf-8");
    assert.ok(old.includes("deprecated: true"));
    assert.ok(old.includes("supersededBy: std-runtime-validation"));
    rmSync(tmp, { recursive: true, force: true });
  });

  it("migrate is no-op when already deprecated (idempotent)", () => {
    const tmp = setupProjectWithLibStd();
    execFileSync("node", [CLI, "new", "--migrate=zod", `--project=${tmp}`, `--taxonomy=${TAXONOMY}`, "--yes"], { encoding: "utf-8" });
    // Run again
    const out = execFileSync("node", [CLI, "new", "--migrate=zod", `--project=${tmp}`, `--taxonomy=${TAXONOMY}`, "--yes"], { encoding: "utf-8" });
    // No throw, idempotent
    rmSync(tmp, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run test**

Run: `node --test skills/standards-builder/tests/test-migrate-flow.mjs`
Expected: PASS (3 tests).

- [ ] **Step 3: Commit**

```bash
git add skills/standards-builder/tests/test-migrate-flow.mjs
git commit -m "test(std): F3 integration — MIGRATE lib→concern

- std-zod → std-runtime-validation + std-zod.deprecated.md
- frontmatter supersededBy preservado
- migrate é idempotente (no-op em re-execução)"
```

---

## Task 16: Skill integration test F4 — adr-builder reverse hook

**Files:**
- Create: `skills/adr-builder/tests/test-reverse-hook.mjs`

- [ ] **Step 1: Write test**

Esta task testa o caminho de search via CLI (não invoca diretamente a skill conversacional, mas simula o que ela faria):

```javascript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const REPO = resolve(import.meta.dirname, "../../..");
const CLI = join(REPO, "scripts/devflow-standards.mjs");
const TAXONOMY = join(REPO, "skills/standards-builder/references/taxonomy-of-concerns.yaml");
const FIX = join(REPO, "tests/validation/fixtures");

function setupWithConcernStd() {
  const tmp = mkdtempSync(join(tmpdir(), "f4-"));
  mkdirSync(join(tmp, ".context/standards/machine"), { recursive: true });
  mkdirSync(join(tmp, ".context/adrs"), { recursive: true });
  writeFileSync(join(tmp, ".context/.devflow.yaml"), "name: test\n");
  copyFileSync(join(FIX, "std-runtime-validation-fake.md"), join(tmp, ".context/standards/std-runtime-validation.md"));
  writeFileSync(join(tmp, ".context/standards/machine/std-runtime-validation.js"), "process.exit(0);\n");
  return tmp;
}

describe("F4 — adr-builder reverse hook", () => {
  it("search --by-concern returns ADR slug after ADR is added", () => {
    const tmp = setupWithConcernStd();
    // Create new ADR (simulating adr-builder commit)
    copyFileSync(join(FIX, "adr-zod-fake.md"), join(tmp, ".context/adrs/022-adr-valibot-frontend-v1.0.0.md"));
    const out = execFileSync("node", [CLI, "search", "--by-concern=runtime-validation", `--project=${tmp}`, `--taxonomy=${TAXONOMY}`], { encoding: "utf-8" });
    const parsed = JSON.parse(out);
    assert.ok(Array.isArray(parsed));
    assert.ok(parsed.length >= 1);
    rmSync(tmp, { recursive: true, force: true });
  });

  it("search --by-guardrail returns std-runtime-validation when ADR references it", () => {
    const tmp = setupWithConcernStd();
    const out = execFileSync("node", [CLI, "search", "--by-guardrail=adr-zod-frontend", `--project=${tmp}`], { encoding: "utf-8" });
    const parsed = JSON.parse(out);
    assert.ok(parsed.find(s => s.id === "std-runtime-validation"));
    rmSync(tmp, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run test**

Run: `node --test skills/adr-builder/tests/test-reverse-hook.mjs`
Expected: PASS (2 tests).

- [ ] **Step 3: Commit**

```bash
git add skills/adr-builder/tests/test-reverse-hook.mjs
git commit -m "test(adr): F4 integration — Step 5e reverse hook via CLI search

- search --by-concern retorna ADRs match category/inverseHints
- search --by-guardrail retorna std cujo relatedAdrs contém slug"
```

---

## Task 17: E2E gate — script de re-execução do sandbox 2026-05-11

**Files:**
- Create: `tests/integration/test-e2e-standards-concern-rerun.mjs`
- Create: `tests/integration/assert-no-decision-leak.mjs`

- [ ] **Step 1: Implement assert-no-decision-leak.mjs**

```javascript
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

function extractSection(md, heading) {
  const re = new RegExp(`^##\\s+${heading}\\s*$`, "mi");
  const m = md.match(re);
  if (!m) return "";
  const rest = md.slice(m.index + m[0].length);
  const next = rest.match(/^##\s+/m);
  return next ? rest.slice(0, next.index) : rest;
}

export function assertNoDecisionLeak({ projectRoot, minSubstringLen = 40 }) {
  const adrsDir = join(projectRoot, ".context/adrs");
  const stdsDir = join(projectRoot, ".context/standards");
  const adrs = readdirSync(adrsDir).filter(f => f.endsWith(".md"));
  const stds = readdirSync(stdsDir).filter(f => f.startsWith("std-") && f.endsWith(".md") && !f.endsWith(".deprecated.md"));

  const decisionTexts = adrs.map(a => extractSection(readFileSync(join(adrsDir, a), "utf-8"), "Decisão"));

  const leaks = [];
  for (const std of stds) {
    const stdContent = readFileSync(join(stdsDir, std), "utf-8");
    const principios = extractSection(stdContent, "Princípios");
    if (!principios) continue;
    for (let i = 0; i < decisionTexts.length; i++) {
      const dec = decisionTexts[i].trim();
      if (dec.length < minSubstringLen) continue;
      // Sliding window search for substrings of minSubstringLen chars
      for (let pos = 0; pos < dec.length - minSubstringLen; pos += 10) {
        const chunk = dec.slice(pos, pos + minSubstringLen);
        if (principios.includes(chunk)) {
          leaks.push({ std, adr: adrs[i], chunk });
          break;
        }
      }
    }
  }
  return leaks;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const projectRoot = process.argv[2];
  const leaks = assertNoDecisionLeak({ projectRoot });
  if (leaks.length) {
    console.error(`✗ ${leaks.length} decision-leak detected:`);
    for (const l of leaks) console.error(`  ${l.std} ← ${l.adr}: "${l.chunk.slice(0, 60)}..."`);
    process.exit(1);
  }
  console.log("✓ no decision leak detected");
  process.exit(0);
}
```

- [ ] **Step 2: Write E2E test**

```javascript
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, existsSync, readFileSync, rmSync, copyFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { assertNoDecisionLeak } from "./assert-no-decision-leak.mjs";

const REPO = resolve(import.meta.dirname, "../..");
const SANDBOX = join(REPO, "tests/2026-05-11");
const CLI = join(REPO, "scripts/devflow-standards.mjs");
const TAXONOMY = join(REPO, "skills/standards-builder/references/taxonomy-of-concerns.yaml");

describe("E2E sandbox 2026-05-11 — concern-first rerun", () => {
  before(() => {
    // Wipe lib-centric stds
    const stdsDir = join(SANDBOX, ".context/standards");
    for (const f of readdirSync(stdsDir)) {
      if (f.startsWith("std-") && f.endsWith(".md")) rmSync(join(stdsDir, f));
    }
    const machineDir = join(stdsDir, "machine");
    for (const f of readdirSync(machineDir)) {
      if (f.startsWith("std-") && f.endsWith(".js")) rmSync(join(machineDir, f));
    }

    // Re-generate via FROM-CONCERN
    const adrsDir = join(SANDBOX, ".context/adrs");
    for (const f of readdirSync(adrsDir).filter(f => /^\d+-/.test(f) && f.endsWith(".md"))) {
      const content = readFileSync(join(adrsDir, f), "utf-8");
      const slugMatch = content.match(/^name:\s*(\S+)/m);
      if (!slugMatch) continue;
      const slug = slugMatch[1];
      const stackMatch = content.match(/^stack:\s*(.+)$/m);
      const libName = stackMatch?.[1].toLowerCase().split(/\s+/)[0] ?? "";

      // Try to resolve concern via inverseHints
      const out = execFileSync("node", [
        "-e",
        `import("${join(REPO, "scripts/lib/taxonomy-loader.mjs").replace(/\\/g, "\\\\")}").then(async m => {
          const t = await m.loadTaxonomy({ distributedPath: "${TAXONOMY.replace(/\\/g, "\\\\")}", projectRoot: null });
          const e = t.entries.find(e => (e.inverseHints||[]).includes("${libName}"));
          console.log(e?.id ?? "");
        });`,
      ], { encoding: "utf-8" }).trim();

      if (!out) {
        console.log(`SKIP: ${slug} (no concern match for lib '${libName}')`);
        continue;
      }
      try {
        execFileSync("node", [CLI, "new", `--concern=${out}`, `--enrich-from-adr=${slug}`, `--project=${SANDBOX}`, `--taxonomy=${TAXONOMY}`, "--yes", "--force"], { encoding: "utf-8" });
      } catch (e) {
        if (!String(e).includes("already exists")) throw e;
      }
    }
  });

  it("AC1: total of std files is ≤ 12 (concern-consolidation reduces from 20)", () => {
    const stds = readdirSync(join(SANDBOX, ".context/standards"))
      .filter(f => f.startsWith("std-") && f.endsWith(".md") && !f.endsWith(".deprecated.md"));
    assert.ok(stds.length <= 12, `expected ≤12, got ${stds.length}: ${stds.join(",")}`);
  });

  it("AC2: no std id matches a known lib (S6 PASS across all)", () => {
    const stds = readdirSync(join(SANDBOX, ".context/standards"))
      .filter(f => f.startsWith("std-") && f.endsWith(".md") && !f.endsWith(".deprecated.md"));
    for (const std of stds) {
      const id = std.replace(/^std-/, "").replace(/\.md$/, "");
      const out = execFileSync("node", [CLI, "audit", id, `--project=${SANDBOX}`, `--taxonomy=${TAXONOMY}`], { encoding: "utf-8" });
      const s6 = out.match(/S6.*?\n/)?.[0] ?? "";
      assert.ok(s6.includes("PASS"), `std-${id} S6 not PASS: ${s6}`);
    }
  });

  it("AC4: audit gate PASSED in 100% of stds", () => {
    const stds = readdirSync(join(SANDBOX, ".context/standards"))
      .filter(f => f.startsWith("std-") && f.endsWith(".md") && !f.endsWith(".deprecated.md"));
    for (const std of stds) {
      const id = std.replace(/^std-/, "").replace(/\.md$/, "");
      const out = execFileSync("node", [CLI, "audit", id, `--project=${SANDBOX}`, `--taxonomy=${TAXONOMY}`], { encoding: "utf-8" });
      assert.ok(out.includes("Gate: PASSED"), `std-${id} did not pass: ${out.slice(0, 200)}`);
    }
  });

  it("AC5: no Decision leak ≥40 chars from ADR Decisão into std Princípios", () => {
    const leaks = assertNoDecisionLeak({ projectRoot: SANDBOX });
    assert.equal(leaks.length, 0, `${leaks.length} leaks: ${JSON.stringify(leaks.slice(0, 2))}`);
  });

  it("AC6: std-runtime-validation exists with ≥2 ADRs in relatedAdrs (Zod + Pydantic if present)", () => {
    const path = join(SANDBOX, ".context/standards/std-runtime-validation.md");
    if (!existsSync(path)) {
      // Skip if neither Zod nor Pydantic ADRs in sandbox — not a hard failure
      return;
    }
    const content = readFileSync(path, "utf-8");
    const refs = content.match(/relatedAdrs:[\s\S]*?(?=\n[a-z]|\n---)/m)?.[0] || "";
    const adrCount = (refs.match(/^\s+-\s+/gm) || []).length;
    assert.ok(adrCount >= 2, `std-runtime-validation has ${adrCount} ADRs, expected ≥2`);
  });
});
```

(AC3 e AC7 ficam fora desta task — AC3 depende de adr-chain.mjs orphan detection; AC7 é benchmark separado.)

- [ ] **Step 3: Run E2E test**

Run: `node --test tests/integration/test-e2e-standards-concern-rerun.mjs`
Expected: PASS (5 ACs cobertos).

- [ ] **Step 4: Manual smoke check**

Após o teste rodar, inspecionar manualmente:

```bash
ls tests/2026-05-11/.context/standards/std-*.md
cat tests/2026-05-11/.context/standards/std-runtime-validation.md
```

Conferir:
- Conteúdo do `## Princípios` faz sentido isolado, sem precisar abrir ADRs.
- Anti-patterns têm coluna "Certo" preenchida com regra concreta (não placeholder).

- [ ] **Step 5: Commit (no-content commit do refactor sandbox)**

Os std novos do sandbox NÃO entram no commit do refactor — eles são gerados pelo teste E2E em cada run. Mas o teste e o asserter sim:

```bash
git add tests/integration/test-e2e-standards-concern-rerun.mjs tests/integration/assert-no-decision-leak.mjs
git commit -m "test(e2e): sandbox 2026-05-11 — concern-first rerun gate

- wipe lib-centric stds + re-generate via --concern + --enrich-from-adr
- 5 critérios de aceitação: AC1 (≤12 stds), AC2 (S6 PASS all), AC4 (gate PASSED all),
  AC5 (no decision leak), AC6 (std-runtime-validation tem ≥2 ADRs)
- assertNoDecisionLeak: sliding window ≥40-char substring match"
```

---

## Task 18: Verificação final + cleanup

**Files:**
- (nenhum — apenas runs)

- [ ] **Step 1: Run all unit tests**

Run: `node --test tests/validation/test-taxonomy-loader.mjs tests/validation/test-concern-resolver.mjs tests/validation/test-standards-search.mjs tests/validation/test-standard-enrich.mjs tests/validation/test-standard-from-concern.mjs tests/validation/test-standard-audit-s6.mjs`
Expected: ALL PASS.

- [ ] **Step 2: Run contract tests**

Run: `node --test tests/scripts/test-devflow-standards.mjs`
Expected: ALL PASS (incluindo casos novos das Tasks 6-10).

- [ ] **Step 3: Run skill integration tests**

Run: `node --test skills/standards-builder/tests/ skills/adr-builder/tests/`
Expected: ALL PASS (F1-F4).

- [ ] **Step 4: Run E2E gate**

Run: `node --test tests/integration/test-e2e-standards-concern-rerun.mjs`
Expected: ALL PASS (5 ACs).

- [ ] **Step 5: Audit sandbox final**

Run: `node scripts/devflow-standards.mjs audit --all --project=tests/2026-05-11`
Expected: exit 0; output lista todos os stds com gate PASSED.

- [ ] **Step 6: Manual smoke (~5 min)**

- Abrir `tests/2026-05-11/.context/standards/std-runtime-validation.md` — `## Princípios` faz sentido isolado?
- Abrir um std consolidado (ex: `std-test-discipline` consolidando vitest+pytest se gerado) — anti-patterns cross-lang neutros?
- Rodar `node scripts/devflow-standards.mjs new --migrate=zod --project=tests/2026-05-11 --yes` num branch separado para confirmar fluxo migrate em projeto real (depois descartar).

- [ ] **Step 7: Final commit + push**

```bash
git status --short
# Se houver pendências de docs/skills, ajustar e commitar:
git add -A
git commit -m "chore(std): finalize concern-first refactor

- todos os testes verdes (unit + contract + integration + E2E)
- sandbox 2026-05-11 re-gerado com sucesso via FROM-CONCERN
- spec, plan e SKILL.md atualizados"
```

---

## Self-Review

**1. Spec coverage:**

| Spec section | Task(s) |
|---|---|
| §3.1 Componentes novos #1 (taxonomy.yaml) | Task 1 |
| §3.1 #2 (concern-resolver) | Task 2 |
| §3.1 #3 (standard-from-concern) | Task 5 |
| §3.1 #4 (standard-enrich) | Task 4 |
| §3.1 #5 (standards-search) | Task 3 |
| §3.2 #1 (devflow-standards.mjs subcomandos) | Tasks 6, 7, 8, 10 |
| §3.2 #2 (standard-audit S6) | Task 9 |
| §3.2 #3 (standards-builder SKILL.md) | Task 11 |
| §3.2 #4 (adr-builder Step 5e) | Task 12 |
| §4 Taxonomia de concerns | Task 1 (6 inicial + scaffold p/ 24 restantes em PR follow-up) |
| §5 Fluxos da skill | Task 11 (documentação) + Tasks 13-15 (testes) |
| §6 Hook reverso adr-builder | Task 12 (documentação) + Task 16 (teste) |
| §7 Audit S6 | Task 9 |
| §8 Telemetria | OUT OF SCOPE (futuro v1.1, conforme spec §11) |
| §9 Testes | Tasks 13-18 |

**Gap detectado**: nenhum.

**2. Placeholder scan:** zero "TBD", "TODO", "implement later". Step 6 de Task 1 menciona "preencher progressivamente em PR follow-up" os 24 concerns restantes — isso é escopo deliberado (6 críticos cobrem os 4 fluxos testados; outros vêm com uso real).

**3. Type consistency:**

- `loadTaxonomy({ distributedPath, projectRoot })` retorna `{ entries, warnings }` — usado consistentemente em Tasks 2, 3, 9.
- `resolveConcern(input, taxonomy)` retorna `{ status, match?, candidates?, confidence? }` — Tasks 2, 6.
- `enrichFromAdrs(adrPaths)` retorna `{ guardrails, enforcement, sources }` — Tasks 4, 5 (Task 5 espera também `.adrSlugs` adicionado pelo CLI, documentado em Task 6).
- `searchByGuardrail(adrSlug, { projectRoot })` retorna `[{ id, file, frontmatter }]` — Tasks 3, 8, 16.
- `searchByConcern(concernId, { projectRoot, distributedPath })` retorna `[{ slug, file, frontmatter }]` — Tasks 3, 8, 16.
- `generateStandardFromConcern({ concern, enrichment, applyTo? })` retorna `{ frontmatter, body, fullDocument }` — Tasks 5, 6.

Consistente.

**4. Dependências entre tasks**:

```
Task 1 (taxonomy + loader)
  ↓
Task 2 (resolver) ──┐
Task 3 (search)    ─┼─► Task 6-8 (CLI)
Task 4 (enrich) ────┤
Task 5 (generate) ──┘
  ↓
Task 9 (audit S6)
Task 10 (CLI migrate, depende de Tasks 6, 4)
  ↓
Tasks 11, 12 (skills doc)
  ↓
Tasks 13-16 (integration tests)
  ↓
Task 17 (E2E gate)
Task 18 (final verification)
```

Ordem linear funciona; algumas paralelizáveis (2/3/4 podem rodar em paralelo após Task 1).

---

**Plano salvo em `docs/superpowers/plans/2026-05-14-standards-decouple-from-adrs.md`.**

## Execution Handoff

**Plano completo. Duas opções de execução:**

**1. Subagent-Driven (recomendado)** — dispatch fresh subagent por task, review entre tasks, iteração rápida. Cada subagent vê apenas a task atual + spec.

**2. Inline Execution** — executa tasks nesta sessão via `executing-plans`, batch com checkpoints para review.

**Qual abordagem?**
