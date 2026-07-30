# Context Layer de Conhecimento DDC — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Spec source:** `docs/superpowers/specs/2026-05-30-context-layer-knowledge-ddc-design.md` · **Branch:** `feat/context-layer-knowledge-ddc` · **Escala:** LARGE · **Fase:** P→R

**Goal:** Trazer a camada de conhecimento de 4 níveis do DDC (business/product/engineering/operations) para o `.context/` do DevFlow — com migração explícita, consolidação dos padrões de engenharia em Standards, mecanismo `knowledge` (incl. narrativa de engenharia, D10), agentes-curadores como produtores, e wiring de carregamento no PREVC — sem quebrar a compatibilidade com o dotcontext.

**Architecture:** Reorganização física de `.context/` com `engineering/` virando container dos subsistemas DevFlow-native (`adrs/standards/stacks/templates`) + 3 camadas narrativas novas (business/product/operations) + narrativa descritiva de engenharia. Um lib keystone (`context-paths.mjs`) centraliza todos os paths canônicos; os libs do v2 passam a importar dele. Um runner idempotente (`devflow-migrate.mjs`) executa a migração, sugerida pelo `/devflow update`. Carregamento reusa o motor v2 (SessionStart Stage-1 index + PreToolUse Stage-2 + PREVC Planning).

**Tech Stack:** Node ESM (`.mjs`) usando **apenas `node:*` builtins** (sem deps novas), Markdown + YAML (parseado pelo `frontmatter.mjs` existente), POSIX shell para hooks. Reusa `scripts/lib/{glob,frontmatter,path-resolver,standards-loader}.mjs` do context-layer-v2.

**Agents:** devops-specialist (libs/scripts), documentation-writer (agentes/skills), test-writer (suítes), architect (review).

---

## Convenções deste plano

- **Idioma:** prosa pt-BR; identificadores e código em inglês.
- **TDD obrigatório:** todo Task Group de código começa por teste que falha (RED), implementa o mínimo (GREEN), refatora.
- **Testes de migração rodam sobre cópia tmpdir** — NUNCA mutam `.context/` versionado in-place (incidente prévio do linter FSD).
- **Commits atômicos** por Task Group; mensagens Conventional Commits.
- **Sem placeholders:** todo step de código mostra o código real.

---

## File Structure (inventário mestre)

### CRIAR
```
scripts/lib/context-paths.mjs                        Fase 1 — paths canônicos centralizados
scripts/lib/knowledge-loader.mjs                     Fase 2 — carrega/filtra docs de conhecimento
scripts/lib/knowledge-from-type.mjs                  Fase 2 — scaffold de doc a partir da taxonomia
scripts/lib/knowledge-audit.mjs                      Fase 2 — checks K1–K5 de completude
scripts/devflow-knowledge.mjs                        Fase 2 — CLI dispatcher (new/audit)
scripts/devflow-migrate.mjs                          Fase 3 — runner de migração idempotente
skills/knowledge/SKILL.md                            Fase 2 — builder (CREATE/AUDIT)
skills/knowledge/references/taxonomy-of-knowledge.yaml  Fase 2 — tipos de doc por camada
skills/knowledge-filter/SKILL.md                     Fase 2 — injeta conhecimento no PREVC Planning
skills/migration/SKILL.md                            Fase 3 — front-end do runner de migração
agents/business-context.md                           Fase 5 — curador business/
agents/product-context.md                            Fase 5 — curador product/
agents/engineering-context.md                        Fase 5 — roteador + curador narrativa eng
agents/operations-context.md                         Fase 5 — curador operations/
.context/adrs/NNN-context-layer-knowledge-ddc-v1.0.0.md  Fase 9 — ADR

tests/validation/test-context-paths.mjs              Fase 1
tests/validation/test-knowledge-loader.mjs           Fase 2
tests/validation/test-knowledge-from-type.mjs        Fase 2
tests/validation/test-knowledge-audit.mjs            Fase 2
tests/validation/test-devflow-migrate.mjs            Fase 3
tests/scripts/test-devflow-knowledge.mjs             Fase 2 — CLI smoke
tests/hooks/test-session-start-knowledge-index.sh    Fase 8
tests/hooks/test-pre-tool-use-knowledge.sh           Fase 8
```

### MODIFICAR
```
scripts/lib/path-resolver.mjs                        Fase 4 — importar canonical de context-paths
scripts/lib/standards-loader.mjs                     Fase 4 — idem
scripts/lib/manifest-stacks.mjs                      Fase 4 — idem (se existir)
scripts/lib/run-linter.mjs                           Fase 4 — allowlist SI-4 via context-paths
skills/standards-builder/references/taxonomy-of-concerns.yaml  Fase 6 — categoria architecture
hooks/session-start                                  Fase 8 — KNOWLEDGE_INDEX Stage-1
hooks/pre-tool-use                                   Fase 8 — knowledge bodies Stage-2
skills/prevc-planning/SKILL.md                       Fase 7 — Step 1 carrega knowledge-filter
skills/prd-generation/SKILL.md                       Fase 7 — delega a business/product-context
skills/project-init/SKILL.md                         Fase 7 — scaffold 4 camadas + delega
skills/context-sync/SKILL.md                         Fase 7 — delega re-sync aos curadores
commands/devflow.md                                  Fase 3 — Step 7 drift + comando migration
```

---

## Phase 0 — Pre-flight

- [ ] **PF.1: Confirmar branch.** `git branch --show-current` deve retornar `feat/context-layer-knowledge-ddc`. Se não, `git switch feat/context-layer-knowledge-ddc`.

- [ ] **PF.2: Capturar baseline de testes.**

```bash
PASS=0; FAIL=0
for t in $(find tests -name "test-*.mjs" -o -name "*.test.mjs" -o -name "test-*.sh"); do
  case "$t" in
    *.mjs) node --test "$t" >/dev/null 2>&1 && PASS=$((PASS+1)) || FAIL=$((FAIL+1)) ;;
    *.sh)  bash "$t" >/dev/null 2>&1 && PASS=$((PASS+1)) || FAIL=$((FAIL+1)) ;;
  esac
done
echo "Baseline: PASS=$PASS FAIL=$FAIL"
```

Registrar o número. Ao final (Fase 10), `FAIL` não pode aumentar e `PASS` deve subir pelos testes novos.

- [ ] **PF.3: Confirmar libs v2 disponíveis.** `ls scripts/lib/frontmatter.mjs scripts/lib/glob.mjs scripts/lib/path-resolver.mjs scripts/lib/standards-loader.mjs` — todos devem existir (dependências deste plano).

---

## Phase 1 — Keystone: `context-paths.mjs`

**Objetivo:** uma única fonte dos paths canônicos do `.context/`. Todo o resto pergunta a ela. Sem isto, a migração exigiria editar ~15 arquivos.

**Agent:** devops-specialist · **Tests:** unit puro com fixtures tmpdir.

### Task 1: `scripts/lib/context-paths.mjs`

