# Correção dos gaps de cobertura de Standards — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) ou superpowers:executing-plans para implementar task-by-task. Steps usam checkbox (`- [ ]`).

> **DevFlow workflow:** fix-standards-coverage-gaps | **Scale:** MEDIUM→LARGE | **Phase:** P→R
> **Spec:** `docs/superpowers/specs/2026-06-12-standards-coverage-gap-fix-design.md`
> **Análise-fonte:** `docs/research/standards-coverage-gap.md`

**Goal:** Fechar os 3 eixos de gap de Standards: gerar os stds que a taxonomy já define (A), registrar concerns lintáveis ausentes (B), e rotear o enforcement dos 8 stds sem linter pelo veículo correto (C).

**Architecture:** 4 fases sequenciadas em ordem de dependência (taxonomy → stds → enforcement → sync). Linters seguem o contrato SI-4 (regex conservadora, `exit 1` + `VIOLATION:`), `machine/*.js` são bundled-only (ADR-007). Tudo TDD (RED→GREEN) no padrão `tests/odoo-standards/std-odoo-*.test.mjs`.

**Tech Stack:** Node.js (ESM, `node:test`, `node:fs`), YAML (taxonomy), regex. Sem deps novas.

**Agentes DevFlow:** `architect` (Fase 1 taxonomy), `test-writer` (RED de cada linter), `feature-developer`/`backend-specialist` (GREEN dos linters), `documentation-writer` (stds .md), `devops-specialist` (Fase 4 sync/release).

---

## File Structure

| Arquivo | Responsabilidade | Ação |
|---|---|---|
| `skills/standards-builder/references/taxonomy-of-concerns.yaml` | catálogo de concerns | Modify (+4 entries) |
| `tests/standards/_helper.mjs` | helper `lintFile()` compartilhado | Create |
| `tests/standards/taxonomy-consistency.test.mjs` | trio taxonomy↔.md↔MANIFEST↔machine | Create |
| `assets/standards/std-layer-boundaries.md` `std-domain-events.md` `std-pre-commit-hygiene.md` | doutrina Eixo A | Create |
| `assets/standards/MANIFEST.txt` | lista trusted de `.md` | Modify (+3) |
| `assets/standards/machine/std-internationalization.js` `std-accessibility.js` `std-documentation.js` `std-layer-boundaries.js` `std-domain-events.js` | enforcement SI-4 | Create |
| `tests/standards/std-*.test.mjs` (5) | RED→GREEN de cada linter | Create |
| `assets/standards/std-{state-management,caching,grounding,internationalization,accessibility,documentation}.md` | frontmatter `enforcement.linter` | Modify |
| `hooks/commit-msg-guard.mjs` | enforcement commit-hygiene (JÁ EXISTE — reusar) | Verify |
| `references/danger-code-review.md` | ruleset CI p/ code-review | Create |

---

## FASE 1 — Consolidação da taxonomy (Eixo B + órfão)

**Agente:** architect

### Task 1: Helper de teste compartilhado

**Files:**
- Create: `tests/standards/_helper.mjs`

- [ ] **Step 1: Criar o helper** (replica o padrão `std-odoo-*.test.mjs`, DRY p/ todos os testes de linter)

```js
// tests/standards/_helper.mjs — runner SI-4 compartilhado para testes de linter.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { execFileSync } from "node:child_process";

const MACHINE = resolve(import.meta.dirname, "../../assets/standards/machine");

// Roda machine/<linter> contra um fixture efêmero; retorna {code, out}.
// filename pode conter subdiretórios (ex.: "src/domain/order.ts") — criamos
// recursivamente (igual ao WIP FSD), senão writeFileSync lança ENOENT e o teste
// dá falso GREEN. out concatena stdout+stderr (linter pode escrever em qualquer um).
export function lintFile(linter, filename, content) {
  const dir = mkdtempSync(join(tmpdir(), "std-"));
  const fp = join(dir, filename);
  mkdirSync(dirname(fp), { recursive: true });
  writeFileSync(fp, content);
  try {
    const out = execFileSync("node", [join(MACHINE, linter), fp], { encoding: "utf-8" });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? 1, out: ((e.stdout || "") + (e.stderr || "")).toString() };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
```

> **Revisão R (B1):** `mkdirSync` recursivo é obrigatório — sem ele a Task 10 (paths `src/domain/...`) falha por I/O e dá falso GREEN. Confirmado contra o helper do WIP FSD.

- [ ] **Step 2: Commit**

```bash
git add tests/standards/_helper.mjs
git commit -m "test(standards): add shared SI-4 linter test helper"
```

### Task 2: Registrar concerns do Eixo B + órfão na taxonomy

**Files:**
- Modify: `skills/standards-builder/references/taxonomy-of-concerns.yaml` (append em `entries:`)

- [ ] **Step 1: Adicionar os 4 entries** (no final de `entries:`, mesmo shape dos existentes)

