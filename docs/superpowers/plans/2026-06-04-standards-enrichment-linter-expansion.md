# Standards Enrichment + Linter Expansion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **DevFlow workflow:** standards-enrichment-linter-expansion | **Scale:** LARGE | **Phase:** P→R
> **Spec:** `docs/superpowers/specs/2026-06-04-standards-enrichment-linter-expansion-design.md`
> **Branch:** `feat/standards-enrich-linter-expansion`

**Goal:** Enriquecer os 20 standards default do plugin com substância lintável das fontes `framework_ddc/.contexts/engineering/`, gerar ~8 linters novos + 4 extensões + `std-typescript-strict`, enforçar Conventional Commits por hook commit-msg, evoluir ADR-007 → v2.1.0, e sincronizar para o repo standalone.

**Architecture:** Cada linter é um `.js` self-contained em `assets/standards/machine/std-<id>.js` (contrato SI-4: `filePath` em `argv[2]`; violação → `console.log("VIOLATION: ...")` + `exit 1`; conforme → `exit 0`). A barra de FP é provada por um par `{bad, good}` no harness `tests/validation/test-default-linters.mjs`. Enriquecimento dos `.md` precede a geração do linter (a tabela Anti-patterns é a spec da regra). Sync para `devflow-standards` é o último passo antes de qualquer `/devflow update`.

**Tech Stack:** Node.js (`node:test`, `node:fs`, `spawnSync`), regex conservadora ReDoS-safe, frontmatter parser (`scripts/lib/frontmatter.mjs`), hooks bash (`hooks/`).

**Agents:** test-writer (linters TDD), backend-specialist (hook commit-msg), documentation-writer (enriquecimento .md + ADR), security-auditor (sign-off FP/ReDoS de cada regex), refactoring-specialist (extensões).

---

## File Structure

| Caminho | Responsabilidade | Ação |
|---|---|---|
| `assets/standards/std-*.md` (20) | Std enriquecidos (Princípios + Anti-patterns) | Modify |
| `assets/standards/std-typescript-strict.md` | Novo std stack-scoped TS | Create |
| `assets/standards/machine/std-data-modeling.js` … (8 novos) | Linters novos | Create |
| `assets/standards/machine/std-typescript-strict.js` | Linter do std novo | Create |
| `assets/standards/machine/std-{security,error-handling,secret-conventions,test-discipline}.js` | Extensões | Modify |
| `assets/standards/MANIFEST.txt` | + std-typescript-strict.md | Modify |
| `tests/validation/test-default-linters.mjs` | Harness FP bar (array CURATED) | Modify |
| `tests/integration/test-e2e-enriched-linters-hook.mjs` | E2E via hook real sem eject | Create |
| `hooks/commit-msg-guard.mjs` + wiring | Conventional Commits enforcement | Create |
| `tests/validation/test-commit-msg-guard.mjs` | Testes do validador de commit | Create |
| `.context/engineering/adrs/007-default-standards-library-v2.1.0.md` | ADR evoluída | Create |
| `docs/standards-revalidation-22to20.md` | Registro da revalidação (AC9) | Create |
| `CHANGELOG.md` / `.claude-plugin/plugin.json` | Version bump | Modify |
| `tests/validation/test-applyto-sql-routing.mjs` | Prova que `.sql` roteia p/ linters SQL (R1) | Create |
| Sync `.md` → devflow-standards | Passo manual documentado (não script commitado) | Run |

---

## Shared Linter Recipe (referência para todas as tasks de linter)

Todo linter novo segue este molde exato (modelado em `assets/standards/machine/std-security.js`). Cada task preenche **REGEX**, **MENSAGEM**, **GATE** (opcional), **BAD**, **GOOD**:

```javascript
#!/usr/bin/env node
// assets/standards/machine/std-<ID>.js — linter default bundlado (TCB do plugin).
// <descrição curta da regra conservadora>. Contrato SI-4: filePath em argv[2].
import { readFileSync } from "node:fs";
const fp = process.argv[2];
if (!fp) process.exit(0);
// GATE opcional de path (ex.: só .sql / migrations / excluir testes):
// if (!/<gate>/.test(fp)) process.exit(0);
let c = "";
try { c = readFileSync(fp, "utf-8"); } catch { process.exit(0); }
const re = <REGEX>;
const hits = c.match(re) || [];
if (hits.length > 0) {
  console.log(`VIOLATION: ${hits.length} <MENSAGEM> em ${fp}. Ver std-<ID> › Anti-patterns.`);
  process.exit(1);
}
process.exit(0);
```

**Religar no `.md`:** trocar `enforcement.linter: null` por `enforcement.linter: machine/std-<ID>.js` e remover `weakStandardWarning: true`; `version` bump minor.

**Adicionar ao harness** `tests/validation/test-default-linters.mjs`: append `{ id: "std-<ID>", bad: <BAD>, good: <GOOD> }` ao array `CURATED` (os 3 testes por entrada já existem: linter existe+religado, violador dispara, conforme não dispara).

**Regra ReDoS-safe:** sem quantificador aninhado (`(a+)+`), sem `[\s\S]*` ganancioso sobre input grande. **Em vez de um stress test por task**, a Task 7.0 adiciona **um teste parametrizado único** que roda CADA linter de `assets/standards/machine/*.js` contra 3 inputs patológicos de 200k chars e asserta lint < 2s — cobre todos os linters novos+existentes de uma vez (fix Review code-reviewer WARN). Os stress tests pontuais já existentes (data-modeling, error-handling) permanecem.

---

## Phase 0 — Revalidação registrada (AC9)
**Agent:** documentation-writer

### Task 0: Documento de revalidação 22→20

**Files:**
- Create: `docs/standards-revalidation-22to20.md`

- [ ] **Step 1: Escrever o registro** com o mapeamento (pt-BR):