**Files:**
- Create: `scripts/lib/context-paths.mjs`
- Test: `tests/validation/test-context-paths.mjs`

- [ ] **Step 1: Escrever o teste que falha** em `tests/validation/test-context-paths.mjs`:

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { contextPaths, resolveReadPaths, LAYOUT_VERSION } from "../../scripts/lib/context-paths.mjs";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "ctx-paths-"));
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test("contextPaths: canonical paths sob engineering/", () => {
  const { root, cleanup } = fixture();
  const p = contextPaths(root);
  assert.equal(p.adrs, join(root, ".context", "engineering", "adrs"));
  assert.equal(p.standards, join(root, ".context", "engineering", "standards"));
  assert.equal(p.standardsMachine, join(root, ".context", "engineering", "standards", "machine"));
  assert.equal(p.stacks, join(root, ".context", "engineering", "stacks"));
  assert.equal(p.templates, join(root, ".context", "engineering", "templates"));
  assert.equal(p.business, join(root, ".context", "business"));
  assert.equal(p.product, join(root, ".context", "product"));
  assert.equal(p.operations, join(root, ".context", "operations"));
  assert.equal(p.engineering, join(root, ".context", "engineering"));
  assert.equal(p.layoutVersionFile, join(root, ".context", ".layout-version"));
  cleanup();
});

test("LAYOUT_VERSION é 2", () => {
  assert.equal(LAYOUT_VERSION, 2);
});

test("resolveReadPaths: ADR tolera legado docs/adrs e topo adrs", () => {
  const { root, cleanup } = fixture();
  mkdirSync(join(root, ".context", "docs", "adrs"), { recursive: true });
  mkdirSync(join(root, ".context", "adrs"), { recursive: true });
  mkdirSync(join(root, ".context", "engineering", "adrs"), { recursive: true });
  const reads = resolveReadPaths(root, "adrs");
  // canonical primeiro, depois fallbacks legados existentes
  assert.equal(reads[0], join(root, ".context", "engineering", "adrs"));
  assert.ok(reads.includes(join(root, ".context", "adrs")));
  assert.ok(reads.includes(join(root, ".context", "docs", "adrs")));
  cleanup();
});

test("resolveReadPaths: só canonical quando legados ausentes", () => {
  const { root, cleanup } = fixture();
  mkdirSync(join(root, ".context", "engineering", "standards"), { recursive: true });
  const reads = resolveReadPaths(root, "standards");
  assert.deepEqual(reads, [join(root, ".context", "engineering", "standards")]);
  cleanup();
});
```

- [ ] **Step 2: Rodar; verificar que falha.**

Run: `node --test tests/validation/test-context-paths.mjs`
Expected: FAIL com `Cannot find module '../../scripts/lib/context-paths.mjs'`.

- [ ] **Step 3: Implementar** `scripts/lib/context-paths.mjs`:

```javascript
// scripts/lib/context-paths.mjs
// Única fonte dos paths canônicos do .context/ (layout v2 — DDC knowledge layer).
// Todo lib/hook que precise de um path do .context/ deve perguntar aqui.
import { existsSync } from "node:fs";
import { join } from "node:path";

export const LAYOUT_VERSION = 2;

// Mapa de cada subsistema/camada para seu path canônico relativo ao projeto.
export function contextPaths(projectRoot) {
  const c = (...segs) => join(projectRoot, ".context", ...segs);
  return {
    root: c(),
    // dotcontext-managed (INTOCADOS — listados só para referência)
    docs: c("docs"),
    agents: c("agents"),
    skills: c("skills"),
    plans: c("plans"),
    // camadas de conhecimento DDC
    business: c("business"),
    product: c("product"),
    operations: c("operations"),
    engineering: c("engineering"),
    // subsistemas DevFlow-native sob engineering/
    adrs: c("engineering", "adrs"),
    standards: c("engineering", "standards"),
    standardsMachine: c("engineering", "standards", "machine"),
    stacks: c("engineering", "stacks"),
    templates: c("engineering", "templates"),
    // metadados
    layoutVersionFile: c(".layout-version"),
  };
}

// Para subsistemas relocados, lista os paths de LEITURA: canonical primeiro,
// depois fallbacks legados que existam no disco (tolerância pré-migração).
const LEGACY = {
  adrs: [["adrs"], ["docs", "adrs"]],
  standards: [["standards"]],
  stacks: [["stacks"]],
  templates: [["templates"]],
};

export function resolveReadPaths(projectRoot, key) {
  const p = contextPaths(projectRoot);
  const canonical = p[key];
  if (!canonical) throw new Error(`context-paths: unknown key '${key}'`);
  const reads = [canonical];
  for (const segs of LEGACY[key] ?? []) {
    const legacy = join(projectRoot, ".context", ...segs);
    if (legacy !== canonical && existsSync(legacy)) reads.push(legacy);
  }
  return reads;
}
```

- [ ] **Step 4: Rodar; verificar que passa.**

Run: `node --test tests/validation/test-context-paths.mjs`
Expected: 4/4 PASS.

- [ ] **Step 5: Commit.**

```bash
git add scripts/lib/context-paths.mjs tests/validation/test-context-paths.mjs
git commit -m "feat(scripts): context-paths.mjs centraliza paths canônicos do layout v2"
```

---

## Phase 2 — Mecanismo `knowledge`

**Objetivo:** builder + loader + audit para docs narrativos das 4 camadas (business/product/operations + engineering descritivo). Espelha a ergonomia do `standards-builder`.

### Task 2: `taxonomy-of-knowledge.yaml`

**Files:**
- Create: `skills/knowledge/references/taxonomy-of-knowledge.yaml`

- [ ] **Step 1: Criar a taxonomia.** Catálogo curado de tipos de doc por camada, espelhando `taxonomy-of-concerns.yaml`. Cada entry: `id`, `layer`, `summary`, `activation` default, `owner` (agente-curador), `sectionTemplate` (esqueleto de headers).

```yaml
version: 1.0.0
generated: 2026-05-30
license: project-internal

# Catálogo de tipos de doc de conhecimento narrativo por camada (DDC).
# Usado por devflow:knowledge (CREATE) para scaffold e (AUDIT) para validar layer/owner.
# Projetos estendem via .context/knowledge.local.yaml.