```yaml
  - id: module-size
    summary: Arquivos e funções dentro de orçamento de tamanho; baixo acoplamento
    category: maintainability
    defaultApplyTo:
      - "**/*.{ts,tsx,js,jsx,py,go}"
    inverseHints:
      - eslint
      - max-lines
    principleTemplate: |
      Arquivos 150-500 linhas; funções 30-50 linhas (exceções: schemas declarativos,
      JSX denso de página). Um arquivo = uma responsabilidade nomeável. Imports no topo,
      sem side effect em import time. Acima do orçamento, dividir por responsabilidade.
    antiPatternTemplate:
      - rule: "Mega-arquivo utils.ts de milhares de linhas"
        correct: "Quebrar por domínio; um arquivo = uma responsabilidade"
      - rule: "Função com 8 parâmetros posicionais"
        correct: "Objeto nomeado de argumentos"
    linterHints:
      - "ESLint max-lines (500), max-lines-per-function (50), complexity, max-depth"
      - "regex conservador: contagem de linhas do arquivo > 500"
    relatedAdrCategories:
      - arquitetura
      - frontend
      - backend

  - id: environment-config
    summary: Config externa via env/secret-manager; sem lógica de negócio por ambiente
    category: process
    defaultApplyTo:
      - "src/**/*.{ts,tsx,js,jsx,py,go}"
    inverseHints:
      - dotenv
      - process.env
    principleTemplate: |
      Toda config externa vem de variável de ambiente / secret manager, nunca literal por
      ambiente. Sem `if (env === 'prod')` em código de domínio — diferença é configuração,
      não código. `.env.example` lista todas as vars; secrets isolados por ambiente.
    antiPatternTemplate:
      - rule: "const API = isDev ? 'localhost' : 'api.com'"
        correct: "process.env.API_URL com fallback validado no boot"
      - rule: "if (env === 'prod') { regra de negócio }"
        correct: "Feature flag / config; ambiente não altera lógica de domínio"
    linterHints:
      - "regex: \\b(env|NODE_ENV|APP_ENV)\\s*===\\s*['\"](prod|production|dev)['\"]"
      - "AST: ternário sobre isDev/isProd retornando URL/host literal"
    relatedAdrCategories:
      - processo
      - backend
      - bff

  - id: git-workflow
    summary: Branch naming, vida curta de branch, sem force-push em ramo compartilhado
    category: process
    defaultApplyTo:
      - "**/*"
    inverseHints:
      - husky
      - lefthook
    principleTemplate: |
      Branches feature de vida curta a partir do trunk; nome `<tipo>/<scope>-<descricao>`
      (feat/fix/hotfix/release). Nunca `git push --force` em branch compartilhada;
      `--force-with-lease` apenas na própria. Commits atômicos por intenção.
    antiPatternTemplate:
      - rule: "Branch de longa duração que diverge do trunk"
        correct: "Rebase frequente; branch de horas a poucos dias"
      - rule: "git push --force em branch com review em andamento"
        correct: "--force-with-lease apenas na própria branch"
    linterHints:
      - "hook pre-push: rejeita --force em protectedBranches"
      - "hook: valida nome da branch contra <tipo>/<scope>"
    relatedAdrCategories:
      - processo

  - id: typescript-strict
    summary: Strictness de TypeScript — proíbe any, enum e default export de função
    category: language
    defaultApplyTo:
      - "**/*.{ts,tsx}"
    inverseHints:
      - typescript
    principleTemplate: |
      tsconfig em strict mode (noImplicitAny, strictNullChecks). Proibir `any` (usar
      `unknown` + narrowing); preferir union types a `enum`; sem default export de função
      (named export ajuda discovery). Tipos derivam de schemas, não duplicados.
    antiPatternTemplate:
      - rule: "Anotação ou cast para any"
        correct: "unknown + refinement, ou tipo específico"
      - rule: "enum Status { ... }"
        correct: "type Status = 'a' | 'b' (union literal)"
    linterHints:
      - "regex: \\bany\\b em anotação de tipo; \\benum\\s+\\w+"
      - "tsconfig: strict !== true"
    relatedAdrCategories:
      - frontend
      - backend
      - bff
```

> **Nota:** `typescript-strict` já tem `assets/standards/std-typescript-strict.md` + `machine/std-typescript-strict.js`. Este entry apenas fecha o órfão (taxonomy = fonte única). `relatedAdrs` real é `007-default-standards-library`.

- [ ] **Step 2: Commit**

```bash
git add skills/standards-builder/references/taxonomy-of-concerns.yaml
git commit -m "feat(standards): register module-size, environment-config, git-workflow + typescript-strict orphan in taxonomy"
```

### Task 3: Teste de consistência taxonomy↔.md↔MANIFEST↔machine

**Files:**
- Create: `tests/standards/taxonomy-consistency.test.mjs`

- [ ] **Step 1: Escrever o teste (RED — vai falhar enquanto stds do Eixo A não existem)**

```js
// tests/standards/taxonomy-consistency.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");
const STD_DIR = resolve(ROOT, "assets/standards");
const MACHINE = resolve(STD_DIR, "machine");
const MANIFEST = resolve(STD_DIR, "MANIFEST.txt");

const manifest = readFileSync(MANIFEST, "utf-8").split("\n").map(s => s.trim()).filter(Boolean);
const mdFiles = readdirSync(STD_DIR).filter(f => f.startsWith("std-") && f.endsWith(".md"));

describe("Standards: trio MANIFEST ↔ .md ↔ machine", () => {
  it("todo .md está no MANIFEST", () => {
    const missing = mdFiles.filter(f => !manifest.includes(f));
    assert.deepEqual(missing, [], `faltam no MANIFEST: ${missing.join(", ")}`);
  });

  it("todo item do MANIFEST tem .md no disco", () => {
    const missing = manifest.filter(f => !existsSync(resolve(STD_DIR, f)));
    assert.deepEqual(missing, [], `MANIFEST aponta p/ inexistentes: ${missing.join(", ")}`);
  });

  it("todo .md declara enforcement.linter (path ou null explícito)", () => {
    // Tolerante à ordem das sub-chaves: busca `linter:` em qualquer lugar do
    // arquivo (Task 12 adiciona `enforcedBy` que pode preceder `linter`).
    const bad = mdFiles.filter(f => {
      const c = readFileSync(resolve(STD_DIR, f), "utf-8");
      return !/^\s*linter:\s*(machine\/[\w-]+\.js|null)\s*$/m.test(c);
    });
    assert.deepEqual(bad, [], `sem enforcement.linter explícito: ${bad.join(", ")}`);
  });

  it("se linter:null então há enforcedBy ou weakStandardWarning (sem std órfão de enforcement)", () => {
    const bad = mdFiles.filter(f => {
      const c = readFileSync(resolve(STD_DIR, f), "utf-8");
      if (!/^\s*linter:\s*null\s*$/m.test(c)) return false;        // só os null
      return !/^\s*(enforcedBy:|weakStandardWarning:\s*true)/m.test(c);
    });
    assert.deepEqual(bad, [], `linter:null sem veículo nem aviso: ${bad.join(", ")}`);
  });

  it("todo linter referenciado existe em machine/", () => {
    const missing = [];
    for (const f of mdFiles) {
      const c = readFileSync(resolve(STD_DIR, f), "utf-8");
      const m = c.match(/^\s*linter:\s*(machine\/[\w-]+\.js)\s*$/m);
      if (m && !existsSync(resolve(STD_DIR, m[1]))) missing.push(m[1]);
    }
    assert.deepEqual(missing, [], `linter declarado mas ausente: ${missing.join(", ")}`);
  });
});
```

