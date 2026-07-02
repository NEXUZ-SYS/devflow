# Integração impeccable → DevFlow — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **DevFlow workflow:** `integrate-impeccable-design-guide` · **Scale:** LARGE · **Phase:** P→R · **Autonomy:** supervised
> **Spec:** `docs/superpowers/specs/2026-07-02-integrate-impeccable-design-guide-design.md` · **ADR:** `010-external-design-toolkit-absorption`

**Goal:** Absorver o valor do impeccable (Apache-2.0) no DevFlow via estratégia Híbrida — 45 regras determinísticas como linters de Standards nativos, guidance como skill que consome knowledge, `live` via bridge — sem conflitar com hooks/waivers/trigger existentes.

**Architecture:** Regras → linters bundled no contrato de Standards (`filePath → VIOLATION → exit 1`) disparando no `post-tool-use` existente. Guidance → skill `frontend-design` (23 modos) que lê o knowledge de negócio via `@.context/...`. `live` → adaptador fino que faz bridge para `npx impeccable@<pinned>`, consent-gated. Ativação por auto-detecção de front-end, plugada no `project-init` e no `post-update-guide`.

**Tech Stack:** Node.js (ESM `.mjs`/`.js`), jsdom + css-tree + htmlparser2 (parsing estático dos linters), Markdown (skills/commands/knowledge/standards), sandbox SI-4 (`scripts/lib/run-linter.mjs`).

## Global Constraints

Copiadas verbatim do spec — **todo task herda isto**:

- **Contrato de linter:** `filePath` em `process.argv[2]`; ao violar → `console.log('VIOLATION: <msg>')` + `process.exit(1)`; sem violação → `process.exit(0)`. Sem LLM, sem rede — só parsing estático.
- **`.js` de linter é bundled-only** (anti-RCE, ADR-007). NUNCA fetchado. Os **`.md`** de standard sincronizam para `NEXUZ-SYS/devflow-standards` (`.context/engineering/standards/`) + `assets/standards/MANIFEST.txt` **no mesmo release**.
- **applyTo dos std de design:** `['**/*.{tsx,jsx,vue,svelte,html,css}']` — inerte em backend-only.
- **a11y é delegada ao `std-accessibility`**: as 4 regras de acessibilidade (`low-contrast`, `gray-on-color`, `skipped-heading`, `tiny-text`) entram no `std-accessibility` existente, NÃO no `std-visual-quality`. Não reimplementar a11y em dois lugares.
- **NUNCA editar version files** (`.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `.cursor-plugin/plugin.json`) — bump só pela pipeline `release.yml`.
- **Dependência externa (CLI impeccable):** exclusiva do modo `live`; NUNCA auto-instalar — guard por presença, propor com consentimento, no-op se ausente/offline. Node≥24 exigido **só** no bridge.
- **Atribuição:** `NOTICE` na raiz creditando `pbakaus/impeccable` (Apache-2.0) + a versão-fonte fixada (`<pinned>`).
- **Idioma:** todo conteúdo de docs/skills/standards/knowledge em **pt-BR** (termos técnicos mantidos).
- **TDD:** cada regra/comportamento nasce RED antes de GREEN; fixtures positivo/negativo 1:1.
- **Trigger da skill:** ativa só por invocação explícita (`/devflow:design`) ou delegação de `product-context` — nunca catch-all de UI.

**Versão-fonte fixada:** o port das regras e o `@<pinned>` do bridge referenciam a mesma versão do impeccable. Resolver no início (Task 0) e usar em todo o plano como `<PINNED>`.

---

## Estrutura de arquivos

**Standards (Fase 1)**
- Modificar: `assets/standards/std-accessibility.md` + `assets/standards/machine/std-accessibility.js` (+4 regras a11y; bump de versão do std)
- Criar: `assets/standards/std-design-antipatterns.md` + `assets/standards/machine/std-design-antipatterns.js` (27 regras `slop`)
- Criar: `assets/standards/std-visual-quality.md` + `assets/standards/machine/std-visual-quality.js` (14 regras `quality` não-a11y)
- Modificar: `assets/standards/MANIFEST.txt` (+2 entradas)
- Modificar: `skills/standards-builder/references/taxonomy-of-concerns.yaml` (+2 concerns `design`, category `ui`)
- Criar (fixtures): `assets/standards/machine/__tests__/design/*.{good,bad}.{html,css,tsx}` + `tests/standards/design-linters.test.mjs`

**Skill + comando (Fase 2)**
- Criar: `skills/frontend-design/SKILL.md`
- Criar: `skills/frontend-design/references/<modo>.md` (23 modos, adaptados do upstream)
- Criar: `commands/devflow-design.md`
- Criar: `skills/frontend-design/NOTICE` (atribuição da skill) + `NOTICE` (raiz)
- Criar: `tests/skills/frontend-design.test.mjs`

**Knowledge wiring (Fase 3)**
- Modificar: `agents/product-context.md` (delegação → `frontend-design`)

**Inicialização (Fase 4)**
- Criar: `scripts/design/detect-frontend.mjs` (detecção determinística)
- Criar: `skills/frontend-design/references/init.md` (modo init)
- Modificar: `skills/project-init/SKILL.md` (Step de detecção/oferta)
- Criar: `tests/design/detect-frontend.test.mjs`

**Brownfield (Fase 5)**
- Modificar: `references/post-update-guide.md` (entrada de feature detectável)
- Criar: `scripts/design/reconcile-impeccable.mjs` (`--from-impeccable`)
- Criar: `tests/design/reconcile-impeccable.test.mjs`

**Live bridge (Fase 6)**
- Criar: `scripts/design/live-bridge.mjs`
- Modificar: `hooks/pre-tool-use` (ler marcador de sessão `live`)
- Criar: `tests/design/live-bridge.test.mjs`

**Extensão + doc (Fase 7)**
- Criar: `skills/frontend-design/references/browser-extension.md`
- Finalizar: `NOTICE` (raiz)

**Mapa das 45 regras → destino** (autoritativo em `cli/engine/registry/antipatterns.mjs` do upstream):
- **std-accessibility (+4, a11y):** `low-contrast`, `gray-on-color`, `skipped-heading`, `tiny-text`.
- **std-visual-quality (14, quality não-a11y):** `broken-image`, `layout-transition`, `line-length`, `cramped-padding`, `body-text-viewport-edge`, `tight-leading`, `justified-text`, `all-caps-body`, `wide-tracking`, `text-overflow`, `clipped-overflow-container`, `design-system-font`, `design-system-color`, `design-system-radius`.
- **std-design-antipatterns (27, slop):** `side-tab`, `border-accent-on-rounded`, `overused-font`, `single-font`, `flat-type-hierarchy`, `gradient-text`, `ai-color-palette`, `cream-palette`, `nested-cards`, `monotonous-spacing`, `bounce-easing`, `dark-glow`, `icon-tile-stack`, `italic-serif-display`, `hero-eyebrow-chip`, `repeated-section-kickers`, `numbered-section-markers`, `em-dash-overuse`, `marketing-buzzword`, `aphoristic-cadence`, `oversized-h1`, `extreme-negative-tracking`, `gpt-thin-border-wide-shadow`, `repeating-stripes-gradient`, `codex-grid-background`, `theater-slop-phrase`, `image-hover-transform`.

---

## Task 0: Resolver versão-fonte fixada (`<PINNED>`)

**Agent:** backend-specialist
**Files:** none (registro no plano/NOTICE downstream)

- [ ] **Step 1: Ler a versão publicada do impeccable**

Run: `npm view impeccable version`
Anotar como `<PINNED>` (ex.: `3.2.0` do `package.json` do CLI). Este valor é usado no port das regras (fonte de verdade) e no `npx impeccable@<PINNED>` do bridge.

- [ ] **Step 2: Registrar `<PINNED>` no rascunho do NOTICE**

Guardar num arquivo de trabalho `scripts/design/.pinned-version` (gitignored) para os tasks seguintes lerem. Não commitar.

---

## Task Group A — Standards (Fase 1)

**Agent:** test-writer (fixtures) → backend-specialist (linters)
**Handoff from:** —
**Tests:** unit (sandbox SI-4) — fixtures positivo/negativo 1:1 por regra

### Task A1: Registrar os concerns `design` na taxonomy do plugin

**Files:**
- Modify: `skills/standards-builder/references/taxonomy-of-concerns.yaml`
- Test: `tests/standards/design-concerns.test.mjs`

**Interfaces:**
- Produces: concerns `design-antipatterns` e `visual-quality` (category `ui`), consumidos por A2–A4 e pelo standards-builder.

- [ ] **Step 1: Escrever teste que falha**

```js
// tests/standards/design-concerns.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

test('taxonomy tem concerns de design category ui', () => {
  const tax = parse(readFileSync('skills/standards-builder/references/taxonomy-of-concerns.yaml', 'utf8'));
  const ids = tax.concerns.map(c => c.id);
  assert.ok(ids.includes('design-antipatterns'), 'falta design-antipatterns');
  assert.ok(ids.includes('visual-quality'), 'falta visual-quality');
  const da = tax.concerns.find(c => c.id === 'design-antipatterns');
  assert.equal(da.category, 'ui');
});
```

- [ ] **Step 2: Rodar o teste e confirmar falha**

Run: `node --test tests/standards/design-concerns.test.mjs`
Expected: FAIL (concerns ausentes).

- [ ] **Step 3: Adicionar os concerns na taxonomy**

Adicionar sob `concerns:` (seguir o schema das entradas `accessibility`/`internationalization` existentes — `category: ui`):

```yaml
  - id: design-antipatterns
    category: ui
    summary: Detecção determinística de "AI tells" de design (slop) em front-end gerado por IA
    std: std-design-antipatterns
    inverseHints: [design, ui, frontend, css, tailwind]
    relatedAdrCategories: [arquitetura]
  - id: visual-quality
    category: ui
    summary: Legibilidade, tipografia e layout de qualidade (não-a11y) em front-end
    std: std-visual-quality
    inverseHints: [design, ui, typography, layout, css]
    relatedAdrCategories: [arquitetura]
```

- [ ] **Step 4: Rodar o teste e confirmar PASS**

Run: `node --test tests/standards/design-concerns.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add skills/standards-builder/references/taxonomy-of-concerns.yaml tests/standards/design-concerns.test.mjs
git commit -m "feat(standards): registra concerns design-antipatterns e visual-quality (category ui)"
```

### Task A2: Harness de teste dos linters + regra exemplar `gradient-text`

**Files:**
- Create: `assets/standards/machine/std-design-antipatterns.js`
- Create: `tests/standards/design-linters.test.mjs`
- Create: `assets/standards/machine/__tests__/design/gradient-text.bad.css`, `gradient-text.good.css`

**Interfaces:**
- Produces: `runLinter(stdId, filePath) → { violated: bool, msg: string }` (helper de teste); contrato do linter reusado por A3/A4.

- [ ] **Step 1: Escrever fixtures + teste que falha**

```css
/* __tests__/design/gradient-text.bad.css — DEVE violar */
.hero-title { background: linear-gradient(90deg,#f0f,#0ff); -webkit-background-clip: text; color: transparent; }
```
```css
/* __tests__/design/gradient-text.good.css — NÃO deve violar */
.hero-title { color: #111; }
```
```js
// tests/standards/design-linters.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

function runLinter(linter, file) {
  try { execFileSync('node', [linter, file], { encoding: 'utf8' }); return { violated: false, msg: '' }; }
  catch (e) { return { violated: true, msg: (e.stdout || '').trim() }; }
}

const LINT = 'assets/standards/machine/std-design-antipatterns.js';
const FX = 'assets/standards/machine/__tests__/design';

test('gradient-text: bad viola', () => {
  const r = runLinter(LINT, `${FX}/gradient-text.bad.css`);
  assert.ok(r.violated); assert.match(r.msg, /VIOLATION: gradient-text/);
});
test('gradient-text: good não viola', () => {
  assert.equal(runLinter(LINT, `${FX}/gradient-text.good.css`).violated, false);
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `node --test tests/standards/design-linters.test.mjs`
Expected: FAIL (linter inexistente).

- [ ] **Step 3: Implementar o linter com a regra exemplar (portada de `checks.mjs`)**

```js
// assets/standards/machine/std-design-antipatterns.js
// Regras "slop" portadas de pbakaus/impeccable@<PINNED> (Apache-2.0) — cli/engine/rules/checks.mjs
// Contrato de Standard: argv[2]=filePath; VIOLATION+exit1 ao violar; parsing estático, sem LLM/rede.
import { readFileSync } from 'node:fs';

const file = process.argv[2];
const src = readFileSync(file, 'utf8');
const violations = [];

// gradient-text — texto com gradiente é "AI tell"
if (/-webkit-background-clip:\s*text/i.test(src) && /linear-gradient/i.test(src)) {
  violations.push('gradient-text — texto com gradiente; use cor sólida (contraste ≥4.5:1)');
}

if (violations.length) { console.log('VIOLATION: ' + violations.join('\nVIOLATION: ')); process.exit(1); }
process.exit(0);
```

- [ ] **Step 4: Rodar e confirmar PASS**

Run: `node --test tests/standards/design-linters.test.mjs`
Expected: PASS (2/2).

- [ ] **Step 5: Commit**

```bash
git add assets/standards/machine/std-design-antipatterns.js tests/standards/design-linters.test.mjs assets/standards/machine/__tests__/design/gradient-text.*
git commit -m "feat(standards): linter std-design-antipatterns com regra exemplar gradient-text (TDD)"
```

### Task A3: Portar as 27 regras `slop` restantes (batch, TDD por regra)

**Files:**
- Modify: `assets/standards/machine/std-design-antipatterns.js`
- Add per rule: `__tests__/design/<rule>.{bad,good}.*` + casos em `design-linters.test.mjs`

**Interfaces:**
- Consumes: contrato do linter de A2. Produces: as 27 regras `slop` completas.

**Procedimento (repetir para cada regra do inventário `slop`, exceto `gradient-text` já feita):**

- [ ] **Step 1 (por regra): Ler a lógica-fonte**

Abrir `cli/engine/rules/checks.mjs` do impeccable@`<PINNED>` (via checkout raso ou raw GitHub) e localizar a implementação da regra (funções `checkElementBorders`/`checkElementMotion`/`checkElementGlow`/`checkPageTypography`/`checkPageLayout`/`checkHtmlPatterns`). NÃO inventar a heurística — portar a existente.

- [ ] **Step 2 (por regra): Escrever fixtures bad/good + 2 casos de teste** (espelhar A2).

- [ ] **Step 3 (por regra): Rodar → FAIL.**

- [ ] **Step 4 (por regra): Portar a checagem** para `std-design-antipatterns.js` empurrando em `violations` a mensagem no formato `<rule> — <hint curto>`. Regras `advisory` (ex.: `repeated-section-kickers`, `numbered-section-markers`, `gpt-thin-border-wide-shadow`, `repeating-stripes-gradient`, `codex-grid-background`, `theater-slop-phrase`, `image-hover-transform`) recebem prefixo `[advisory]` na mensagem.

- [ ] **Step 5 (por regra): Rodar → PASS.**

- [ ] **Step 6: Commit por lote de ~5 regras**

```bash
git add assets/standards/machine/std-design-antipatterns.js assets/standards/machine/__tests__/design/ tests/standards/design-linters.test.mjs
git commit -m "feat(standards): porta lote de regras slop (<rules>) com fixtures TDD"
```

**Inventário a portar:** `side-tab`, `border-accent-on-rounded`, `overused-font`, `single-font`, `flat-type-hierarchy`, `ai-color-palette`, `cream-palette`, `nested-cards`, `monotonous-spacing`, `bounce-easing`, `dark-glow`, `icon-tile-stack`, `italic-serif-display`, `hero-eyebrow-chip`, `repeated-section-kickers`, `numbered-section-markers`, `em-dash-overuse`, `marketing-buzzword`, `aphoristic-cadence`, `oversized-h1`, `extreme-negative-tracking`, `gpt-thin-border-wide-shadow`, `repeating-stripes-gradient`, `codex-grid-background`, `theater-slop-phrase`, `image-hover-transform`.

### Task A4: `std-visual-quality.js` — as 14 regras `quality` não-a11y

**Files:**
- Create: `assets/standards/machine/std-visual-quality.js`
- Add: fixtures + casos em `design-linters.test.mjs`

Repetir o ciclo TDD de A2/A3 (fixtures bad/good → FAIL → portar de `checks.mjs` → PASS → commit por lote) para: `broken-image`, `layout-transition`, `line-length`, `cramped-padding`, `body-text-viewport-edge`, `tight-leading`, `justified-text`, `all-caps-body`, `wide-tracking`, `text-overflow`, `clipped-overflow-container`, `design-system-font`, `design-system-color`, `design-system-radius` (as 3 `design-system-*` que são `advisory` recebem prefixo `[advisory]`).

### Task A5: Estender `std-accessibility` com as 4 regras a11y (delegação)

**Files:**
- Modify: `assets/standards/machine/std-accessibility.js` (+4 regras)
- Modify: `assets/standards/std-accessibility.md` (documentar; **bump da versão do frontmatter**)
- Add: fixtures + casos

**Interfaces:**
- Consumes: linter a11y existente. Produces: a11y consolidada (contraste/heading/tiny-text/gray-on-color num só lugar).

- [ ] **Step 1: Fixtures bad/good + testes para `low-contrast`, `gray-on-color`, `skipped-heading`, `tiny-text` (apontando para `std-accessibility.js`).**
- [ ] **Step 2: Rodar → FAIL.**
- [ ] **Step 3: Portar as 4 checagens de `checks.mjs` para `std-accessibility.js`** (adicionar às violações existentes, sem alterar as regras atuais).
- [ ] **Step 4: Bump da versão no frontmatter de `std-accessibility.md`** (semver `version:`) + documentar as novas regras na prosa. **NÃO** tocar version files do plugin.
- [ ] **Step 5: Rodar → PASS** (novas + regressão das antigas).
- [ ] **Step 6: Commit**

```bash
git add assets/standards/machine/std-accessibility.js assets/standards/std-accessibility.md assets/standards/machine/__tests__/design/ tests/standards/design-linters.test.mjs
git commit -m "feat(standards): std-accessibility absorve 4 regras a11y do impeccable (delegação; sem duplicar em visual-quality)"
```

### Task A6: Escrever os `.md` dos dois std de design + MANIFEST

**Files:**
- Create: `assets/standards/std-design-antipatterns.md`, `assets/standards/std-visual-quality.md`
- Modify: `assets/standards/MANIFEST.txt`
- Test: `tests/standards/design-std-frontmatter.test.mjs`

**Interfaces:**
- Consumes: linters A2–A4. Produces: std `.md` válidos (frontmatter + applyTo + enforcement.linter).

- [ ] **Step 1: Teste que falha** — valida frontmatter obrigatório e `enforcement.linter` apontando para o `.js` correto, e `applyTo` = globs front-end.

```js
// tests/standards/design-std-frontmatter.test.mjs
import { test } from 'node:test'; import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs'; import { parse } from 'yaml';
function fm(p){ const m = readFileSync(p,'utf8').match(/^---\n([\s\S]*?)\n---/); return parse(m[1]); }
for (const [id, linter] of [['std-design-antipatterns','machine/std-design-antipatterns.js'],['std-visual-quality','machine/std-visual-quality.js']]) {
  test(`${id} frontmatter válido`, () => {
    const f = fm(`assets/standards/${id}.md`);
    assert.equal(f.id, id);
    assert.equal(f.enforcement.linter, linter);
    assert.deepEqual(f.applyTo, ['**/*.{tsx,jsx,vue,svelte,html,css}']);
  });
}
```

- [ ] **Step 2: Rodar → FAIL.**
- [ ] **Step 3: Escrever os dois `.md`** seguindo o modelo de `std-accessibility.md` (frontmatter `id`, `description`, `version: 1.0.0`, `applyTo`, `enforcement.linter`; corpo com `## Regras`, `## Anti-patterns`, `## Linter`, `## Waivers`). Em `## Waivers` documentar o mecanismo único de waiver dos Standards. `std-visual-quality.md` referencia `std-accessibility` na seção de escopo (a11y mora lá).
- [ ] **Step 4: Adicionar as 2 entradas em `assets/standards/MANIFEST.txt`** (validar contra o regex `^std-[a-z][a-z0-9-]+\.md$`).
- [ ] **Step 5: Rodar → PASS.**
- [ ] **Step 6: Rodar audit dos std**

Run: `node scripts/lib/standard-audit.mjs assets/standards/std-design-antipatterns.md` (e o visual-quality) — S1–S7 devem PASSAR.

- [ ] **Step 7: Commit**

```bash
git add assets/standards/std-design-antipatterns.md assets/standards/std-visual-quality.md assets/standards/MANIFEST.txt tests/standards/design-std-frontmatter.test.mjs
git commit -m "feat(standards): std-design-antipatterns e std-visual-quality (.md + MANIFEST + applyTo front-end)"
```

### Task A7: Publicar os `.md` no repo standalone (sync)

**Agent:** devops-specialist

- [ ] **Step 1:** Abrir PR em `NEXUZ-SYS/devflow-standards` adicionando `std-design-antipatterns.md` e `std-visual-quality.md` em `.context/engineering/standards/` **e** atualizando o `std-accessibility.md` (nova versão). **Só `.md`, nunca `.js`.** Isso deve ir junto/antes do release do plugin para não divergir no `/devflow update` Step 4d.
- [ ] **Step 2:** Atualizar `assets/provenance/known-hashes.json` via `node scripts/lib/provenance-sync.mjs` para os novos/alterados `.md`.
- [ ] **Step 3: Commit**

```bash
git add assets/provenance/known-hashes.json
git commit -m "chore(provenance): known-hashes dos std de design + std-accessibility atualizado"
```

---

## Task Group B — Skill `frontend-design` + comando (Fase 2)

**Agent:** documentation-writer → frontend-specialist
**Handoff from:** Task Group A (os std existem)
**Tests:** doc-test do roteamento + fronteira de trigger

### Task B1: `SKILL.md` com fronteira de trigger + grounding

**Files:**
- Create: `skills/frontend-design/SKILL.md`
- Test: `tests/skills/frontend-design.test.mjs`

**Interfaces:**
- Produces: skill `frontend-design` com `description` de fronteira e sequência de grounding.

- [ ] **Step 1: Teste que falha**

```js
// tests/skills/frontend-design.test.mjs
import { test } from 'node:test'; import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs'; import { parse } from 'yaml';
function fm(p){ const m = readFileSync(p,'utf8').match(/^---\n([\s\S]*?)\n---/); return parse(m[1]); }
test('frontend-design: name + fronteira de trigger', () => {
  const f = fm('skills/frontend-design/SKILL.md');
  assert.equal(f.name, 'frontend-design');
  // fronteira: exige invocação explícita/delegação — não catch-all
  assert.match(f.description, /invocad|delega|\/devflow:design/i);
});
test('frontend-design: grounding lê o knowledge', () => {
  const body = readFileSync('skills/frontend-design/SKILL.md','utf8');
  assert.match(body, /@\.context\/product\/product-design-system\.md/);
  assert.match(body, /tone-of-voice/);
});
```

- [ ] **Step 2: Rodar → FAIL.**
- [ ] **Step 3: Escrever `SKILL.md`** — frontmatter `name: frontend-design`, `description` com fronteira explícita (atende design/critique/audit/polish **quando invocada via `/devflow:design <modo>` ou delegada por `product-context`; não intercepta prompts genéricos de UI**). Corpo: (1) sequência de setup que lê `@.context/product/product-design-system.md`, `@.context/product/product-tone-of-voice.md`, `@.context/business/business-icp.md` para grounding; (2) roteamento dos 23 modos; (3) princípios adaptados (OKLCH ≥4.5:1, 65–75ch, tracking floor, reduced-motion) com atribuição.
- [ ] **Step 4: Rodar → PASS.**
- [ ] **Step 5: Commit**

```bash
git add skills/frontend-design/SKILL.md tests/skills/frontend-design.test.mjs
git commit -m "feat(skill): frontend-design com fronteira de trigger e grounding no knowledge (TDD)"
```

### Task B2: Adaptar as 23 referências de modo

**Files:**
- Create: `skills/frontend-design/references/<modo>.md` × 23

- [ ] **Step 1 (por modo): Ler `skill/reference/<cmd>.md` do impeccable@`<PINNED>`.**
- [ ] **Step 2 (por modo): Adaptar para pt-BR + DevFlow** — trocar chamadas a `npx impeccable`/scripts próprios por: (a) para detecção → os linters de Standards; (b) para grounding → o knowledge; manter os princípios de design. `live.md` referencia o bridge (Fase 6).
- [ ] **Step 3: Doc-test** que cada arquivo dos 23 modos existe e tem `## Objetivo` + `## Passos`.
- [ ] **Step 4: Commit por lote de ~6 modos.**

### Task B3: Comando `/devflow:design`

**Files:**
- Create: `commands/devflow-design.md`
- Test: caso em `tests/skills/frontend-design.test.mjs`

- [ ] **Step 1: Teste que falha** — `commands/devflow-design.md` existe e roteia subcomando → invoca `devflow:frontend-design`; `init` e `live` reconhecidos.
- [ ] **Step 2: Rodar → FAIL.**
- [ ] **Step 3: Escrever `commands/devflow-design.md`** no padrão dos outros `commands/devflow-*.md` (tabela de roteamento: `<modo>` → skill; `init` → modo init; `live` → bridge).
- [ ] **Step 4: Rodar → PASS.**
- [ ] **Step 5: Commit**

```bash
git add commands/devflow-design.md tests/skills/frontend-design.test.mjs
git commit -m "feat(command): /devflow:design roteia os 23 modos + init + live"
```

---

## Task Group C — Knowledge wiring (Fase 3)

**Agent:** documentation-writer

### Task C1: Apontar a delegação em `product-context`

**Files:**
- Modify: `agents/product-context.md`
- Test: `tests/agents/product-context-delegation.test.mjs`

- [ ] **Step 1: Teste que falha** — o agent nomeia `frontend-design` como a "skill de design-system do projeto".

```js
import { test } from 'node:test'; import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
test('product-context delega a frontend-design', () => {
  assert.match(readFileSync('agents/product-context.md','utf8'), /frontend-design/);
});
```

- [ ] **Step 2: Rodar → FAIL.**
- [ ] **Step 3: Editar `agents/product-context.md:53`** — trocar "à skill de design-system do projeto" por delegação explícita a `devflow:frontend-design` (mantendo o princípio "design-system como princípios, não dump").
- [ ] **Step 4: Rodar → PASS.**
- [ ] **Step 5: Commit**

```bash
git add agents/product-context.md tests/agents/product-context-delegation.test.mjs
git commit -m "feat(agent): product-context delega design-system à skill frontend-design"
```

---

## Task Group D — Inicialização (Fase 4)

**Agent:** feature-developer / backend-specialist

### Task D1: `detect-frontend.mjs`

**Files:**
- Create: `scripts/design/detect-frontend.mjs`
- Test: `tests/design/detect-frontend.test.mjs`

**Interfaces:**
- Produces: `detectFrontend(projectDir) → { isFrontend: bool, signals: string[], register: 'brand'|'product'|null }`

- [ ] **Step 1: Teste que falha** — projeto com `react` no `package.json` → `isFrontend: true`; projeto só-backend → `false`.

```js
import { test } from 'node:test'; import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'; import { tmpdir } from 'node:os'; import { join } from 'node:path';
import { detectFrontend } from '../../scripts/design/detect-frontend.mjs';
test('detecta front-end por dep react', () => {
  const d = mkdtempSync(join(tmpdir(),'df-')); writeFileSync(join(d,'package.json'), JSON.stringify({dependencies:{react:'19'}}));
  assert.equal(detectFrontend(d).isFrontend, true);
});
test('backend-only não é front-end', () => {
  const d = mkdtempSync(join(tmpdir(),'db-')); writeFileSync(join(d,'package.json'), JSON.stringify({dependencies:{express:'4'}}));
  assert.equal(detectFrontend(d).isFrontend, false);
});
```

- [ ] **Step 2: Rodar → FAIL.**
- [ ] **Step 3: Implementar** — checar deps (react, vue, svelte, @sveltejs/kit, next, astro, solid-js, preact, lit, @angular/core) + presença de `**/*.{tsx,jsx,vue,svelte}`. `register` inferido (default `null`, resolvido interativamente no init).
- [ ] **Step 4: Rodar → PASS.**
- [ ] **Step 5: Commit.**

### Task D2: Modo `frontend-design init` (reference)

**Files:**
- Create: `skills/frontend-design/references/init.md`

- [ ] **Step 1:** Escrever o playbook do modo `init`: (1) roda `detect-frontend.mjs`; (2) resolve `register` (brand/product) e grava `design.register` em `.context/.devflow.yaml` (**anuncia** a escrita); (3) scaffolda/linka via `/devflow:knowledge` os docs `product-design-system`/`tone-of-voice`/`persona`/`business-icp` se faltarem; (4) semeia a seção *Tokens*; (5) configura opt-out por projeto. Reconciliação `--from-impeccable` → delega ao script da Fase 5.
- [ ] **Step 2: Doc-test** que `init.md` cita `detect-frontend`, `design.register` e `/devflow:knowledge`.
- [ ] **Step 3: Commit.**

### Task D3: Step de detecção/oferta no `project-init`

**Files:**
- Modify: `skills/project-init/SKILL.md`
- Test: `tests/design/project-init-offer.test.mjs`

- [ ] **Step 1: Teste que falha** — `project-init/SKILL.md` contém um Step que, em front-end detectado, oferece/dispara `frontend-design init` (default-on por auto-detecção).
- [ ] **Step 2: Rodar → FAIL.**
- [ ] **Step 3: Adicionar o Step** (seguir o padrão dos Steps existentes, ex. 0.5/0.6): "Se `detect-frontend` = front-end → ativar o subsistema de design (rodar `frontend-design init`), anunciando as escritas". Não-bloqueante.
- [ ] **Step 4: Rodar → PASS.**
- [ ] **Step 5: Commit.**

---

## Task Group E — Brownfield / ativação (Fase 5)

**Agent:** feature-developer

### Task E1: Entrada no `post-update-guide`

**Files:**
- Modify: `references/post-update-guide.md`
- Test: `tests/design/post-update-guide.test.mjs`

- [ ] **Step 1: Teste que falha** — o guide tem uma feature "design" com detection command (front-end && não-ativo) e activation `/devflow:design init`.
- [ ] **Step 2: Rodar → FAIL.**
- [ ] **Step 3: Adicionar a entrada** no formato das features existentes do guide (detection: `detect-frontend` + ausência de `design.register`/`product-design-system.md`; activation: `/devflow:design init`; e para `live`: requer impeccable CLI + Node≥24).
- [ ] **Step 4: Rodar → PASS.**
- [ ] **Step 5: Commit.**

### Task E2: `reconcile-impeccable.mjs` (`--from-impeccable`)

**Files:**
- Create: `scripts/design/reconcile-impeccable.mjs`
- Test: `tests/design/reconcile-impeccable.test.mjs`

**Interfaces:**
- Produces: `detectRawImpeccable(dir) → {present, hookInSettings, configPath}` e `importWaivers(configPath) → string[]` (regras a ignorar no formato de waiver dos Standards).

- [ ] **Step 1: Teste que falha** — dado um `.impeccable/config.json` de fixture com ignores, `importWaivers` retorna a lista; `detectRawImpeccable` acha `.claude/skills/impeccable`.
- [ ] **Step 2: Rodar → FAIL.**
- [ ] **Step 3: Implementar** — detecção (dir da skill, hook no `settings.json`, `.impeccable/config.json`) + importação de waivers/`impeccable-disable` para o sistema de Standards. Todas as ações destrutivas (desligar hook, editar `settings.json`) **retornam um plano; não executam sem consentimento** (o modo `init` confirma).
- [ ] **Step 4: Rodar → PASS.**
- [ ] **Step 5: Commit.**

---

## Task Group F — Live bridge (Fase 6)

**Agent:** backend-specialist

### Task F1: Marcador de sessão no `pre-tool-use`

**Files:**
- Modify: `hooks/pre-tool-use`
- Test: `tests/design/live-hook-marker.test.mjs`

**Interfaces:**
- Produces: quando existe o marcador `.context/runtime/design/live-session.json` (branch de feature + TTL), o `pre-tool-use` **permite** as edições in-place do `live` sem barrar por branch-protection.

- [ ] **Step 1: Teste que falha** — com o marcador presente e válido, uma edição que normalmente seria barrada passa; sem o marcador, comportamento inalterado (regressão do branch-protection).
- [ ] **Step 2: Rodar → FAIL.**
- [ ] **Step 3: Implementar a leitura do marcador** no `pre-tool-use` (fail-safe: marcador inválido/expirado = comportamento normal; nunca afrouxa fora de sessão `live`).
- [ ] **Step 4: Rodar → PASS** (permite em sessão live + regressão do guard normal).
- [ ] **Step 5: Commit.**

### Task F2: `live-bridge.mjs`

**Files:**
- Create: `scripts/design/live-bridge.mjs`
- Test: `tests/design/live-bridge.test.mjs`

**Interfaces:**
- Produces: `preflight() → {node24: bool, cliPresent: bool, cliVersion: string|null, branchOk: bool}` e `run()` que só chama `npx impeccable@<PINNED> live` após consentimento.

- [ ] **Step 1: Teste que falha** — `preflight` reporta Node<24 e CLI ausente corretamente; `run` **não** dispara `npx` quando falta consentimento/pré-requisito (npx mockado).
- [ ] **Step 2: Rodar → FAIL.**
- [ ] **Step 3: Implementar** — (a) checa `process.versions.node` ≥24; (b) checa `impeccable --version` vs `<PINNED>`; (c) garante feature branch; (d) se algo falta → **propõe o comando exato e pede consentimento** (não roda); (e) escreve o marcador de sessão (F1); (f) `execFile('npx', ['-y', 'impeccable@<PINNED>', 'live'])`. Ausente/offline = no-op limpo com instrução.
- [ ] **Step 4: Rodar → PASS.**
- [ ] **Step 5: Commit.**

### Task F3: Guarded refresh no `/devflow update`

**Files:**
- Modify: `commands/devflow.md` (seção `/devflow update`, adicionar Step estilo 4x)
- Test: `tests/design/update-live-guard.test.mjs`

- [ ] **Step 1: Teste que falha** — a doc do `/devflow update` tem um Step que valida o CLI do impeccable **só se presente** e nunca auto-instala.
- [ ] **Step 2: Rodar → FAIL.**
- [ ] **Step 3: Adicionar o Step** (padrão do Step 4/4c: `command -v` / checagem de presença → propõe update; ausente = no-op).
- [ ] **Step 4: Rodar → PASS.**
- [ ] **Step 5: Commit.**

---

## Task Group G — Extensão + atribuição (Fase 7)

**Agent:** documentation-writer

### Task G1: Doc da extensão Chrome

**Files:**
- Create: `skills/frontend-design/references/browser-extension.md`

- [ ] **Step 1:** Documentar instalação standalone da extensão (Chrome Web Store), deixando claro que ela roda o mesmo adapter das 45 regras como overlay e **não** é distribuída pelo DevFlow.
- [ ] **Step 2: Commit.**

### Task G2: `NOTICE` de atribuição (raiz)

**Files:**
- Create: `NOTICE`
- Test: `tests/design/notice.test.mjs`

- [ ] **Step 1: Teste que falha** — `NOTICE` existe, cita `pbakaus/impeccable`, `Apache-2.0` e a versão `<PINNED>`.
- [ ] **Step 2: Rodar → FAIL.**
- [ ] **Step 3: Escrever `NOTICE`** creditando o impeccable (Apache-2.0), a "Anthropic frontend-design skill" citada pelo upstream, listando os arquivos derivados (linters portados + corpo da skill) e a versão-fonte `<PINNED>`.
- [ ] **Step 4: Rodar → PASS.**
- [ ] **Step 5: Commit.**

### Task G3: Validação integrada (E2E em sandbox)

**Agent:** test-writer

- [ ] **Step 1:** Copiar um projeto front-end mínimo para **tmpdir** (nunca in-place em dir versionado). Rodar `/devflow:design init` simulado → confirmar `design.register` gravado + knowledge scaffoldado.
- [ ] **Step 2:** Editar um arquivo com `gradient-text` → confirmar que o `post-tool-use` emite a `VIOLATION` via `run-linter-cli.mjs`.
- [ ] **Step 3:** Rodar todos os testes: `node --test tests/` → tudo PASS.
- [ ] **Step 4: Commit** do fixture/relatório de validação (fora de qualquer dir versionado sensível).

---

## Self-Review

**1. Cobertura do spec:** D1–D5 → Task Groups A–G; §5.1 Standards→A; §5.2 skill→B; §5.3 knowledge→C; §5.4 init→D; §5.5 brownfield→E; §5.6/§5.8 live+dep-lifecycle→F; §5.7 extensão+NOTICE→G; §6 detecção→D1; §7 testes→fixtures TDD em todos os grupos. Sem lacuna.

**2. Placeholders:** os "batch" (A3/A4/B2) referenciam **fonte nomeada** (`checks.mjs`/`reference/*` do impeccable@`<PINNED>`) com procedimento TDD explícito — port, não invenção. Exemplares (A2, D1, F2) têm código completo.

**3. Consistência de tipos:** contrato de linter (`argv[2]`→`VIOLATION`/`exit 1`) idêntico em A2/A3/A4/A5; `detectFrontend`/`preflight`/`importWaivers` com assinaturas declaradas nos blocos Interfaces.

**Correção vs spec:** o concern `design` vira **default do plugin** (taxonomy source, A1), não `concerns.local.yaml` — este último é só para stds de design **customizados por projeto**. Alinhado com `std-accessibility` (concern já na taxonomy do plugin).

---

## Gate da Fase P
- [x] Spec escrito e aprovado (commit `a3af2db`)
- [x] ADR-010 registrada (gate 13/13)
- [x] Plano escrito com ordenação test-first (todo grupo começa por teste RED)
- [ ] Plano linkado ao workflow dotcontext (Step 5 do prevc-planning)