entries:
  # ---- business ----
  - id: business-vision
    layer: business
    summary: North-star estratégico — problema, para quem, a aposta, sucesso
    activation: always
    owner: business-context
    sectionTemplate: ["## Por que existimos", "## Para quem", "## A aposta", "## Como é o sucesso"]
  - id: business-glossary
    layer: business
    summary: Ubiquitous language — termo canônico por conceito
    activation: always
    owner: business-context
    sectionTemplate: ["## Termos canônicos", "## Sinônimos depreciados"]
  - id: business-compliance
    layer: business
    summary: Restrições regulatórias/legais que vinculam o produto
    activation: always
    owner: business-context
    sectionTemplate: ["## Regimes aplicáveis", "## Restrições vinculantes", "## Retenção e consentimento"]
  - id: business-model
    layer: business
    summary: Como o valor é criado e capturado
    activation: on-demand
    owner: business-context
    sectionTemplate: ["## Fontes de receita", "## Estrutura de custos", "## Unit economics"]
  - id: business-metrics
    layer: business
    summary: North-star metric + métricas de apoio com fórmulas e metas
    activation: on-demand
    owner: business-context
    sectionTemplate: ["## North-star", "## Métricas de apoio", "## Fórmulas e metas"]
  - id: business-icp
    layer: business
    summary: Ideal Customer Profile + personas (JTBD)
    activation: on-demand
    owner: business-context
    sectionTemplate: ["## Segmentos", "## Jobs-to-be-done", "## Dores e ganhos"]

  # ---- product ----
  - id: product-vision
    layer: product
    summary: North-star de produto — pra que serve, o que faz, o que NÃO faz
    activation: always
    owner: product-context
    sectionTemplate: ["## Visão", "## O que faz", "## O que explicitamente não faz", "## Depende de"]
  - id: product-design-system
    layer: product
    summary: Princípios de UX/visual e tokens
    activation: always
    owner: product-context
    sectionTemplate: ["## Princípios de UX", "## Tokens", "## Acessibilidade"]
  - id: product-tone-of-voice
    layer: product
    summary: Como o produto fala — vocabulário, do/don't
    activation: always
    owner: product-context
    sectionTemplate: ["## Princípios de voz", "## Do / Don't", "## Exemplos de copy"]
  - id: product-persona
    layer: product
    summary: Quem usa, contexto, JTBD, dores
    activation: always
    owner: product-context
    sectionTemplate: ["## Persona", "## Contexto de uso", "## Momento de valor"]
  - id: product-policies
    layer: product
    summary: Regras/restrições de produto (privacidade, termos resumidos)
    activation: on-demand
    owner: product-context
    sectionTemplate: ["## Política", "## O que o produto pode/não pode"]

  # ---- operations ----
  - id: operations-environments
    layer: operations
    summary: Ambientes (dev/staging/prod) — URLs, diferenças, paridade
    activation: on-demand
    owner: operations-context
    sectionTemplate: ["## Ambientes", "## Paridade", "## Configuração"]
  - id: operations-deploy
    layer: operations
    summary: Pipeline de deploy em produção
    activation: on-demand
    owner: operations-context
    sectionTemplate: ["## Fluxo de deploy", "## Gates e aprovações"]
  - id: operations-monitoring
    layer: operations
    summary: Observabilidade, dashboards, SLOs, alertas
    activation: on-demand
    owner: operations-context
    sectionTemplate: ["## Dashboards", "## SLOs", "## Alertas"]
  - id: operations-rollback
    layer: operations
    summary: Procedimento de rollback
    activation: on-demand
    owner: operations-context
    sectionTemplate: ["## Quando", "## Como", "## Saúde pós-rollback"]
  - id: operations-incident-response
    layer: operations
    summary: Como reagir a incidentes — severidades, comunicação, post-mortem
    activation: on-demand
    owner: operations-context
    sectionTemplate: ["## Severidades", "## Comunicação", "## Post-mortem"]
  - id: operations-secret-rotation
    layer: operations
    summary: Rotação de credenciais
    activation: on-demand
    owner: operations-context
    sectionTemplate: ["## Periodicidade", "## Automação", "## Validação"]
  - id: operations-backups
    layer: operations
    summary: Estratégia de backup, RTO/RPO
    activation: on-demand
    owner: operations-context
    sectionTemplate: ["## Periodicidade", "## Retenção", "## Teste de restore"]

  # ---- engineering (narrativa descritiva — D10) ----
  - id: engineering-architecture-overview
    layer: engineering
    summary: Como o sistema se organiza (descritivo) — aponta via @ para Standards que enforçam
    activation: on-demand
    owner: engineering-context
    sectionTemplate: ["## Visão geral da arquitetura", "## Bounded contexts / módulos", "## Fluxos de dados", "## Standards que enforçam"]
  - id: engineering-methodology
    layer: engineering
    summary: Quais disciplinas o projeto adota e onde (aponta p/ superpowers)
    activation: on-demand
    owner: engineering-context
    sectionTemplate: ["## Disciplinas adotadas", "## Onde se aplicam / exceções", "## Skills de apoio"]
```

- [ ] **Step 2: Commit.**

```bash
git add skills/knowledge/references/taxonomy-of-knowledge.yaml
git commit -m "feat(knowledge): taxonomy-of-knowledge.yaml (tipos de doc das 4 camadas)"
```

### Task 3: `knowledge-from-type.mjs` (scaffold)

**Files:**
- Create: `scripts/lib/knowledge-from-type.mjs`
- Test: `tests/validation/test-knowledge-from-type.mjs`

- [ ] **Step 1: Teste que falha.**

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { scaffoldKnowledge } from "../../scripts/lib/knowledge-from-type.mjs";

const TYPE = {
  id: "business-vision", layer: "business", summary: "North-star",
  activation: "always", owner: "business-context",
  sectionTemplate: ["## Por que existimos", "## Para quem"],
};

test("scaffoldKnowledge: gera frontmatter + headers", () => {
  const md = scaffoldKnowledge(TYPE, { name: "vision", version: "1.0.0" });
  assert.match(md, /type: knowledge/);
  assert.match(md, /layer: business/);
  assert.match(md, /name: vision/);
  assert.match(md, /activation: always/);
  assert.match(md, /owner: business-context/);
  assert.match(md, /## Por que existimos/);
  assert.match(md, /## Para quem/);
});

test("scaffoldKnowledge: marca placeholder em cada seção", () => {
  const md = scaffoldKnowledge(TYPE, { name: "vision", version: "1.0.0" });
  // cada seção tem um marcador TODO que o audit (K2) detecta até ser preenchido
  assert.ok((md.match(/<!-- TODO: preencher -->/g) || []).length >= 2);
});
```

- [ ] **Step 2: Rodar; falhar.** `node --test tests/validation/test-knowledge-from-type.mjs` → FAIL (módulo ausente).

- [ ] **Step 3: Implementar** `scripts/lib/knowledge-from-type.mjs`:

```javascript
// scripts/lib/knowledge-from-type.mjs
// Scaffold de um doc de conhecimento a partir de uma entry da taxonomy-of-knowledge.

export function scaffoldKnowledge(type, { name, version = "1.0.0", description } = {}) {
  const desc = description ?? type.summary;
  const front = [
    "---",
    "type: knowledge",
    `layer: ${type.layer}`,
    `name: ${name}`,
    `description: ${desc}`,
    `activation: ${type.activation}`,
    `owner: ${type.owner}`,
    `version: ${version}`,
    "---",
    "",
  ].join("\n");
  const body = (type.sectionTemplate ?? ["## Conteúdo"])
    .map((h) => `${h}\n\n<!-- TODO: preencher -->\n`)
    .join("\n");
  return `${front}\n${body}`;
}
```