> **Revisão R (I1+S1):** regex `^\s*linter:` (multiline, âncora de linha) tolera a ordem das sub-chaves; novo 5º check garante que todo `linter: null` tem `enforcedBy` ou `weakStandardWarning`. **Baseline:** os 21 `.md` atuais já têm `enforcement.linter` → o gate passa HOJE; fica RED só nos itens "linter referenciado existe" até a Fase 3 criar os `.js` (trilho TDD macro — ver S3).

- [ ] **Step 2: Rodar — confirmar falha**

Run: `node --test tests/standards/taxonomy-consistency.test.mjs`
Expected: PASS nos itens atuais OU FAIL se algum std já viola (diagnóstico). Anotar o baseline.

- [ ] **Step 3: Commit**

```bash
git add tests/standards/taxonomy-consistency.test.mjs
git commit -m "test(standards): add taxonomy/MANIFEST/machine consistency gate"
```

---

## FASE 2 — Gerar os Standards faltantes (Eixo A)

**Agente:** documentation-writer (via `devflow:standards-builder` FROM-CONCERN)

### Task 4: `std-layer-boundaries.md`

**Files:**
- Create: `assets/standards/std-layer-boundaries.md`
- Modify: `assets/standards/MANIFEST.txt`

- [ ] **Step 1: Gerar via standards-builder** — invocar `devflow:standards-builder` modo FROM-CONCERN com `concern: layer-boundaries`, fonte `architecture/{fsd,hexagonal,clean-architecture,ddd}.md`. Frontmatter deve conter:

```yaml
---
id: std-layer-boundaries
description: Imports respeitam a direção da camada; domínio não importa infra
version: 1.0.0
source: devflow-default
applyTo: ["src/**/*.{ts,tsx}"]
activation: on-demand
relatedAdrs: []
enforcement:
  linter: machine/std-layer-boundaries.js
---
```
Corpo: Princípios (regra de dependência, public API por slice, portas/adapters) + Anti-patterns (domínio→infra direto; slice→slice irmão fora do index). Conteúdo dos `linterHints` da taxonomy entry `layer-boundaries`.

- [ ] **Step 2: Adicionar ao MANIFEST**

Adicionar a linha `std-layer-boundaries.md` ao `assets/standards/MANIFEST.txt`.

- [ ] **Step 3: Validar** — `devflow:standards-builder` modo AUDIT (S1-S7) no novo std. Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add assets/standards/std-layer-boundaries.md assets/standards/MANIFEST.txt
git commit -m "feat(standards): add std-layer-boundaries (Eixo A — architecture dimension)"
```

### Task 5: `std-domain-events.md`

**Files:**
- Create: `assets/standards/std-domain-events.md`
- Modify: `assets/standards/MANIFEST.txt`

- [ ] **Step 1: Gerar via standards-builder** FROM-CONCERN `domain-events`, fonte `contracts/events.md`. Frontmatter `enforcement.linter: machine/std-domain-events.js`, `applyTo: ["src/**/*.ts"]`. Corpo: nome no passado (`<Domínio>.<Entidade><Ação>Ocorreu`), payload com `eventId`/`occurredAt`/`version`/`aggregateId`, versionamento v1/v2.

- [ ] **Step 2: Adicionar `std-domain-events.md` ao MANIFEST.**

- [ ] **Step 3: AUDIT (S1-S7). Expected: PASS.**

- [ ] **Step 4: Commit**

```bash
git add assets/standards/std-domain-events.md assets/standards/MANIFEST.txt
git commit -m "feat(standards): add std-domain-events (Eixo A — contracts dimension)"
```

### Task 6: `std-pre-commit-hygiene.md`

**Files:**
- Create: `assets/standards/std-pre-commit-hygiene.md`
- Modify: `assets/standards/MANIFEST.txt`

- [ ] **Step 1: Gerar via standards-builder** FROM-CONCERN `pre-commit-hygiene`, fonte `processes/git.md`. Frontmatter `enforcement.linter: machine/std-pre-commit-hygiene.js`, `applyTo: ["**/*"]`. Corpo: format+lint+typecheck antes do commit; hooks staged-only; `--no-verify` só emergência documentada. **Nota:** distinto de `commit-hygiene` (formato de mensagem). **Revisão R (I3):** o concern `pre-commit-hygiene` **JÁ EXISTE** na taxonomy (não criar entry duplicado na Fase 1) — esta Task só gera o `.md`+linter a partir do concern existente. Os 3 entries realmente novos da Fase 1 são `module-size`, `environment-config`, `git-workflow` (+ órfão `typescript-strict`).

- [ ] **Step 2: Adicionar `std-pre-commit-hygiene.md` ao MANIFEST.**

- [ ] **Step 3: AUDIT (S1-S7). Expected: PASS.**

- [ ] **Step 4: Commit**

```bash
git add assets/standards/std-pre-commit-hygiene.md assets/standards/MANIFEST.txt
git commit -m "feat(standards): add std-pre-commit-hygiene (Eixo A)"
```

---

## FASE 3 — Roteamento de enforcement (Eixo C + linters do Eixo A)

**Agente:** test-writer (RED) → backend-specialist (GREEN)

### Task 7: Linter `std-internationalization.js` (~40% ROI)

**Files:**
- Create: `tests/standards/std-internationalization.test.mjs`
- Create: `assets/standards/machine/std-internationalization.js`
- Modify: `assets/standards/std-internationalization.md` (frontmatter `linter: null` → `machine/std-internationalization.js`; remover `weakStandardWarning`)

- [ ] **Step 1: Escrever o teste (RED)**

```js
// tests/standards/std-internationalization.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { lintFile } from "./_helper.mjs";
const L = "std-internationalization.js";