```markdown
# Revalidação — Migração framework_ddc/.claude/rules (22) → plugin std (20)

## 17 migrados diretamente
accessibility, api-design→api-conventions, caching, commits→commit-hygiene,
data-modeling, documentation, error-handling, grounding, internationalization,
migration, observability, performance, schemas, security, state-management,
testing→test-discipline, validation→runtime-validation.

## 5 NÃO migrados como standard (decisão)
| rule | destino correto | justificativa |
|---|---|---|
| environments | camada operations | política de deploy, não std de código |
| git | git-strategy / .devflow.yaml | branch policy tem mecanismo próprio |
| governance | ADR / standards-builder | meta-governança, não std de código |
| ai-friendly-code | fold em naming/documentation + std-typescript-strict | craft heuristics; bits lintáveis surfaçados |
| development | std-typescript-strict (novo) | gap real: strictness TS lintável, stack-scoped |

## +3 std de fontes fora de .claude/rules
code-review (←.contexts/rules/code-review.md), secret-conventions
(←contracts/secrets.md), naming-conventions (sintetizado de development+data-modeling+schemas).
```

- [ ] **Step 2: Commit**

```bash
git add docs/standards-revalidation-22to20.md
git commit -m "docs(standards): revalidação 22→20 das rules do framework_ddc (Phase 0)"
```

---

## Phase 1 — Enriquecimento dos 20 std .md + std-typescript-strict.md
**Agent:** documentation-writer + security-auditor (sign-off de cada regra lintável)