- [ ] **Step 4: Rodar; passar.** Expected: 2/2 PASS.

- [ ] **Step 5: Commit.**

```bash
git add scripts/lib/knowledge-from-type.mjs tests/validation/test-knowledge-from-type.mjs
git commit -m "feat(knowledge): knowledge-from-type.mjs scaffold a partir da taxonomia"
```

### Task 4: `knowledge-audit.mjs` (checks K1–K5)

**Files:**
- Create: `scripts/lib/knowledge-audit.mjs`
- Test: `tests/validation/test-knowledge-audit.mjs`

- [ ] **Step 1: Teste que falha.**

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { auditKnowledge } from "../../scripts/lib/knowledge-audit.mjs";

const VALID = `---
type: knowledge
layer: business
name: vision
description: North-star
activation: always
owner: business-context
version: 1.0.0
---
## Por que existimos
Somos X para Y.
`;

test("auditKnowledge: doc completo passa K1-K5", () => {
  const r = auditKnowledge(VALID);
  assert.equal(r.ok, true);
  assert.equal(r.failures.length, 0);
});

test("auditKnowledge: K1 frontmatter incompleto falha", () => {
  const src = "---\ntype: knowledge\nlayer: business\n---\ncorpo\n";
  const r = auditKnowledge(src);
  assert.equal(r.ok, false);
  assert.ok(r.failures.some((f) => f.startsWith("K1")));
});

test("auditKnowledge: K2 placeholder TODO falha", () => {
  const src = VALID.replace("Somos X para Y.", "<!-- TODO: preencher -->");
  const r = auditKnowledge(src);
  assert.ok(r.failures.some((f) => f.startsWith("K2")));
});

test("auditKnowledge: K3 activation inválida falha", () => {
  const src = VALID.replace("activation: always", "activation: sometimes");
  const r = auditKnowledge(src);
  assert.ok(r.failures.some((f) => f.startsWith("K3")));
});

test("auditKnowledge: K4 layer inválida falha", () => {
  const src = VALID.replace("layer: business", "layer: marketing");
  const r = auditKnowledge(src);
  assert.ok(r.failures.some((f) => f.startsWith("K4")));
});
```

- [ ] **Step 2: Rodar; falhar.** FAIL (módulo ausente).

- [ ] **Step 3: Implementar** `scripts/lib/knowledge-audit.mjs` (usa o `frontmatter.mjs` existente):

```javascript
// scripts/lib/knowledge-audit.mjs
// Audit determinístico de completude de um doc de conhecimento (K1–K5).
import { parseFrontmatter } from "./frontmatter.mjs";

const REQUIRED = ["type", "layer", "name", "description", "activation", "owner", "version"];
const LAYERS = ["business", "product", "operations", "engineering"];
const ACTIVATIONS = ["always", "on-demand"];

export function auditKnowledge(src, { knownRefs } = {}) {
  const failures = [];
  let data = {}, body = "";
  try {
    ({ data, body } = parseFrontmatter(src));
  } catch (e) {
    return { ok: false, failures: [`K1: frontmatter inválido — ${e.message}`] };
  }

  // K1 — frontmatter completo
  for (const k of REQUIRED) {
    if (data[k] === undefined || data[k] === "") failures.push(`K1: campo obrigatório ausente: ${k}`);
  }
  // K2 — sem placeholder de scaffold
  if (/<!--\s*TODO/i.test(body)) failures.push("K2: placeholder TODO de scaffold ainda presente");
  // K3 — activation válida
  if (data.activation && !ACTIVATIONS.includes(data.activation))
    failures.push(`K3: activation inválida: ${data.activation} (esperado: ${ACTIVATIONS.join("|")})`);
  // K4 — layer válida
  if (data.layer && !LAYERS.includes(data.layer))
    failures.push(`K4: layer inválida: ${data.layer} (esperado: ${LAYERS.join("|")})`);
  // K5 — referências @ apontam para arquivos reais (quando knownRefs fornecido)
  if (knownRefs) {
    const refs = [...body.matchAll(/@\.context\/[^\s)]+/g)].map((m) => m[0].slice(1));
    for (const ref of refs) {
      if (!knownRefs.has(ref)) failures.push(`K5: referência @ inexistente: ${ref}`);
    }
  }
  return { ok: failures.length === 0, failures };
}
```

- [ ] **Step 4: Rodar; passar.** Expected: 5/5 PASS.

- [ ] **Step 5: Commit.**

```bash
git add scripts/lib/knowledge-audit.mjs tests/validation/test-knowledge-audit.mjs
git commit -m "feat(knowledge): knowledge-audit.mjs checks K1-K5 de completude"
```

### Task 5: `knowledge-loader.mjs`

**Files:**
- Create: `scripts/lib/knowledge-loader.mjs`
- Test: `tests/validation/test-knowledge-loader.mjs`

- [ ] **Step 1: Teste que falha.**

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadKnowledgeIndex, loadAlwaysActive } from "../../scripts/lib/knowledge-loader.mjs";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "know-loader-"));
  mkdirSync(join(root, ".context", "business"), { recursive: true });
  mkdirSync(join(root, ".context", "engineering"), { recursive: true });
  const doc = (layer, name, activation) =>
    `---\ntype: knowledge\nlayer: ${layer}\nname: ${name}\ndescription: ${name} desc\nactivation: ${activation}\nowner: x\nversion: 1.0.0\n---\ncorpo de ${name}\n`;
  writeFileSync(join(root, ".context", "business", "vision.md"), doc("business", "vision", "always"));
  writeFileSync(join(root, ".context", "engineering", "architecture-overview.md"), doc("engineering", "architecture-overview", "on-demand"));
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test("loadKnowledgeIndex: 1 entry por doc com metadados", () => {
  const { root, cleanup } = fixture();
  const idx = loadKnowledgeIndex(root);
  const byName = Object.fromEntries(idx.map((e) => [e.name, e]));
  assert.equal(byName["vision"].layer, "business");
  assert.equal(byName["vision"].activation, "always");
  assert.equal(byName["architecture-overview"].activation, "on-demand");
  cleanup();
});

test("loadAlwaysActive: só docs activation:always com corpo", () => {
  const { root, cleanup } = fixture();
  const active = loadAlwaysActive(root);
  assert.equal(active.length, 1);
  assert.equal(active[0].name, "vision");
  assert.match(active[0].body, /corpo de vision/);
  cleanup();
});
```

- [ ] **Step 2: Rodar; falhar.**

- [ ] **Step 3: Implementar** `scripts/lib/knowledge-loader.mjs` (varre as camadas via `context-paths`):