describe("std-internationalization linter", () => {
  it("gate de path: ignora não-{tsx,jsx,ts} (exit 0)", () => {
    assert.equal(lintFile(L, "notas.txt", `if (count === 1) {}`).code, 0);
  });
  it("BAD: plural manual count === 1", () => {
    const r = lintFile(L, "Cart.tsx", `const label = count === 1 ? 'item' : 'itens';`);
    assert.equal(r.code, 1);
    assert.match(r.out, /VIOLATION/);
  });
  it("BAD: moeda concatenada com toFixed(2)", () => {
    assert.equal(lintFile(L, "Price.tsx", `const p = '$' + value.toFixed(2);`).code, 1);
  });
  it("BAD: toLocaleString() sem locale", () => {
    assert.equal(lintFile(L, "Date.tsx", `d.toLocaleDateString();`).code, 1);
  });
  it("BAD: margin-left físico (RTL)", () => {
    assert.equal(lintFile(L, "Box.tsx", `const s = { 'margin-left': '16px' };`).code, 1);
  });
  it("GOOD: ICU + Intl com locale + logical prop", () => {
    const good = `t('items', { count }); new Intl.NumberFormat(locale, { style: 'currency', currency: 'BRL' }); const s = { 'margin-inline-start': '16px' };`;
    assert.equal(lintFile(L, "Ok.tsx", good).code, 0);
  });
  it("GOOD: toFixed(2) financeiro sem símbolo (não é moeda formatada)", () => {
    assert.equal(lintFile(L, "Calc.tsx", `const ratio = (a / b).toFixed(2); const total = sum.toFixed(2);`).code, 0);
  });
  it("GOOD: count === 1 como guarda (sem ternário, não é plural)", () => {
    assert.equal(lintFile(L, "Guard.tsx", `if (page.count === 1) { goToFirst(); }`).code, 0);
  });
});
```

- [ ] **Step 2: Rodar — confirmar falha**

Run: `node --test tests/standards/std-internationalization.test.mjs`
Expected: FAIL ("Cannot find module .../std-internationalization.js").

- [ ] **Step 3: Implementar o linter (GREEN)**

```js
#!/usr/bin/env node
// assets/standards/machine/std-internationalization.js — linter default bundlado (TCB).
// Contrato SI-4: filePath em argv[2]; violação → 'VIOLATION: ...' + exit 1.
import { readFileSync } from "node:fs";
const fp = process.argv[2];
if (!fp || !/\.(tsx|jsx|ts)$/.test(fp)) process.exit(0);
let c = "";
try { c = readFileSync(fp, "utf-8"); } catch { process.exit(0); }
// Revisão R (I2): plural só no TERNÁRIO `=== 1 ?` (padrão de plural manual),
// não em qualquer `count === 1` (guarda genérica). Moeda exige SÍMBOLO concatenado
// (não `.toFixed(2)` solto, que é cálculo financeiro legítimo).
const hits = [
  ...(c.match(/===\s*1\s*\?/g) || []),
  ...(c.match(/["'](?:\$|R\$|€|£)["']\s*\+/g) || []),
  ...(c.match(/\.toLocale(?:String|DateString|TimeString)\(\s*\)/g) || []),
  ...(c.match(/['"]?margin-(?:left|right)['"]?\s*:/g) || []),
];
if (hits.length > 0) {
  console.log(`VIOLATION: ${hits.length} caso(s) de i18n (plural ternário / moeda com símbolo concatenado / Intl sem locale / margin físico) em ${fp}. Use t() + ICU, Intl.NumberFormat com locale, margin-inline-*. Ver std-internationalization › Anti-patterns.`);
  process.exit(1);
}
process.exit(0);
```

- [ ] **Step 4: Rodar — confirmar PASS**

Run: `node --test tests/standards/std-internationalization.test.mjs`
Expected: PASS (6 testes).

- [ ] **Step 5: Atualizar frontmatter do .md** — em `assets/standards/std-internationalization.md`, trocar `linter: null` por `linter: machine/std-internationalization.js` e remover a linha `weakStandardWarning: true`.

- [ ] **Step 6: Commit**

```bash
git add tests/standards/std-internationalization.test.mjs assets/standards/machine/std-internationalization.js assets/standards/std-internationalization.md
git commit -m "feat(standards): add std-internationalization linter (TDD, ~40% coverage)"
```

### Task 8: Linter `std-accessibility.js` (~30% ROI)

**Files:**
- Create: `tests/standards/std-accessibility.test.mjs`
- Create: `assets/standards/machine/std-accessibility.js`
- Modify: `assets/standards/std-accessibility.md` (frontmatter)

- [ ] **Step 1: Escrever o teste (RED)**

```js
// tests/standards/std-accessibility.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { lintFile } from "./_helper.mjs";
const L = "std-accessibility.js";

describe("std-accessibility linter", () => {
  it("gate: ignora não-{tsx,jsx} (exit 0)", () => {
    assert.equal(lintFile(L, "x.ts", `<div onClick={h}>`).code, 0);
  });
  it("BAD: <div onClick> como botão", () => {
    assert.equal(lintFile(L, "B.tsx", `<div onClick={handler}>x</div>`).code, 1);
  });
  it("BAD: tabIndex positivo", () => {
    assert.equal(lintFile(L, "T.tsx", `<input tabIndex={1} />`).code, 1);
  });
  it("BAD: <img> sem alt", () => {
    assert.equal(lintFile(L, "I.tsx", `<img src="/a.png" />`).code, 1);
  });
  it("BAD: <div onClick> multiline (atributos quebrados em linhas)", () => {
    assert.equal(lintFile(L, "M.tsx", `<div\n  className="x"\n  onClick={handler}>y</div>`).code, 1);
  });
  it("GOOD: div com role=button + tabIndex 0 + onClick (padrão a11y válido)", () => {
    assert.equal(lintFile(L, "Role.tsx", `<div role="button" tabIndex={0} onClick={h}>x</div>`).code, 0);
  });
  it("GOOD: button + tabIndex 0 + img com alt", () => {
    const good = `<button onClick={h}>x</button><input tabIndex={0} /><img src="/a.png" alt="logo" />`;
    assert.equal(lintFile(L, "Ok.tsx", good).code, 0);
  });
});
```

- [ ] **Step 2: Rodar — confirmar falha.** Run: `node --test tests/standards/std-accessibility.test.mjs` → FAIL.

- [ ] **Step 3: Implementar o linter (GREEN)**

```js
#!/usr/bin/env node
// assets/standards/machine/std-accessibility.js — linter default bundlado (TCB). SI-4.
import { readFileSync } from "node:fs";
const fp = process.argv[2];
if (!fp || !/\.(tsx|jsx)$/.test(fp)) process.exit(0);
let c = "";
try { c = readFileSync(fp, "utf-8"); } catch { process.exit(0); }
// Revisão R (I3): `[^>]` casa \n (tags multiline OK). Isenta div/span COM role=
// (padrão a11y válido: <div role="button" tabIndex={0} onClick>).
const divClick = (c.match(/<(?:div|span)\b[^>]*?\sonClick[^>]*>/g) || [])
  .filter(tag => !/\brole\s*=/.test(tag));
const hits = [
  ...divClick,
  ...(c.match(/tabIndex\s*=\s*\{?\s*["']?[1-9]/g) || []),
  ...(c.match(/<img\b(?![^>]*\salt[=\s/>])[^>]*>/g) || []),
];
if (hits.length > 0) {
  console.log(`VIOLATION: ${hits.length} caso(s) de a11y (div/span onClick sem role / tabIndex positivo / img sem alt) em ${fp}. Use <button>, tabIndex 0/-1, alt em toda <img>. Ver std-accessibility › Anti-patterns.`);
  process.exit(1);
}
process.exit(0);
```

- [ ] **Step 4: Rodar — PASS.** Run: `node --test tests/standards/std-accessibility.test.mjs` → PASS (5 testes).

- [ ] **Step 5: Atualizar frontmatter** de `std-accessibility.md`: `linter: machine/std-accessibility.js`, remover `weakStandardWarning`.

- [ ] **Step 6: Commit**

```bash
git add tests/standards/std-accessibility.test.mjs assets/standards/machine/std-accessibility.js assets/standards/std-accessibility.md
git commit -m "feat(standards): add std-accessibility linter (TDD, ~30% coverage)"
```

### Task 9: Linter `std-documentation.js` (estreito — TODO sem issue)

**Files:**
- Create: `tests/standards/std-documentation.test.mjs`
- Create: `assets/standards/machine/std-documentation.js`
- Modify: `assets/standards/std-documentation.md` (frontmatter)

- [ ] **Step 1: Escrever o teste (RED)**

```js
// tests/standards/std-documentation.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { lintFile } from "./_helper.mjs";
const L = "std-documentation.js";

describe("std-documentation linter", () => {
  it("BAD: TODO sem issue/dono", () => {
    assert.equal(lintFile(L, "a.ts", `// TODO: arrumar isso depois`).code, 1);
  });
  it("BAD: FIXME sem link", () => {
    assert.equal(lintFile(L, "a.ts", `// FIXME quebra com null`).code, 1);
  });
  it("GOOD: TODO com issue", () => {
    assert.equal(lintFile(L, "a.ts", `// TODO: #123 extrair função`).code, 0);
  });
  it("GOOD: TODO com URL", () => {
    assert.equal(lintFile(L, "a.ts", `// HACK: github.com/org/repo/issues/9 workaround`).code, 0);
  });
  it("BAD: # TODO Python sem issue", () => {
    assert.equal(lintFile(L, "m.py", `# TODO: refatorar isso`).code, 1);
  });
  it("GOOD: # TODO Python com issue", () => {
    assert.equal(lintFile(L, "m.py", `# TODO: #42 extrair helper`).code, 0);
  });
});
```

- [ ] **Step 2: Rodar — FAIL.** `node --test tests/standards/std-documentation.test.mjs`.

- [ ] **Step 3: Implementar (GREEN)**

```js
#!/usr/bin/env node
// assets/standards/machine/std-documentation.js — linter default bundlado (TCB). SI-4.
import { readFileSync } from "node:fs";
const fp = process.argv[2];
if (!fp || !/\.(ts|tsx|js|jsx|py|go)$/.test(fp)) process.exit(0);
let c = "";
try { c = readFileSync(fp, "utf-8"); } catch { process.exit(0); }
// Revisão R (I1): cobre comentário C (//, /* */) E hash (#, Python/Go-build/shell),
// coerente com applyTo {ts,tsx,js,jsx,py,go}. Marcador de issue = #123 | URL | issues/.
const hits = c.match(/(?:\/\/|#|\/?\*)\s*(?:TODO|FIXME|HACK)\b(?![^\n]*(?:#\d+|https?:\/\/|issues\/))/g) || [];
if (hits.length > 0) {
  console.log(`VIOLATION: ${hits.length} marcador(es) TODO/FIXME/HACK sem issue/dono em ${fp}. Adicione link rastreável (#123 ou URL). Ver std-documentation › Anti-patterns.`);
  process.exit(1);
}
process.exit(0);
```

- [ ] **Step 4: Rodar — PASS.** `node --test tests/standards/std-documentation.test.mjs` → 4 testes.

- [ ] **Step 5: Atualizar frontmatter** de `std-documentation.md`: `linter: machine/std-documentation.js`, remover `weakStandardWarning`.

- [ ] **Step 6: Commit**

```bash
git add tests/standards/std-documentation.test.mjs assets/standards/machine/std-documentation.js assets/standards/std-documentation.md
git commit -m "feat(standards): add std-documentation linter (TODO-sem-issue)"
```

### Task 10: Linter `std-layer-boundaries.js` (modelo de imports relativos)

> **Revisão R (B1 code-reviewer):** o "WIP FSD" (`tests/2026-05-11/.../std-feature-sliced-design.js`) é um **stub vazio** (`// TODO`) e seu teste usa modelo de **alias** (`widgets/`, `entities/`), incompatível com o modelo de **imports relativos** adotado aqui. **Não há port** — é um linter novo. Modelo escolhido: imports relativos com resolução real de path (`path.resolve`), não regex sobre a string do import (evita o FP de mesmo-slice).

**Files:**
- Create: `tests/standards/std-layer-boundaries.test.mjs`
- Create: `assets/standards/machine/std-layer-boundaries.js`

- [ ] **Step 1: Escrever o teste (RED)** — casos mínimos cobrindo domínio→infra, cross-slice interno, e os dois GOOD (public API + mesmo-slice):

```js
// tests/standards/std-layer-boundaries.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { lintFile } from "./_helper.mjs";
const L = "std-layer-boundaries.js";

describe("std-layer-boundaries linter", () => {
  it("gate: ignora fora de src/ (exit 0)", () => {
    assert.equal(lintFile(L, "x.ts", `import { db } from '../infra/db';`).code, 0);
  });
  it("BAD: domínio importa infra (import relativo p/ infra)", () => {
    // arquivo sob src/domain importando src/infra
    assert.equal(lintFile(L, "src/domain/order.ts", `import { pg } from '../infra/pg';`).code, 1);
  });
  it("BAD: import de path interno entre features (fora do index)", () => {
    assert.equal(lintFile(L, "src/features/a/ui.ts", `import x from '../b/model/internal';`).code, 1);
  });
  it("GOOD: import via public API (index) de outra feature", () => {
    assert.equal(lintFile(L, "src/features/a/ui.ts", `import { x } from '../b';`).code, 0);
  });
  it("GOOD: import de segmento irmão DENTRO do próprio slice (FP fix)", () => {
    assert.equal(lintFile(L, "src/features/a/ui/x.ts", `import { u } from '../lib/util';`).code, 0);
  });
});
```

> **Nota de design (Revisão R, B2):** o linter resolve cada import relativo contra o `fp` (`path.resolve(dirname(fp), spec)`) e checa **segmentos do path resolvido**, não a string crua do import. Assim `../lib/util` a partir de `features/a/ui/` resolve para `features/a/lib/util` (mesmo slice `a` → OK), enquanto `../b/model/internal` resolve para `features/b/...` (slice `b` ≠ `a`, com sub-path além do index → viola). Importar `'../b'` resolve para `features/b` sem sub-path → public API, OK.

- [ ] **Step 2: Rodar — FAIL.** `node --test tests/standards/std-layer-boundaries.test.mjs`.

- [ ] **Step 3: Implementar (GREEN)**

```js
#!/usr/bin/env node
// assets/standards/machine/std-layer-boundaries.js — linter default bundlado (TCB). SI-4.
// Regra conservadora, baseada em RESOLUÇÃO REAL de path (não regex sobre o import):
//   (a) arquivo em /domain importando algo que resolve para /infra;
//   (b) arquivo em features/<A> importando path INTERNO de features/<B≠A> (além do index).
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
const fp = process.argv[2];
if (!fp || !/\.(ts|tsx)$/.test(fp) || !/[\\/]src[\\/]/.test(fp.replace(/\\/g, "/"))) process.exit(0);
let c = "";
try { c = readFileSync(fp, "utf-8"); } catch { process.exit(0); }
const norm = p => p.replace(/\\/g, "/");
const self = norm(fp);
const imports = [...c.matchAll(/import\s[^;]*?from\s*['"]([^'"]+)['"]/g)]
  .map(m => m[1]).filter(s => s.startsWith("."));
const inDomain = /\/domain\//.test(self);
const mySlice = self.match(/\/features\/([^/]+)\//);
const hits = [];
for (const spec of imports) {
  const target = norm(resolve(dirname(fp), spec));
  if (inDomain && /\/infra\//.test(target)) hits.push(spec);
  if (mySlice) {
    const t = target.match(/\/features\/([^/]+)\/(.+)/); // resolve p/ outra slice + sub-path
    if (t && t[1] !== mySlice[1] && !/^index(\.\w+)?$/.test(t[2])) hits.push(spec);
  }
}
if (hits.length > 0) {
  console.log(`VIOLATION: ${hits.length} import(s) violando layer boundaries em ${fp} (${hits.join(", ")}). Domínio não importa infra; entre features use a public API (index). Ver std-layer-boundaries › Anti-patterns.`);
  process.exit(1);
}
process.exit(0);
```

- [ ] **Step 4: Rodar — PASS.** Ajustar regex até os 4 casos passarem. `node --test tests/standards/std-layer-boundaries.test.mjs`.

- [ ] **Step 5: Commit**

```bash
git add tests/standards/std-layer-boundaries.test.mjs assets/standards/machine/std-layer-boundaries.js
git commit -m "feat(standards): add std-layer-boundaries linter (port WIP FSD test)"
```

### Task 11: Linter `std-domain-events.js`

**Files:**
- Create: `tests/standards/std-domain-events.test.mjs`
- Create: `assets/standards/machine/std-domain-events.js`

- [ ] **Step 1: Escrever o teste (RED)**

```js
// tests/standards/std-domain-events.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { lintFile } from "./_helper.mjs";
const L = "std-domain-events.js";

describe("std-domain-events linter", () => {
  it("gate: ignora não-.ts (exit 0)", () => {
    assert.equal(lintFile(L, "x.txt", `publish({ type: 'OrderPlaced' })`).code, 0);
  });
  it("BAD: publish de evento sem version no payload", () => {
    const bad = `await bus.publish({ type: 'OrderPlaced', orderId });`;
    assert.equal(lintFile(L, "e.ts", bad).code, 1);
  });
  it("GOOD: publish com version", () => {
    const good = `await bus.publish({ type: 'OrderPlacedV1', version: 1, occurredAt, aggregateId });`;
    assert.equal(lintFile(L, "e.ts", good).code, 0);
  });
  it("GOOD: payload ANINHADO com version (caso normal — não pode dar FP)", () => {
    const good = `await bus.publish({ type: 'X', meta: { trace }, data: { orderId }, version: 2, occurredAt });`;
    assert.equal(lintFile(L, "e.ts", good).code, 0);
  });
  it("BAD: payload aninhado SEM version", () => {
    const bad = `await bus.publish({ type: 'X', meta: { trace }, data: { orderId } });`;
    assert.equal(lintFile(L, "e.ts", bad).code, 1);
  });
  it("BAD: publish multiline sem version", () => {
    const bad = `await bus.publish({\n  type: 'X',\n  orderId,\n});`;
    assert.equal(lintFile(L, "e.ts", bad).code, 1);
  });
});
```

- [ ] **Step 2: Rodar — FAIL.**

- [ ] **Step 3: Implementar (GREEN)** — regra conservadora: chamada `publish(`/`emit(` cujo objeto literal não contém `version`.

```js
#!/usr/bin/env node
// assets/standards/machine/std-domain-events.js — linter default bundlado (TCB). SI-4.
// Revisão R (B3): regex `\{[^}]*\}` quebrava em payload ANINHADO (o caso normal,
// ex.: publish({ type, meta:{...}, version })). Trocado por scanner que balanceia
// parênteses para capturar o argumento completo da chamada, mesmo com {} aninhados.
import { readFileSync } from "node:fs";
const fp = process.argv[2];
if (!fp || !/\.(ts|tsx)$/.test(fp)) process.exit(0);
let c = "";
try { c = readFileSync(fp, "utf-8"); } catch { process.exit(0); }
const hits = [];
const re = /\b(?:publish|emit)\s*\(/g;
let m;
while ((m = re.exec(c))) {
  let i = re.lastIndex, depth = 1, arg = "";
  for (; i < c.length && depth > 0; i++) {       // balanceia ( ) até fechar a chamada
    const ch = c[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (depth > 0) arg += ch;
  }
  // só considera publicação de EVENTO quando o 1º argumento é objeto literal
  if (/^\s*\{/.test(arg) && !/\bversion\b/.test(arg)) hits.push(arg.slice(0, 40).replace(/\s+/g, " "));
}
if (hits.length > 0) {
  console.log(`VIOLATION: ${hits.length} evento(s) publicado(s) sem campo 'version' em ${fp}. Inclua eventId, version, occurredAt, aggregateId. Ver std-domain-events › Anti-patterns.`);
  process.exit(1);
}
process.exit(0);
```

- [ ] **Step 4: Rodar — PASS.**

- [ ] **Step 5: Commit**

```bash
git add tests/standards/std-domain-events.test.mjs assets/standards/machine/std-domain-events.js
git commit -m "feat(standards): add std-domain-events linter"
```

### Task 12: Documentar `linter: null` consciente (state-management, caching, grounding)

**Files:**
- Modify: `assets/standards/std-state-management.md`, `std-caching.md`, `std-grounding.md`

- [ ] **Step 1: Anotar a razão no frontmatter** — em cada um, manter `linter: null` mas adicionar campo documentando o veículo:

```yaml
enforcement:
  linter: null
  enforcedBy: eslint        # state-management: react/no-direct-mutation-state + exhaustive-deps + AST
  # caching:    enforcedBy: code-review (convenção de chave dominio:vN:*)
  # grounding:  enforcedBy: doc-grounding-hook + tsc --noEmit / ts-prune
```
(Usar o `enforcedBy` correto por arquivo; remover `weakStandardWarning` se a razão agora é explícita, ou mantê-lo se ainda quiser o aviso de cobertura.)

- [ ] **Step 2: Commit**

```bash
git add assets/standards/std-state-management.md assets/standards/std-caching.md assets/standards/std-grounding.md
git commit -m "docs(standards): document conscious linter:null enforcement vehicle (state-management, caching, grounding)"
```

### Task 13: Rotear commit-hygiene (hook existente) + code-review (Danger/CI)

> **Revisão R (B2 architect + segurança):** `hooks/commit-msg-guard.mjs` **JÁ EXISTE** e valida Conventional Commits (exit 1, sem injeção de shell). **NÃO criar `.sh` paralelo** (dois validadores = drift). Reusar o `.mjs`.

**Files:**
- Verify/reuse: `hooks/commit-msg-guard.mjs` (existente) + `hooks/hooks.json` (confirmar wiring)
- Create: `references/danger-code-review.md` (ruleset documentado, não executável aqui)
- Modify: `assets/standards/std-commit-hygiene.md`, `std-code-review.md` (frontmatter `enforcedBy`)

- [ ] **Step 1: Verificar o hook existente** — `node hooks/commit-msg-guard.mjs <(echo "wip")` deve sair 1; confirmar que está registrado em `hooks/hooks.json` no evento commit-msg. Se já wired, nenhum código novo de hook é necessário — só apontar `std-commit-hygiene` para ele.

- [ ] **Step 2: Criar `references/danger-code-review.md`** — ruleset PR-level: diff ≤400 linhas efetivas, presença de testes, gate de secret, label `ai-generated`, sem `it.skip` sem issue. Documenta o veículo (Danger.js/CI), não roda no file-linter.

- [ ] **Step 3: Atualizar frontmatter** de `std-commit-hygiene.md` (`enforcedBy: hook:commit-msg`) e `std-code-review.md` (`enforcedBy: ci:danger`).

- [ ] **Step 4: Commit**

```bash
git add references/danger-code-review.md assets/standards/std-commit-hygiene.md assets/standards/std-code-review.md hooks/hooks.json
git commit -m "feat(standards): route commit-hygiene to existing commit-msg-guard.mjs + code-review to Danger/CI ruleset"
```

### Task 14: Rodar a suíte completa de standards

- [ ] **Step 1: Rodar todos os testes novos + consistência**

Run: `node --test tests/standards/`
Expected: PASS em todos (5 linters + consistência + helper).

- [ ] **Step 2: Rodar a suíte de regressão existente** (garantir que nada quebrou)

Run: `node --test tests/odoo-standards/ 2>&1 | tail -5` e a suíte geral do projeto se houver runner agregador.
Expected: verde.

- [ ] **Step 3: Rodar o consistency gate isolado** — deve passar agora que os 3 stds do Eixo A existem com linter.

Run: `node --test tests/standards/taxonomy-consistency.test.mjs` → PASS.

---

## FASE 4 — Sync & release

**Agente:** devops-specialist

### Task 15: Sync `.md` para o repo standalone

**Files:** (repo externo `NEXUZ-SYS/devflow-standards`)

- [ ] **Step 1: Push dos `.md` novos/alterados** para `NEXUZ-SYS/devflow-standards` em `.context/engineering/standards/` (3 novos do Eixo A + os alterados de frontmatter). **Só `.md`** — nunca `.js` (ADR-007). Isso evita reversão no `/devflow update` Step 4d.

- [ ] **Step 2: Verificar** que o `update-default-standards.sh` (dry-run/local) reconhece os novos via MANIFEST.

### Task 16: Release-sync dos `machine/*.js` (revisão humana)

- [ ] **Step 1: `diff -r`** entre `assets/standards/machine/` (plugin) e o `machine/` do standalone para os 5 linters novos; confirmar byte-match após cópia manual revisada. **Anti-RCE: nunca fetch em runtime** (ADR-007).

- [ ] **Step 2: Version bump** — o pre-commit-version-check bumpa patch ao tocar skills/; consolidar em minor no release; atualizar os 3 version files. Atualizar CHANGELOG.

- [ ] **Step 3: Commit final**

```bash
git add -A
git commit -m "chore(release): sync standards coverage gap fix (.md standalone + .js byte-match) + version bump"
```

---

## Self-Review (cobertura do spec)

- ✅ Eixo A (3 stds) → Tasks 4-6 + linters Tasks 10-11.
- ✅ Eixo B (3 concerns + órfão) → Task 2.
- ✅ Eixo C (8 stds sem linter) → linters Tasks 7-11; null consciente Task 12; hook+CI Task 13.
- ✅ Consistência taxonomy↔.md↔MANIFEST↔machine → Task 3.
- ✅ TDD RED→GREEN em todo linter; fixtures tmpdir (sem mutar dirs versionados).
- ✅ Constraints ADR-007/008 → Fase 4 (.md fetch / .js bundled-only / sync no release).
- ✅ Sem placeholders: código completo em cada linter e teste.

> **Nota de mapeamento std-commit-hygiene/code-review:** ficam com `enforcedBy` (hook/CI), não `machine/*.js` — coerente com o achado de que o "gap" é de roteamento de enforcement, não de linters não escritos.