> Cada std: comparar com a(s) fonte(s) `.contexts/engineering/`, restaurar regras concretas em **## Princípios** e linhas determinísticas em **## Anti-patterns**, teto ≤ ~70 linhas, pt-BR, frontmatter válido, `version` bump. **Nada inventado** — cada linha rastreável à fonte. As linhas lintáveis da tabela Anti-patterns viram a spec dos linters da Phase 2-4.
>
> **Nota de granularidade (Review code-reviewer #8):** Tasks 1.1 e 1.2 são **batch-doc** (8 e 12 arquivos `.md`) — isentas da regra superpowers de 2-5 min por step. Na execução subagent-driven, despachar **um subagent por std** (ou por cluster) para manter cada unidade de trabalho holdável em contexto. As tasks de linter (2.x–6.x) seguem a granularidade fina normal.

### Task 1.1: Enriquecer os 8 std do tier lintável (ALTA+MÉDIA)

**Files (Modify):** `assets/standards/std-{data-modeling,schemas,observability,migration,performance,naming-conventions,runtime-validation,api-conventions}.md`

- [ ] **Step 1:** Para cada um, adicionar à tabela `## Anti-patterns` as linhas determinísticas da fonte (exemplos concretos por std):
  - data-modeling: `TIMESTAMP sem timezone → TIMESTAMPTZ`; `VARCHAR(255) por hábito → TEXT`; `FLOAT/REAL para qualquer coluna → NUMERIC`; `BIGSERIAL PK exposto → UUID/ULID`.
  - schemas: `z.any() em payload → z.unknown() + refine`; `.passthrough() em wire público → shape explícito`; `const userSchema → UserSchema (PascalCase)`.
  - observability: `console.log em runtime → logger estruturado`.
  - migration: `CREATE INDEX sem CONCURRENTLY`; `UPDATE sem WHERE`; `VACUUM FULL/TRUNCATE em migração`.
  - performance: `SELECT * → colunas explícitas`; `OFFSET N → cursor`; `key={Math.random()} → key estável`.
  - naming-conventions: `isNotActive → isActive:false`; `interface IUser → User`; `enum TS → union literal`.
  - runtime-validation: `process.env.X! → requireEnv("X")`.
  - api-conventions: `POST /createOrder → POST /orders`; `GET com body → query params`.
- [ ] **Step 2:** Verificar teto de linhas: `for f in <os 8>; do wc -l $f; done` → cada ≤ 70.
- [ ] **Step 3: Commit** `git commit -am "docs(standards): enriquecer 8 std do tier lintável das fontes (Phase 1)"`

### Task 1.2: Enriquecer os 12 std guidance-only

**Files (Modify):** `assets/standards/std-{security,error-handling,secret-conventions,test-discipline,caching,documentation,grounding,code-review,accessibility,internationalization,state-management,commit-hygiene}.md`

- [ ] **Step 1:** Restaurar exemplos/anti-patterns concretos perdidos vs fonte (guidance LLM), mantendo ≤ 70 linhas. Para os 4 com linter, adicionar à tabela Anti-patterns as linhas das extensões da Phase 5 (ex.: secret: `NEXT_PUBLIC_*KEY`, `console.log(process.env)`; test: `waitForTimeout`, `expect(true).toBe(true)`).
- [ ] **Step 2:** `std-commit-hygiene.md`: adicionar nota — *"Enforcement via hook commit-msg (Conventional Commits), não linter de arquivo. Ver hooks/commit-msg-guard."*
- [ ] **Step 3: Commit** `git commit -am "docs(standards): enriquecer 12 std guidance-only (Phase 1)"`

### Task 1.3: Criar std-typescript-strict.md (stack-scoped)

**Files:** Create `assets/standards/std-typescript-strict.md`

- [ ] **Step 1: Escrever o std** (frontmatter + corpo, pt-BR), derivado de `framework_ddc/.contexts/engineering/rules/development.md`:

```markdown
---
id: std-typescript-strict
description: Strictness de TypeScript — proíbe any, enum e default export de função
version: 1.0.0
source: devflow-default
applyTo: ["**/*.{ts,tsx}"]
activation: on-demand
relatedAdrs: ["007-default-standards-library"]
enforcement:
  linter: machine/std-typescript-strict.js
---
## Princípios

- **Nunca `: any`** — use `unknown` + narrowing, ou tipe explicitamente. `any` desliga o type-checker.
- **Nunca `enum`** — use union literal (`type Status = "ACTIVE" | "PENDING"`); enum gera runtime desnecessário e quebra tree-shaking.
- **Named exports** — evite `export default function`; named export ajuda discovery e refactor.
- Imports por alias absoluto, não `../../../`.

> Único std **stack-scoped** (TS-only) do conjunto default — exceção consciente ao set stack-agnostic.

## Anti-patterns

| Errado | Corrija para |
|---|---|
| `function f(x: any)` | `function f(x: unknown)` + narrowing |
| `enum Status { A, B }` | `type Status = "A" \| "B"` |
| `export default function f()` | `export function f()` |
| `import x from "../../../lib/x"` | `import x from "@/lib/x"` |
```

- [ ] **Step 2:** Adicionar `std-typescript-strict.md` ao `assets/standards/MANIFEST.txt`.
- [ ] **Step 3: Commit** `git commit -am "feat(standards): std-typescript-strict (stack-scoped TS) + MANIFEST (Phase 1)"`

### Task 1.4: Ampliar `applyTo` para `.sql` (BLOCKER — fix da Review R1)

> **Por que (consenso dos 3 reviewers):** `findApplicableStandards` (`scripts/lib/standards-loader.mjs:86`) gateia a execução do linter por `applyTo` via `matchGlob` **antes** de invocar o linter. Com `applyTo: ["**/*.{ts,tsx,js,jsx,py,go}"]`, um arquivo `.sql` **nunca** é lintado → `std-data-modeling` e `std-migration` (que lintam DDL `.sql` real) ficam mortos no projeto consumidor, apesar do harness passar (o harness invoca o linter direto, bypassa `applyTo`). A widening é **per-std**: só os std com regra SQL ganham `.sql`.

**Files (Modify):** `assets/standards/std-{data-modeling,migration,performance}.md`; Create `tests/validation/test-applyto-sql-routing.mjs`

- [ ] **Step 1: Teste (RED)** — provar que um `.sql` roteia para o linter via o loader real:

```javascript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { findApplicableStandards } from "../../scripts/lib/standards-loader.mjs";

describe("applyTo routing — .sql alcança os linters SQL", () => {
  for (const id of ["std-data-modeling", "std-migration", "std-performance"]) {
    it(`${id} casa um arquivo .sql`, () => {
      const stds = findApplicableStandards("db/migrations/001_init.sql");
      assert.ok(stds.some(s => s.id === id), `${id} deve aplicar a .sql`);
    });
  }
});
```

> Nota: confirmar a assinatura real de `findApplicableStandards` (pode exigir `(filePath, standards[])` ou `(projectRoot, filePath)`). Ajustar a chamada do teste ao contrato real lido em `standards-loader.mjs` antes do Step 2.

- [ ] **Step 2: Rodar** `node --test tests/validation/test-applyto-sql-routing.mjs` → FAIL (`.sql` não casa).
- [ ] **Step 3: Ampliar o frontmatter** dos 3 std: `applyTo: ["**/*.{sql,ts,tsx,js,jsx,py,go}"]`. **NÃO** adicionar `.sql` a observability/naming/typescript-strict (regras TS/JS — manter `applyTo` honesto).
- [ ] **Step 4: Validar SI-5** — o novo glob passa `validateSubset` (sem traversal); rodar a suíte de loader: `node --test tests/validation/test-run-linter-merged.mjs` → verde.
- [ ] **Step 5: Rodar** → PASS (os 3 `.sql` roteiam).
- [ ] **Step 6: Commit** `git commit -am "fix(standards): applyTo inclui .sql p/ data-modeling/migration/performance (Review R1)"`

---

## Phase 2 — Linters tier ALTA (TDD)
**Agent:** test-writer + security-auditor (sign-off ReDoS/FP)

### Task 2.1: std-data-modeling linter

**Files:** Create `assets/standards/machine/std-data-modeling.js`; Modify `assets/standards/std-data-modeling.md`, `tests/validation/test-default-linters.mjs`

- [ ] **Step 1: Adicionar entrada ao CURATED** (RED) em `test-default-linters.mjs`:

```javascript
{ id: "std-data-modeling",
  bad: 'CREATE TABLE orders (created_at TIMESTAMP, price FLOAT, name VARCHAR(255));\n',
  good: 'CREATE TABLE orders (created_at TIMESTAMPTZ NOT NULL, price NUMERIC(18,4), name TEXT);\n' },
```

- [ ] **Step 2: Rodar e ver falhar** — `node --test tests/validation/test-default-linters.mjs` → FAIL (linter não existe).
- [ ] **Step 3: Implementar o linter** (GATE em DDL para baixo FP):

```javascript
#!/usr/bin/env node
// assets/standards/machine/std-data-modeling.js — linter default bundlado (TCB do plugin).
// Só em DDL (CREATE TABLE). Sinaliza TIMESTAMP sem tz, VARCHAR(n), FLOAT/REAL. Contrato SI-4.
import { readFileSync } from "node:fs";
const fp = process.argv[2];
if (!fp) process.exit(0);
let c = "";
try { c = readFileSync(fp, "utf-8"); } catch { process.exit(0); }
if (!/CREATE\s+TABLE/i.test(c)) process.exit(0);
const re = /\bTIMESTAMP\b(?!\s*TZ)(?!\s+WITH\s+TIME\s+ZONE)|\bVARCHAR\s*\(\s*\d+\s*\)|\b(?:FLOAT|DOUBLE\s+PRECISION|REAL)\b/gi;
const hits = c.match(re) || [];
if (hits.length > 0) {
  console.log(`VIOLATION: ${hits.length} tipo(s) de coluna problemático(s) (TIMESTAMP sem tz / VARCHAR(n) / FLOAT) em ${fp}. Use TIMESTAMPTZ / TEXT / NUMERIC. Ver std-data-modeling › Anti-patterns.`);
  process.exit(1);
}
process.exit(0);
```

- [ ] **Step 4: Religar o .md** — em `std-data-modeling.md` frontmatter: `enforcement.linter: machine/std-data-modeling.js`, remover `weakStandardWarning`, bump version.
- [ ] **Step 5: Rodar e ver passar** — `node --test tests/validation/test-default-linters.mjs` → os 3 testes de `std-data-modeling` PASS.
- [ ] **Step 6: Teste de stress ReDoS** — adicionar ao bloco "ReDoS guard": `"CREATE TABLE t (" + "TIMESTAMP".repeat(20000) + ")"` lint < 2s.
- [ ] **Step 7: Commit** `git commit -am "feat(standards): linter std-data-modeling (TDD, FP bar) (Phase 2)"`

### Task 2.2: std-schemas linter

**Files:** Create `assets/standards/machine/std-schemas.js`; Modify `std-schemas.md`, `test-default-linters.mjs`

- [ ] **Step 1: CURATED (RED):**

```javascript
{ id: "std-schemas",
  bad: 'export const S = z.object({ payload: z.any() }).passthrough();\n',
  good: 'export const S = z.object({ payload: z.unknown() });\n' },
```

- [ ] **Step 2:** Rodar → FAIL.
- [ ] **Step 3: Implementar** (regex `/z\.any\(\)|\.passthrough\(\)/g`, mensagem "z.any()/passthrough em schema"). Usar o molde do Recipe.
- [ ] **Step 4:** Religar `std-schemas.md`.
- [ ] **Step 5:** Rodar → PASS.
- [ ] **Step 6: Commit** `git commit -am "feat(standards): linter std-schemas (z.any/passthrough) (Phase 2)"`

### Task 2.3: std-observability linter

**Files:** Create `assets/standards/machine/std-observability.js`; Modify `std-observability.md`, `test-default-linters.mjs`

- [ ] **Step 1: CURATED (RED):**

```javascript
{ id: "std-observability",
  bad: 'export function f(){ console.log("user", u); }\n',
  good: 'export function f(){ logger.info({ userId: u.id }, "user_loaded"); }\n' },
```

- [ ] **Step 2:** Rodar → FAIL.
- [ ] **Step 3: Implementar** com GATE de auto-exclusão de testes/scripts:

```javascript
#!/usr/bin/env node
// assets/standards/machine/std-observability.js — linter default bundlado (TCB do plugin).
// console.log/debug/info em código de runtime (exclui testes/scripts). Contrato SI-4.
import { readFileSync } from "node:fs";
const fp = process.argv[2];
if (!fp) process.exit(0);
if (/\.(test|spec)\.[tj]sx?$|[\\/](scripts|tests?|__tests__|__mocks__)[\\/]/.test(fp)) process.exit(0);
let c = "";
try { c = readFileSync(fp, "utf-8"); } catch { process.exit(0); }
const re = /\bconsole\.(?:log|debug|info)\s*\(/g;
const hits = c.match(re) || [];
if (hits.length > 0) {
  console.log(`VIOLATION: ${hits.length} console.log/debug/info em código de runtime em ${fp}. Use logger estruturado. Ver std-observability › Anti-patterns.`);
  process.exit(1);
}
process.exit(0);
```

- [ ] **Step 4:** Religar `std-observability.md`.
- [ ] **Step 5:** Rodar → PASS. **Guard anti-no-op (fix Review R5):** adicionar ao harness um assert de que o tmpdir é neutro — `assert.doesNotMatch(tmpdir(), /[\\/](tests?|__tests__|scripts)[\\/]/, "TMPDIR contém segmento excluído → linter vira no-op silencioso")`. Sem isso, o GREEN pode passar com o linter desligado pelo GATE.
- [ ] **Step 6: Commit** `git commit -am "feat(standards): linter std-observability (console.log runtime) (Phase 2)"`

---

## Phase 3 — Linters tier MÉDIA (TDD)
**Agent:** test-writer + security-auditor

### Task 3.1: std-migration linter

**Files:** Create `assets/standards/machine/std-migration.js`; Modify `std-migration.md`, `test-default-linters.mjs`

- [ ] **Step 1: CURATED (RED):** o sample roda num path neutro; o linter NÃO deve gatear por path de migração (senão o sample tmp não casa). Gatear por DDL/keywords:

```javascript
{ id: "std-migration",
  bad: 'CREATE INDEX idx_orders_tenant ON orders(tenant_id);\nUPDATE orders SET status = 1;\n',
  good: 'CREATE INDEX CONCURRENTLY idx_orders_tenant ON orders(tenant_id);\nUPDATE orders SET status = 1 WHERE id = 1;\n' },
```

- [ ] **Step 2:** Rodar → FAIL.
- [ ] **Step 3: Implementar** (3 regras, statement-scan para UPDATE sem WHERE):

```javascript
#!/usr/bin/env node
// assets/standards/machine/std-migration.js — linter default bundlado (TCB do plugin).
// CREATE INDEX sem CONCURRENTLY; UPDATE sem WHERE; VACUUM FULL/TRUNCATE. Contrato SI-4.
import { readFileSync } from "node:fs";
const fp = process.argv[2];
if (!fp) process.exit(0);
let c = "";
try { c = readFileSync(fp, "utf-8"); } catch { process.exit(0); }
const v = [];
if (/CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?!CONCURRENTLY)/i.test(c)) v.push("CREATE INDEX sem CONCURRENTLY");
if (/\b(?:VACUUM\s+FULL|TRUNCATE)\b/i.test(c)) v.push("VACUUM FULL/TRUNCATE em migração");
for (const stmt of c.split(";")) {
  if (/\bUPDATE\s+\w+\s+SET\b/i.test(stmt) && !/\bWHERE\b/i.test(stmt)) { v.push("UPDATE sem WHERE"); break; }
}
if (v.length > 0) {
  console.log(`VIOLATION: ${v.length} risco(s) de migração (${v.join("; ")}) em ${fp}. Ver std-migration › Anti-patterns.`);
  process.exit(1);
}
process.exit(0);
```

- [ ] **Step 4:** Religar `std-migration.md`.
- [ ] **Step 5:** Rodar → PASS.
- [ ] **Step 6: Commit** `git commit -am "feat(standards): linter std-migration (Phase 3)"`

### Task 3.2: std-performance linter

**Files:** Create `assets/standards/machine/std-performance.js`; Modify `std-performance.md`, `test-default-linters.mjs`

- [ ] **Step 1: CURATED (RED):**

```javascript
{ id: "std-performance",
  bad: 'const q = "SELECT * FROM orders OFFSET 100";\n',
  good: 'const q = "SELECT id, total FROM orders WHERE id > $1 LIMIT 20";\n' },
```

- [ ] **Step 2:** Rodar → FAIL.
- [ ] **Step 3: Implementar** (regex `/SELECT\s+\*|\bOFFSET\s+\d+|key=\{\s*(?:Math\.random\(\)|Date\.now\(\))/gi`, mensagem "SELECT */OFFSET/key instável").
- [ ] **Step 4:** Religar `std-performance.md`.
- [ ] **Step 5:** Rodar → PASS.
- [ ] **Step 6: Commit** `git commit -am "feat(standards): linter std-performance (Phase 3)"`

### Task 3.3: std-naming-conventions linter

**Files:** Create `assets/standards/machine/std-naming-conventions.js`; Modify `std-naming-conventions.md`, `test-default-linters.mjs`

- [ ] **Step 1: CURATED (RED):**

```javascript
{ id: "std-naming-conventions",
  bad: 'enum Status { A, B }\nconst isNotActive = true;\n',
  good: 'type Status = "A" | "B";\nconst isActive = false;\nclass IOStream {}\ninterface IPAddress {}\n' },
```

> **Fix Review R2 (HIGH-FP):** o arm `interface I[A-Z]` foi **removido** — falso-positivava em `IOStream`, `IPAddress`, `IServiceProvider` (não distingue `IUser` de `IOStream`). O `good` agora trava essa regressão incluindo `IOStream`/`IPAddress`. Restam 2 arms de baixo-FP: `enum` TS e boolean negativo.

- [ ] **Step 2:** Rodar → FAIL.
- [ ] **Step 3: Implementar** (regex `/\benum\s+\w+\s*\{|\bis(?:Not|n['’]t)[A-Z]\w*/g`, mensagem "naming (enum TS / boolean negativo)").
- [ ] **Step 4:** Religar `std-naming-conventions.md`.
- [ ] **Step 5:** Rodar → PASS.
- [ ] **Step 6: Commit** `git commit -am "feat(standards): linter std-naming-conventions (Phase 3)"`

### Task 3.4: std-runtime-validation linter

**Files:** Create `assets/standards/machine/std-runtime-validation.js`; Modify `std-runtime-validation.md`, `test-default-linters.mjs`

- [ ] **Step 1: CURATED (RED):**

```javascript
{ id: "std-runtime-validation",
  bad: 'const k = process.env.API_KEY!;\n',
  good: 'const k = requireEnv("API_KEY");\nif (process.env.NODE_ENV !== "prod" && process.env.X != null) {}\n' },
```

> **Fix Review R3 (HIGH-FP):** `process\.env\.\w+\s*!` falso-positivava em `process.env.NODE_ENV !== "prod"` e `!= null` (código idiomático correto). Regex corrigida para casar **só** a non-null assertion (`!` não seguido de `=`). O `good` trava a regressão com `!==` e `!=`.

- [ ] **Step 2:** Rodar → FAIL.
- [ ] **Step 3: Implementar** (regex `/process\.env\.\w+!(?![=])/g`, mensagem "process.env.X! (non-null assertion) sem validação").
- [ ] **Step 4:** Religar `std-runtime-validation.md`.
- [ ] **Step 5:** Rodar → PASS.
- [ ] **Step 6: Commit** `git commit -am "feat(standards): linter std-runtime-validation (Phase 3)"`

### Task 3.5: std-api-conventions linter

**Files:** Create `assets/standards/machine/std-api-conventions.js`; Modify `std-api-conventions.md`, `test-default-linters.mjs`

- [ ] **Step 1: CURATED (RED):**

```javascript
{ id: "std-api-conventions",
  bad: 'app.post("/v1/createOrder", handler);\n',
  good: 'app.post("/v1/orders", handler);\n' },
```

- [ ] **Step 2:** Rodar → FAIL.
- [ ] **Step 3: Implementar** (regex `/["'`]\/(?:v\d+\/)?(?:[\w-]+\/)*(?:get|create|update|delete|fetch|make|do|set)[A-Z]\w*/g`, mensagem "verbo no path REST"). **FP-bar edge (Review architect #3 / security MÉDIO):** pode disparar em literais não-API tipo `/getStarted`. Enquadrar no `.md` como **nudge**, não erro duro. Se o sign-off final de segurança ficar marginal, esta é a regra a **dropar** primeiro (sem afetar as outras).
- [ ] **Step 4:** Religar `std-api-conventions.md`.
- [ ] **Step 5:** Rodar → PASS.
- [ ] **Step 6: Commit** `git commit -am "feat(standards): linter std-api-conventions (verbo no path) (Phase 3)"`

---

## Phase 4 — Linter std-typescript-strict (TDD)
**Agent:** test-writer + security-auditor

### Task 4.1: std-typescript-strict linter

**Files:** Create `assets/standards/machine/std-typescript-strict.js`; Modify `test-default-linters.mjs`

- [ ] **Step 1: CURATED (RED):**

```javascript
{ id: "std-typescript-strict",
  bad: 'export default function f(x: any) { return x; }\n',
  good: 'export function f(x: unknown) { return x; }\n// nota: any value aqui é prosa, não tipo\n' },
```

> **Fix Review R4 (MÉDIO-FP):** `:\s*any\b` disparava em comentário/string (`// pass: any value`). Ancorar a uma posição de tipo: `:\s*any\b(?=\s*[,;)\]>=}]|$)` casa `x: any`, `x: any)`, `x: any;` e poupa prosa `: any value`. O `good` inclui um comentário com "any value" p/ travar a regressão.

- [ ] **Step 2:** Rodar → FAIL.
- [ ] **Step 3: Implementar** (regex `/:\s*any\b(?=\s*[,;)\]>=}]|$)|\benum\s+\w+\s*\{|\bexport\s+default\s+function\b/gm`, mensagem "TS strictness (any/enum/default export)"). O `.md` já aponta `enforcement.linter` (Task 1.3) — sem religar.
- [ ] **Step 4:** Rodar → PASS.
- [ ] **Step 5: Commit** `git commit -am "feat(standards): linter std-typescript-strict (Phase 4)"`

---

## Phase 5 — Extensões aos 4 linters existentes (TDD)
**Agent:** refactoring-specialist + security-auditor

> Cada extensão: adicionar um **segundo par** `{bad, good}` específico da regra nova num novo array `EXTENSIONS` no harness (ou ampliar o `bad` existente garantindo que o `good` atual continua não-disparando). Preferir array `EXTENSIONS` separado para não confundir os asserts existentes.

### Task 5.1: secret-conventions — NEXT_PUBLIC_*KEY + console.log(process.env)

**Files:** Modify `assets/standards/machine/std-secret-conventions.js`, `test-default-linters.mjs`

- [ ] **Step 1: Adicionar teste (RED)** num bloco novo `describe("Phase 5 — extensões")`:

```javascript
it("secret-conventions: NEXT_PUBLIC_*KEY dispara", () => {
  const r = runLinter(join(ASSETS, "machine", "std-secret-conventions.js"),
    'export const k = process.env.NEXT_PUBLIC_OPENAI_API_KEY;\n');
  assert.equal(r.status, 1, r.stdout);
});
it("secret-conventions: env normal não dispara (FP bar)", () => {
  const r = runLinter(join(ASSETS, "machine", "std-secret-conventions.js"),
    'export const url = process.env.NEXT_PUBLIC_API_URL;\n');
  assert.equal(r.status, 0, r.stdout);
});
```

- [ ] **Step 2:** Rodar → FAIL.
- [ ] **Step 3: Estender o linter** — adicionar ao `re` (alternância): `process\.env\.NEXT_PUBLIC_\w*(?:KEY|SECRET|TOKEN|PASSWORD)\b|console\.log\(\s*process\.env\b`. Manter a regex de formatos-de-chave existente.
- [ ] **Step 4:** Rodar → PASS (incluindo os testes CURATED antigos do std-secret-conventions).
- [ ] **Step 5: Commit** `git commit -am "feat(standards): secret-conventions pega NEXT_PUBLIC_*KEY + log(env) (Phase 5)"`

### Task 5.2: error-handling — catch que só console.log

**Files:** Modify `assets/standards/machine/std-error-handling.js`, `test-default-linters.mjs`

- [ ] **Step 1: Teste (RED):** `bad: 'try { f(); } catch (e) { console.log(e); }'` dispara; `good: 'try { f(); } catch (e) { logger.error(e); throw e; }'` não.
- [ ] **Step 2:** Rodar → FAIL.
- [ ] **Step 3: Estender** — além do catch vazio existente, regra ReDoS-safe: `/catch\s*\([^)]*\)\s*\{\s*console\.(?:log|error)\([^)]*\)\s*;?\s*\}/g`.
- [ ] **Step 4:** Rodar → PASS + stress ReDoS < 2s.
- [ ] **Step 5: Commit** `git commit -am "feat(standards): error-handling pega catch-só-console.log (Phase 5)"`

### Task 5.3: security — SQL string-interpolada

**Files:** Modify `assets/standards/machine/std-security.js`, `test-default-linters.mjs`

- [ ] **Step 1: Teste (RED):** `bad: 'const q = `SELECT * FROM u WHERE id = ${id}`;'` dispara; `good: 'const q = sql`SELECT * FROM u WHERE id = ${id}`;'`? — para baixo FP, NÃO flagar tagged template `sql\`...\``. good usa prepared: `db.query("SELECT * FROM u WHERE id = $1", [id])`.
- [ ] **Step 2:** Rodar → FAIL.
- [ ] **Step 3: Estender** — adicionar (alternância) regra que casa template literal com keyword SQL e `${`, **não** precedido de tag `sql`: `/(?<!sql)`[^`]*\b(?:SELECT|INSERT|UPDATE|DELETE)\b[^`]*\$\{/gi`. Manter `dangerouslySetInnerHTML`.
- [ ] **Step 4:** Rodar → PASS.
- [ ] **Step 5: Commit** `git commit -am "feat(standards): security pega SQL string-interpolada (Phase 5)"`

### Task 5.4: test-discipline — waitForTimeout + expect(true).toBe(true)

**Files:** Modify `assets/standards/machine/std-test-discipline.js`, `test-default-linters.mjs`

- [ ] **Step 1: Teste (RED):** `bad: 'await page.waitForTimeout(500);'` dispara; `bad2: 'expect(true).toBe(true);'` dispara; `good: 'await expect(page.getByText("x")).toBeVisible();'` não.
- [ ] **Step 2:** Rodar → FAIL.
- [ ] **Step 3: Estender** — adicionar à alternância existente (`.only/.skip`): `\bwaitForTimeout\s*\(|expect\(\s*true\s*\)\.toBe\(\s*true\s*\)`.
- [ ] **Step 4:** Rodar → PASS.
- [ ] **Step 5: Commit** `git commit -am "feat(standards): test-discipline pega waitForTimeout + assert trivial (Phase 5)"`

---

## Phase 6 — Hook commit-msg (Conventional Commits)
**Agent:** backend-specialist + security-auditor

### Task 6.1: Validador de Conventional Commits (TDD)

**Files:** Create `hooks/commit-msg-guard.mjs`, `tests/validation/test-commit-msg-guard.mjs`

- [ ] **Step 1: Teste (RED)** em `test-commit-msg-guard.mjs`:

```javascript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isValidConventionalCommit } from "../../hooks/commit-msg-guard.mjs";

describe("commit-msg guard — Conventional Commits", () => {
  it("aceita feat com escopo", () => assert.equal(isValidConventionalCommit("feat(orders): add idempotency key"), true));
  it("aceita fix sem escopo", () => assert.equal(isValidConventionalCommit("fix: prevent redirect loop"), true));
  it("aceita breaking com !", () => assert.equal(isValidConventionalCommit("feat(auth)!: drop legacy token"), true));
  it("rejeita tipo inválido", () => assert.equal(isValidConventionalCommit("update stuff"), false));
  it("rejeita subject vazio", () => assert.equal(isValidConventionalCommit("feat: "), false));
  it("rejeita subject com ponto final", () => assert.equal(isValidConventionalCommit("feat: add thing."), false));
  it("rejeita subject > 72 chars", () => assert.equal(isValidConventionalCommit("feat: " + "x".repeat(80)), false));
});
```

- [ ] **Step 2: Rodar** `node --test tests/validation/test-commit-msg-guard.mjs` → FAIL (módulo não existe).
- [ ] **Step 3: Implementar** `hooks/commit-msg-guard.mjs`:

```javascript
#!/usr/bin/env node
// hooks/commit-msg-guard.mjs — valida Conventional Commits.
// Export testável + CLI: lê a mensagem do arquivo em argv[2] (commit-msg hook) e exit 1 se inválida.
const TYPES = ["feat","fix","docs","style","refactor","perf","test","build","ci","chore","revert"];
const RE = new RegExp(`^(${TYPES.join("|")})(\\([\\w$.-]+\\))?(!)?: (.+)$`);
export function isValidConventionalCommit(msg) {
  const first = String(msg).split("\n")[0].trim();
  const m = first.match(RE);
  if (!m) return false;
  const subject = m[4];
  if (subject.length < 1 || first.length > 72) return false;
  if (subject.endsWith(".")) return false;
  return true;
}
// CLI (commit-msg): argv[2] = caminho do COMMIT_EDITMSG
if (import.meta.url === `file://${process.argv[1]}`) {
  const { readFileSync } = await import("node:fs");
  const path = process.argv[2];
  if (!path) process.exit(0);
  let msg = ""; try { msg = readFileSync(path, "utf-8"); } catch { process.exit(0); }
  if (!isValidConventionalCommit(msg)) {
    console.error("✗ Mensagem de commit não segue Conventional Commits: <tipo>(<escopo>)?: <descrição imperativa ≤72, sem ponto>.");
    process.exit(1);
  }
  process.exit(0);
}
```

- [ ] **Step 4: Rodar** → PASS (7/7).
- [ ] **Step 5: Commit** `git commit -am "feat(hooks): commit-msg-guard valida Conventional Commits (TDD) (Phase 6)"`

### Task 6.2: Wiring do hook + doc

**Files:** Modify `hooks/` README/settings doc; (não auto-instalar no git do usuário sem consentimento)

- [ ] **Step 1:** Documentar em `hooks/README.md` (ou equivalente) como ativar: `commit-msg` git hook chamando `node hooks/commit-msg-guard.mjs "$1"`, OU PreToolUse `Bash(git commit*)` via update-config. **Não** escrever em `.git/hooks` automaticamente — é opt-in do consumidor.
- [ ] **Step 2: Commit** `git commit -am "docs(hooks): instruções de ativação do commit-msg-guard (Phase 6)"`

---

## Phase 7 — E2E via hook real, sem eject (TDD)
**Agent:** test-writer

### Task 7.0: Teste ReDoS parametrizado (todos os linters)

**Files:** Modify `tests/validation/test-default-linters.mjs`

- [ ] **Step 1:** Adicionar um `describe("ReDoS — todos os linters < 2s")` que itera `readdirSync(join(ASSETS,"machine"))` e, para cada `.js`, roda `runLinter` com 3 inputs de 200k chars (`"x".repeat(200000)`, `"catch".repeat(40000)`, `"CREATE TABLE ".repeat(15000)`) assertando `dt < 2000`.
- [ ] **Step 2: Rodar** → PASS para todos (novos + existentes).
- [ ] **Step 3: Commit** `git commit -am "test(standards): guard ReDoS parametrizado sobre todos os linters (Phase 7)"`

### Task 7.1: E2E enriquecido (modelo TG8)

**Files:** Create `tests/integration/test-e2e-enriched-linters-hook.mjs`

- [ ] **Step 1: Escrever o E2E** (espelha `tests/integration/test-e2e-default-enforcement-hook.mjs`): projeto-tmp sem `.context/standards`, invoca `hooks/post-tool-use` real, para cada std novo escreve um arquivo violador e asserta `VIOLATION` + o id do std no stdout. **Fixtures por extensão correta (depende da Task 1.4):** `db/migrations/001.sql` com `CREATE TABLE t (a TIMESTAMP);` → `std-data-modeling` (só roteia se applyTo tem `.sql`); `db/migrations/002.sql` com `CREATE INDEX i ON t(c);` → `std-migration`; `src/s.ts` com `z.any()` → `std-schemas`; `src/o.ts` com `console.log("x")` → `std-observability`; `src/n.ts` com `enum E {A}` → `std-naming-conventions`. Mais um arquivo conforme por std → sem VIOLATION. **Asserts por substring** (`match(/std-<id>/)`) para tolerar que >1 std possa aplicar ao mesmo arquivo (fix Review code-reviewer #2).
- [ ] **Step 2: Rodar** `node --test tests/integration/test-e2e-enriched-linters-hook.mjs` → PASS (prova enforcement default sem eject ponta-a-ponta).
- [ ] **Step 3: Suíte completa** — `node --test tests/validation/*.mjs tests/integration/*.mjs` → tudo verde (exceto as 2 falhas de rede pré-existentes).
- [ ] **Step 4: Commit** `git commit -am "test(standards): E2E enriquecido via hook real sem eject (Phase 7)"`

---

## Phase 8 — ADR-007 v2.1.0 (Aprovado)
**Agent:** documentation-writer (via devflow:adr-builder EVOLVE minor)

### Task 8.1: Evoluir ADR-007 → v2.1.0

**Files:** Create `.context/engineering/adrs/007-default-standards-library-v2.1.0.md`; Modify `.context/engineering/adrs/README.md`

- [ ] **Step 1:** Invocar `devflow:adr-builder` modo EVOLVE **minor** sobre `007-default-standards-library-v2.0.0`, produzindo um **novo arquivo versionado** `007-default-standards-library-v2.1.0.md` com `supersedes: ["007-default-standards-library-v2.0.0"]` (convenção file-per-version já usada no repo — v1.0.0/v2.0.0 são arquivos separados; minor = estende, não reverte). Mudanças: `status: Aprovado`; `version: 2.1.0`; Guardrails — enumerar os **13 linters de arquivo auto-disparados** (os 4 originais + data-modeling, schemas, observability, migration, performance, naming-conventions, runtime-validation, api-conventions, typescript-strict); **registrar que o commit-msg guard é canal opt-in/advisory — NÃO conta nos 13** (não dispara via post-tool-use); reafirmar barra de FP; registrar std-typescript-strict como única exceção stack-scoped. Confirmar que `relatedAdrs: ["007-default-standards-library"]` (slug base, Task 1.3) resolve no README index; alinhar se não.
- [ ] **Step 2: Audit** — rodar o audit da ADR (S1–S7/12 checks via adr-audit.mjs) → PASSED.
- [ ] **Step 3: Commit** `git commit -am "docs(adr): ADR-007 v2.1.0 — conjunto curado estendido, Aprovado (Phase 8)"`

---

## Phase 9 — Sync standalone + version bump + CHANGELOG
**Agent:** devops-specialist

### Task 9.1: Sync `.md` → NEXUZ-SYS/devflow-standards

**Files:** todos os `assets/standards/*.md` enriquecidos + `MANIFEST.txt`

- [ ] **Step 1:** Push do snapshot `.md` (NUNCA `.js`) para `NEXUZ-SYS/devflow-standards`, conforme memória `project_standards_standalone_sync`, como **passo manual documentado** (não criar `scripts/sync-standards-to-standalone.sh` commitado — push once-per-release não justifica script no TCB; architect rec #4). Confirmar que `update-default-standards.sh` (Step 4d) fetcha só `.md` e que o MANIFEST inclui `std-typescript-strict.md`.
- [ ] **Step 2:** Verificar guard anti-RCE: `node --test tests/scripts/test-update-default-standards.sh`-equivalente ou rodar o script anti-RCE → `machine/*.js` byte-idêntico, fetch nunca grava `.js`.
- [ ] **Step 3: Commit** (no repo standalone) — fora deste repo; registrar o SHA no PR body.

### Task 9.2: Version bump + CHANGELOG

**Files:** Modify `.claude-plugin/plugin.json`, `CHANGELOG.md`

- [ ] **Step 1:** Bump minor (ex.: 1.10.0 → 1.11.0) em `.claude-plugin/plugin.json`.
- [ ] **Step 2:** Entrada no `CHANGELOG.md` (pt-BR): enriquecimento dos 20 std + 8 linters novos + std-typescript-strict + 4 extensões + commit-msg guard + ADR-007 v2.1.0; enforcement 4 → 13.
- [ ] **Step 3: Commit** `git commit -am "chore(release): bump 1.11.0 + CHANGELOG (Phase 9)"`

---

## Self-Review (cobertura do spec)

| Spec AC | Task(s) |
|---|---|
| AC1 (20 .md enriquecidos ≤70, audit) | 1.1, 1.2 |
| AC2 (linters ALTA+MÉDIA TDD + E2E) | 2.x, 3.x, **1.4 (applyTo .sql)**, 7.0, 7.1 |
| AC3 (4 extensões) | 5.x |
| AC4 (std-typescript-strict) | 1.3, 4.1 |
| AC5 (commit-msg hook) | 6.x |
| AC6 (ADR v2.1.0 Aprovado) | 8.1 |
| AC7 (sync + MANIFEST) | 1.3, 9.1 |
| AC8 (suíte verde, 4→13) | 7.1, 9.2 |
| AC9 (revalidação registrada) | 0 |

Sem placeholders de código; regexes ReDoS-safe (Task 7.0 parametrizada); nomes de função (`isValidConventionalCommit`) consistentes; cada linter segue o contrato SI-4 verificado nos modelos existentes.

## Correções aplicadas pós-Review (R phase)

Consenso dos 3 reviewers (security-auditor, architect, code-reviewer), todos empíricos:

- **R1 (BLOCK) — applyTo `.sql`:** nova **Task 1.4** amplia `applyTo` p/ data-modeling/migration/performance + teste de roteamento. Phase 7 usa fixtures `.sql` reais.
- **R2 (HIGH-FP) — naming `interface I[A-Z]`:** arm removido (FP em `IOStream`/`IPAddress`); `good` trava regressão (Task 3.3).
- **R3 (HIGH-FP) — runtime-validation `process.env.X!`:** regex `(?![=])` poupa `!==`/`!=`; `good` com `!==` (Task 3.4).
- **R4 (MÉDIO) — typescript-strict `: any`:** ancorado p/ poupar comentário/string (Task 4.1).
- **R5 (MÉDIO) — observability gate:** + `__tests__`/`__mocks__` + assert de TMPDIR neutro (Task 2.3).
- **ReDoS:** virou teste único parametrizado (Task 7.0).
- **api-conventions:** enquadrado como nudge; primeiro a dropar se sign-off marginal (Task 3.5).
- **commit-msg:** decontado dos 13 linters (opt-in/advisory) — spec + ADR ajustados.
- **ADR v2.1.0:** novo arquivo versionado com supersedes (convenção file-per-version) (Task 8.1).
- **sync:** passo manual documentado, não script commitado (Task 9.1).
- **Pushback aceito:** migration `CREATE INDEX IF NOT EXISTS` **não** é FP (índice sem CONCURRENTLY É violação) — regex mantida.