```javascript
// scripts/lib/knowledge-loader.mjs
// Carrega o índice de docs de conhecimento (Stage-1) e os corpos sempre-ativos.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { parseFrontmatter } from "./frontmatter.mjs";
import { contextPaths } from "./context-paths.mjs";

const LAYER_DIRS = ["business", "product", "operations", "engineering"];

function* walkMd(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      // não descer em subsistemas mecanizados de engineering (adrs/standards/stacks/templates)
      if (["adrs", "standards", "stacks", "templates", "machine"].includes(entry)) continue;
      yield* walkMd(full);
    } else if (entry.endsWith(".md") && entry !== "README.md") {
      yield full;
    }
  }
}

export function loadKnowledgeIndex(projectRoot) {
  const p = contextPaths(projectRoot);
  const index = [];
  for (const layer of LAYER_DIRS) {
    for (const file of walkMd(p[layer])) {
      try {
        const { data } = parseFrontmatter(readFileSync(file, "utf-8"));
        if (data.type !== "knowledge") continue;
        index.push({
          file,
          layer: data.layer ?? layer,
          name: data.name,
          description: data.description ?? "",
          activation: data.activation ?? "on-demand",
          owner: data.owner ?? "",
        });
      } catch { /* doc malformado é ignorado no índice */ }
    }
  }
  return index;
}

export function loadAlwaysActive(projectRoot) {
  const out = [];
  for (const entry of loadKnowledgeIndex(projectRoot)) {
    if (entry.activation !== "always") continue;
    const { body } = parseFrontmatter(readFileSync(entry.file, "utf-8"));
    out.push({ ...entry, body });
  }
  return out;
}
```

- [ ] **Step 4: Rodar; passar.** Expected: 2/2 PASS.

- [ ] **Step 5: Commit.**

```bash
git add scripts/lib/knowledge-loader.mjs tests/validation/test-knowledge-loader.mjs
git commit -m "feat(knowledge): knowledge-loader.mjs índice Stage-1 + corpos sempre-ativos"
```

### Task 6: `devflow-knowledge.mjs` CLI + smoke

**Files:**
- Create: `scripts/devflow-knowledge.mjs`
- Test: `tests/scripts/test-devflow-knowledge.mjs`

- [ ] **Step 1: Teste smoke que falha.**

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

const SCRIPT = join(process.cwd(), "scripts", "devflow-knowledge.mjs");

test("devflow-knowledge new: cria doc scaffold a partir do tipo", () => {
  const root = mkdtempSync(join(tmpdir(), "dk-new-"));
  execFileSync("node", [SCRIPT, "new", "--type=business-vision", "--name=vision", `--project=${root}`], { stdio: "pipe" });
  const out = join(root, ".context", "business", "vision.md");
  assert.ok(existsSync(out));
  assert.match(readFileSync(out, "utf-8"), /type: knowledge/);
  rmSync(root, { recursive: true, force: true });
});

test("devflow-knowledge audit: reporta K2 placeholder", () => {
  const root = mkdtempSync(join(tmpdir(), "dk-audit-"));
  execFileSync("node", [SCRIPT, "new", "--type=business-vision", "--name=vision", `--project=${root}`], { stdio: "pipe" });
  const out = execFileSync("node", [SCRIPT, "audit", "--name=vision", `--project=${root}`], { encoding: "utf-8", stdio: "pipe" });
  assert.match(out, /K2/); // recém-scaffoldado ainda tem TODO
  rmSync(root, { recursive: true, force: true });
});
```

- [ ] **Step 2: Rodar; falhar.**

- [ ] **Step 3: Implementar** `scripts/devflow-knowledge.mjs` — dispatcher `new`/`audit`. Lê a taxonomia, resolve `--type`, usa `scaffoldKnowledge` para escrever em `.context/<layer>/<name>.md`; `audit` lê o doc e roda `auditKnowledge`. Parsing de args via `process.argv` (sem deps). Escrita cria o dir da camada se ausente. Carrega a taxonomia com o `frontmatter`/parser YAML existente OU `JSON.parse` de um pré-processamento — usar leitura de linha simples do YAML da taxonomia (reutilizar o helper de `taxonomy-loader.mjs` do standards se compatível; senão um parser local mínimo que extrai as entries por `id`).

- [ ] **Step 4: Rodar; passar.**

- [ ] **Step 5: Commit.** `feat(knowledge): devflow-knowledge.mjs CLI new/audit`.

### Task 7: `skills/knowledge/SKILL.md` + `skills/knowledge-filter/SKILL.md`

**Files:**
- Create: `skills/knowledge/SKILL.md`
- Create: `skills/knowledge-filter/SKILL.md`

- [ ] **Step 1: Escrever `skills/knowledge/SKILL.md`** — espelha `standards-builder`: frontmatter (`name: knowledge`, description com trigger phrases pt-BR "crie conhecimento", "documentar visão/persona/arquitetura"), modos CREATE (resolve tipo na taxonomia → `devflow-knowledge new` → polish do conteúdo pelo curador apropriado) e AUDIT (`devflow-knowledge audit`). Hard rules: não inventar fatos (curador decide), single source of truth (`@`), pt-BR.

- [ ] **Step 2: Escrever `skills/knowledge-filter/SKILL.md`** — espelha `adr-filter`: recebe a task, lê o índice (`loadKnowledgeIndex`), seleciona sempre-ativas + relevantes por camada/keyword, emite bloco `<KNOWLEDGE filtered="true">` com os corpos. Fallback: se loader indisponível, carrega só as `activation: always`.

- [ ] **Step 3: Validar estrutura** — `grep -q "name: knowledge" skills/knowledge/SKILL.md` e `grep -q "name: knowledge-filter" skills/knowledge-filter/SKILL.md`.

- [ ] **Step 4: Commit.** `feat(knowledge): skills knowledge (builder) + knowledge-filter (loader PREVC)`.

---

## Phase 3 — Migração explícita

### Task 8: `devflow-migrate.mjs` (TDD sobre tmpdir)

**Files:**
- Create: `scripts/devflow-migrate.mjs`
- Test: `tests/validation/test-devflow-migrate.mjs`

**Agent:** devops-specialist · **Tests:** integração sobre cópia tmpdir (NUNCA in-place).

- [ ] **Step 1: Teste que falha.**

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

const SCRIPT = join(process.cwd(), "scripts", "devflow-migrate.mjs");

// Monta um .context/ no layout v1 (subsistemas no topo)
function v1Project() {
  const root = mkdtempSync(join(tmpdir(), "migrate-"));
  mkdirSync(join(root, ".context", "adrs"), { recursive: true });
  mkdirSync(join(root, ".context", "standards", "machine"), { recursive: true });
  mkdirSync(join(root, ".context", "stacks"), { recursive: true });
  mkdirSync(join(root, ".context", "templates"), { recursive: true });
  mkdirSync(join(root, ".context", "docs"), { recursive: true });
  writeFileSync(join(root, ".context", "adrs", "001-x-v1.0.0.md"), "---\ntype: adr\n---\n# x\n");
  writeFileSync(join(root, ".context", "standards", "std-y.md"), "---\nid: std-y\n---\n# y\n");
  writeFileSync(join(root, ".context", "docs", "project-overview.md"), "---\ntype: doc\n---\n# overview\n");
  // git init para o git mv funcionar
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["add", "-A"], { cwd: root });
  execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "init"], { cwd: root });
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test("migrate: move subsistemas para engineering/ e cria camadas", () => {
  const { root, cleanup } = v1Project();
  execFileSync("node", [SCRIPT, `--project=${root}`, "--yes"], { stdio: "pipe" });
  assert.ok(existsSync(join(root, ".context", "engineering", "adrs", "001-x-v1.0.0.md")));
  assert.ok(existsSync(join(root, ".context", "engineering", "standards", "std-y.md")));
  assert.ok(existsSync(join(root, ".context", "engineering", "stacks")));
  assert.ok(existsSync(join(root, ".context", "engineering", "templates")));
  assert.ok(existsSync(join(root, ".context", "business")));
  assert.ok(existsSync(join(root, ".context", "product")));
  assert.ok(existsSync(join(root, ".context", "operations")));
  // docs intocado
  assert.ok(existsSync(join(root, ".context", "docs", "project-overview.md")));
  // selo de versão
  assert.equal(readFileSync(join(root, ".context", ".layout-version"), "utf-8").trim(), "2");
  cleanup();
});

test("migrate: idempotente (2ª execução é no-op sem erro)", () => {
  const { root, cleanup } = v1Project();
  execFileSync("node", [SCRIPT, `--project=${root}`, "--yes"], { stdio: "pipe" });
  // 2ª vez não lança
  execFileSync("node", [SCRIPT, `--project=${root}`, "--yes"], { stdio: "pipe" });
  assert.ok(existsSync(join(root, ".context", "engineering", "adrs", "001-x-v1.0.0.md")));
  cleanup();
});
```

- [ ] **Step 2: Rodar; falhar.**

- [ ] **Step 3: Implementar** `scripts/devflow-migrate.mjs`:
  - Parse `--project`, `--yes`.
  - Lê `.layout-version`; se já `2`, imprime "já migrado" e sai 0 (idempotência).
  - Para cada subsistema (`adrs/standards/stacks/templates`): se existe no topo e o canonical (`engineering/<sub>`) não existe, `mkdirSync(engineering)` + `execFileSync("git", ["mv", origem, destino])` (fallback `renameSync` se não for repo git).
  - `mkdirSync` das camadas `business/product/operations` + (engineering já existe).
  - Escreve `.layout-version` = `2`.
  - Imprime relatório do que moveu.
  - Usa `contextPaths`/`resolveReadPaths` para origem/destino — não hardcoda.

- [ ] **Step 4: Rodar; passar.** Expected: 2/2 PASS.

- [ ] **Step 5: Commit.** `feat(migrate): devflow-migrate.mjs runner idempotente de layout v1→v2`.

### Task 9: `skills/migration/SKILL.md` + `/devflow update` Step 7

**Files:**
- Create: `skills/migration/SKILL.md`
- Modify: `commands/devflow.md`

- [ ] **Step 1: Escrever `skills/migration/SKILL.md`** — front-end do runner: detecta `.layout-version`, mostra preview do que vai mover, pede confirmação (a menos de `--yes`), chama `devflow-migrate.mjs`, reporta. Idioma do projeto.

- [ ] **Step 2: Modificar `commands/devflow.md`** — adicionar roteamento de `update migration` / `migration` para a skill, e o **Step 7 — drift estrutural** na seção `/devflow update`: ler `.context/.layout-version`; se `< 2` (ou ausente com `.context/` presente), incluir na seção "Next Steps":

```
▸ Migração de layout de contexto (v1 → v2) — 4 camadas de conhecimento DDC
  Para ativar:  /devflow update migration
```

- [ ] **Step 3: Validar** — `grep -q "update migration" commands/devflow.md` e `grep -q "name: migration" skills/migration/SKILL.md`.

- [ ] **Step 4: Commit.** `feat(migration): skill migration + /devflow update detecta drift e sugere`.

---

## Phase 4 — Refactor dos libs v2 para usar `context-paths`

**Objetivo:** os libs existentes passam a ler/escrever no canonical via `context-paths`, com tolerância legada. Sem regressão.

### Task 10: Migrar `path-resolver`, `standards-loader`, `run-linter`, `manifest-stacks`

**Files:**
- Modify: `scripts/lib/path-resolver.mjs`
- Modify: `scripts/lib/standards-loader.mjs`
- Modify: `scripts/lib/run-linter.mjs` (se existir)
- Modify: `scripts/lib/manifest-stacks.mjs` (se existir)

- [ ] **Step 1: Rodar a suíte existente desses libs e registrar verde.**

```bash
node --test tests/validation/test-adr-path-resolver.mjs tests/validation/test-standards-loader.mjs 2>&1 | tail -5
```

- [ ] **Step 2: Adicionar teste de "lê do canonical engineering/".** Em `tests/validation/test-standards-loader.mjs`, novo caso: fixture com std em `.context/engineering/standards/` → loader encontra. (RED se o loader ainda só olha `.context/standards`.)

- [ ] **Step 3: Modificar `path-resolver.mjs`** — `resolveAdrPath` passa a usar `resolveReadPaths(root, "adrs")` para `readPaths` e `contextPaths(root).adrs` para `write`. Mantém a forma de retorno `{ write, readPaths, isLegacy }` (compat com chamadores existentes); `isLegacy` = canonical ausente E algum legado presente.

- [ ] **Step 4: Modificar `standards-loader.mjs`** — diretório base via `resolveReadPaths(root, "standards")` (canonical + legado). Escolhe o primeiro existente.

- [ ] **Step 5: Modificar `run-linter.mjs` (SI-4)** — allowlist passa a confinar em `contextPaths(root).standardsMachine` (= `engineering/standards/machine/`), mantendo todas as 5 verificações SI-4.

- [ ] **Step 6: Modificar `manifest-stacks.mjs`** — path do manifest via `contextPaths(root).stacks`.

- [ ] **Step 7: Rodar TODAS as suítes desses libs + as novas.** Expected: tudo PASS, incluindo o caso engineering/ novo.

```bash
node --test tests/validation/test-adr-path-resolver.mjs tests/validation/test-standards-loader.mjs tests/validation/test-adr-index-dual-read.mjs 2>&1 | tail -5
```

- [ ] **Step 8: Commit.** `refactor(lib): path-resolver/standards-loader/run-linter usam context-paths (canonical engineering/)`.

---

## Phase 5 — Agentes-curadores (porte do DDC)

**Objetivo:** 4 playbooks novos em `agents/`, portados de `framework_ddc/.claude/agents/ddc-*`, genericizados: sem bloco file-based agent-memory; memória via MemPalace + napkin; paths `.context/<layer>/`.

**Agent:** documentation-writer · **Tests:** estrutural/smoke.

### Task 11: `business-context` e `product-context`

**Files:**
- Create: `agents/business-context.md`
- Create: `agents/product-context.md`

- [ ] **Step 1: Portar `ddc-business-context.md` → `agents/business-context.md`.** Manter: doutrina (single source of truth, ubiquitous language, cadeia vision→icp→business-model→metrics→compliance), grounding, autoria AI-friendly, checklist de auto-auditoria. **Remover:** toda a seção "Persistent Agent Memory" file-based. **Adicionar:** seção "Memória" curta apontando para MemPalace (`memory-specialist` / `/devflow:devflow-memory`) + `napkin.md`. Trocar `.contexts/` → `.context/`. Frontmatter no padrão dos agents DevFlow (checar um existente, ex. `agents/product-manager.md`, para o shape de frontmatter).

- [ ] **Step 2: Portar `ddc-product-context.md` → `agents/product-context.md`** com os mesmos ajustes; ancorado em `@.context/business/*`.

- [ ] **Step 3: Validar shape.** Comparar frontmatter com `agents/product-manager.md` (mesmas chaves). `grep -L "Persistent Agent Memory" agents/business-context.md agents/product-context.md` deve listar ambos (i.e., a seção NÃO está presente).

- [ ] **Step 4: Commit.** `feat(agents): business-context + product-context (porte DDC, memória via MemPalace)`.

### Task 12: `engineering-context` (roteador) e `operations-context`

**Files:**
- Create: `agents/engineering-context.md`
- Create: `agents/operations-context.md`

- [ ] **Step 1: Portar `ddc-engineering.md` → `agents/engineering-context.md`** como **roteador**, com a árvore de decisão das 4 naturezas (spec §6.1):
  - decisão → `devflow:adr-builder`
  - regra/contract/architecture/practice lintável → `devflow:standards`
  - tecnologia versionada → `devflow:scrape-stack-batch`
  - disciplina execução → superpowers (ponteiro)
  - narrativa descritiva → `devflow:knowledge` → `engineering/` (cura direta)
  
  Substituir o "Mapeamento tipo→caminho" do DDC (7 dirs) por este mapa tipo→mecanismo. Remover agent-memory file-based; memória via MemPalace.

- [ ] **Step 2: Criar `agents/operations-context.md`** (não há equivalente DDC pronto — derivar do padrão business/product-context): cura `operations/`, runbooks de produção, coerência com `engineering/processes` Standards.

- [ ] **Step 3: Validar shape** (frontmatter consistente) e que `engineering-context.md` cita os 4 mecanismos.

- [ ] **Step 4: Commit.** `feat(agents): engineering-context (roteador) + operations-context`.

---

## Phase 6 — Expansão da taxonomia de concerns (Standards)

### Task 13: categoria `architecture` + concerns faltantes

**Files:**
- Modify: `skills/standards-builder/references/taxonomy-of-concerns.yaml`

- [ ] **Step 1: Teste que falha** (estende a suíte do standards, se houver `test-taxonomy*`; senão criar `tests/validation/test-taxonomy-architecture.mjs`):

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
test("taxonomy-of-concerns inclui category architecture", () => {
  const y = readFileSync("skills/standards-builder/references/taxonomy-of-concerns.yaml", "utf-8");
  assert.match(y, /category: architecture/);
  assert.match(y, /id: layer-boundaries/);
});
```

- [ ] **Step 2: Rodar; falhar.**

- [ ] **Step 3: Adicionar entries** à taxonomia: `layer-boundaries` (`category: architecture`, applyTo `["src/**/*.ts"]`, inverseHints fsd/hexagonal/clean, linterHints sobre import boundaries) e os concerns de contracts/process faltantes mencionados no spec (`api-conventions`, `domain-events`, `secret-conventions`, `commit-hygiene`) — cada um no shape existente (id/summary/category/defaultApplyTo/inverseHints/principleTemplate/antiPatternTemplate/linterHints).

- [ ] **Step 4: Rodar; passar.**

- [ ] **Step 5: Commit.** `feat(standards): taxonomia ganha category architecture + concerns de contracts/process`.

---

## Phase 7 — Orquestradores (delegam aos curadores)

### Task 14: `prevc-planning` Step 1 carrega knowledge

**Files:**
- Modify: `skills/prevc-planning/SKILL.md`

- [ ] **Step 1: Editar Step 1 (Gather Context)** — após o bloco de ADR guardrails, adicionar sub-bloco "Knowledge layer loading": invocar `devflow:knowledge-filter` com a task; injetar sempre-ativas + relevantes como contexto do brainstorming. Espelhar a redação do bloco `adr-filter` existente (linhas ~47-69). Anunciar "Loaded N knowledge docs (M always-active + K task-relevant)".

- [ ] **Step 2: Validar** — `grep -q "knowledge-filter" skills/prevc-planning/SKILL.md`.

- [ ] **Step 3: Commit.** `feat(prevc): planning Step 1 injeta camada de conhecimento via knowledge-filter`.

### Task 15: `prd-generation`, `project-init`, `context-sync` delegam

**Files:**
- Modify: `skills/prd-generation/SKILL.md`
- Modify: `skills/project-init/SKILL.md`
- Modify: `skills/context-sync/SKILL.md`

- [ ] **Step 1: `prd-generation`** — adicionar passo: após a entrevista de PRD, **delegar** a `business-context` (vision/metrics/icp) e `product-context` (vision/persona/tone/policies) a escrita das camadas; declarar que o PRD em `plans/` é view derivada. Não remover o fluxo de PRD existente — adicionar o handoff.

- [ ] **Step 2: `project-init`** — no scaffold, criar a árvore `business/ product/ operations/ engineering/` (+ mover subsistemas se `.context/` legado via chamada a `devflow:migration`); delegar preenchimento inicial aos curadores. Manter `docs/` dotcontext intocado.

- [ ] **Step 3: `context-sync`** — adicionar escopo: re-sincronizar cada camada delegando ao curador correspondente; regenerar índice de conhecimento.

- [ ] **Step 4: Validar** — `grep -q "business-context" skills/prd-generation/SKILL.md`; `grep -q "engineering/" skills/project-init/SKILL.md`.

- [ ] **Step 5: Commit.** `feat(orchestrators): prd-generation/project-init/context-sync delegam aos curadores`.

---

## Phase 8 — Wiring de carregamento nos hooks

### Task 16: SessionStart KNOWLEDGE_INDEX (Stage-1)

**Files:**
- Modify: `hooks/session-start`
- Test: `tests/hooks/test-session-start-knowledge-index.sh`

- [ ] **Step 1: Teste shell que falha.**

```bash
#!/usr/bin/env bash
set -euo pipefail
TMP=$(mktemp -d); trap "rm -rf $TMP" EXIT
mkdir -p "$TMP/.context/business"
cat > "$TMP/.context/business/vision.md" <<'EOF'
---
type: knowledge
layer: business
name: vision
description: north-star do produto
activation: always
owner: business-context
version: 1.0.0
---
corpo
EOF
out=$(cd "$TMP" && bash "$OLDPWD/hooks/session-start" 2>&1 || true)
echo "$out" | grep -q "KNOWLEDGE_INDEX" || { echo "FAIL: sem KNOWLEDGE_INDEX"; exit 1; }
echo "$out" | grep -q "north-star do produto" || { echo "FAIL: descrição não indexada"; exit 1; }
echo "PASS"
```

- [ ] **Step 2: Rodar; falhar.** `bash tests/hooks/test-session-start-knowledge-index.sh`

- [ ] **Step 3: Modificar `hooks/session-start`** — após o índice de contexto existente, invocar `node scripts/lib/print-knowledge-index.mjs` (helper novo de ~15 linhas que chama `loadKnowledgeIndex` e imprime 1 linha/doc: `[layer] name — description (activation)`) e emitir sob `<KNOWLEDGE_INDEX>...</KNOWLEDGE_INDEX>`. Seguir SI-1: sem `node -e` com interpolação — usar `execFile`/script dedicado.

- [ ] **Step 4: Rodar; passar.**

- [ ] **Step 5: Rodar suíte de hooks existente** — sem regressão. `bash tests/hooks/test-session-start.sh 2>&1 | tail -3` (se existir).

- [ ] **Step 6: Commit.** `feat(hooks): session-start injeta KNOWLEDGE_INDEX (Stage-1)`.

### Task 17: PreToolUse knowledge bodies (Stage-2)

**Files:**
- Modify: `hooks/pre-tool-use`
- Test: `tests/hooks/test-pre-tool-use-knowledge.sh`

- [ ] **Step 1: Teste shell que falha** — fixture com doc `activation: on-demand` cuja relevância casa o arquivo editado; verifica que o corpo é injetado. (Espelhar o teste de filtering de standards do v2, se existir.)

- [ ] **Step 2: Rodar; falhar.**

- [ ] **Step 3: Modificar `hooks/pre-tool-use`** — após o filtering de standards/ADR, carregar corpos de knowledge `on-demand` relevantes ao path/keywords via helper (reusa `knowledge-loader`). Manter a ordem de invariantes do v2 (deny-first antes de filtering).

- [ ] **Step 4: Rodar; passar + suíte de hooks sem regressão.**

- [ ] **Step 5: Commit.** `feat(hooks): pre-tool-use injeta corpos de knowledge on-demand (Stage-2)`.

---

## Phase 9 — ADR da decisão arquitetural

### Task 18: registrar a ADR

**Files:**
- Create: `.context/engineering/adrs/NNN-context-layer-knowledge-ddc-v1.0.0.md` (numeração = próximo disponível; provavelmente `006`)

- [ ] **Step 1: Rodar `/devflow adr:new --mode=prefilled`** (ou criar manualmente seguindo o template) com o briefing: "engineering/ como container + 4 camadas de conhecimento DDC + consolidação em Standards + knowledge para narrativa (incl. engenharia) + agentes-curadores + migração explícita". Incluir ≥2 alternativas consideradas (ex.: dirs paralelos estilo DDC vs consolidação em Standards; dual-read perpétuo vs migração explícita), guardrails `SEMPRE/NUNCA`, e relação `supersedes` parcial com ADR-001 quanto ao path canonical dos ADRs.

- [ ] **Step 2: Rodar `adr-audit`** no novo ADR — gate `PASSED`.

- [ ] **Step 3: Regenerar índice** de ADRs (`adr-update-index.mjs`).

- [ ] **Step 4: Commit.** `docs(adr): registra context layer de conhecimento DDC (supersede parcial ADR-001)`.

---

## Phase 10 — Verificação final

### Task 19: suíte completa + self-check

- [ ] **Step 1: Rodar a suíte inteira e comparar com o baseline (PF.2).**

```bash
PASS=0; FAIL=0
for t in $(find tests -name "test-*.mjs" -o -name "*.test.mjs" -o -name "test-*.sh"); do
  case "$t" in
    *.mjs) node --test "$t" >/dev/null 2>&1 && PASS=$((PASS+1)) || FAIL=$((FAIL+1)) ;;
    *.sh)  bash "$t" >/dev/null 2>&1 && PASS=$((PASS+1)) || FAIL=$((FAIL+1)) ;;
  esac
done
echo "Final: PASS=$PASS FAIL=$FAIL"
```

Expected: `FAIL` ≤ baseline FAIL; `PASS` ≥ baseline + ~11 (testes novos).

- [ ] **Step 2: Smoke da migração na cópia do próprio repo** — copiar `.context/` para tmpdir, rodar `devflow-migrate --project=<tmp> --yes`, confirmar layout v2 + `docs/` intocado. NÃO rodar in-place no repo versionado.

- [ ] **Step 3: Verificar compat dotcontext** — confirmar que `.context/docs/{project-overview,development-workflow,testing-strategy}.md` continuam intactos e nos paths originais (nenhum movido/stub).

- [ ] **Step 4: Atualizar `README.md` + `CHANGELOG.md`** com a feature da camada de conhecimento e os novos comandos (`/devflow update migration`, `/devflow knowledge`). Bump de versão conforme magnitude (minor/major) em `.claude-plugin/plugin.json` e `.cursor-plugin/plugin.json`.

- [ ] **Step 5: Commit final + abrir PR.**

```bash
git add -A
git commit -m "docs(changelog): camada de conhecimento DDC + comandos migration/knowledge"
```

Depois usar `superpowers:finishing-a-development-branch` para o fluxo de PR.

---

## Self-Review (cobertura do spec)

| Requisito do spec | Task |
|---|---|
| §4 árvore 4 camadas + engineering container | Task 8 (migração cria) |
| §4 regra de ouro (dotcontext intocado) | Task 8 + Task 19 Step 3 |
| §5 4 mecanismos · Knowledge | Tasks 2–7 |
| §5.1 consolidação em Standards | Task 13 (taxonomia) |
| §5.2 knowledge espelha standards | Tasks 3,4,6,7 |
| §6.1 4 agentes-curadores + roteador | Tasks 11,12 |
| §6.2 memória via MemPalace/napkin | Task 11 Step 1, Task 12 |
| §6.3 orquestradores delegam | Tasks 14,15 |
| §7 migração explícita + context-paths | Tasks 1,8,9 |
| §8 carregamento (Stage-1/2 + Planning) | Tasks 14,16,17 |
| §10 todos os componentes | Tasks 1–13 |
| §12 invariantes (TDD, tmpdir, pt-BR) | todas |
| D10 narrativa de engenharia | Tasks 2 (taxonomia eng), 7, 12 |
| ADR | Task 18 |

Lacunas conhecidas (aceitas): conteúdo real dos docs de conhecimento (vision/persona reais) é responsabilidade dos curadores em runtime, não scaffold; os hooks de enforcement (guard-secrets/commit/budget) são follow-up (spec §11).
