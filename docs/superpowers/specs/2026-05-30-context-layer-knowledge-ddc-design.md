# Design — Context Layer de Conhecimento DDC para o DevFlow

> **Workflow DevFlow:** context-layer-knowledge-ddc · **Escala:** LARGE · **Fase:** P (Design)
> **Data:** 2026-05-30 · **Branch:** `feat/context-layer-knowledge-ddc` · **Idioma:** pt-BR
> **Origem:** análise do framework DDC (`framework_ddc/ddc-briefing.html` + `.contexts/` + `.claude/`) cruzada com o context layer atual do DevFlow (dotcontext + superpowers + Standards/ADRs/Stacks + MemPalace).

---

## 1. Contexto e problema

O DevFlow tem um **motor de contexto** maduro (context-layer-v2 → v1.0.0): filtragem Stage-1/Stage-2, Standards com linter executável, ADRs versionadas, Stacks scraped, permissions vendor-neutral, observabilidade OTel, MemPalace. O que falta é a **arquitetura da informação** que esse motor organiza:

1. **Não há onde persistir conhecimento de negócio, produto e operações.** O `.context/docs/` é plano e engineering-only (`project-overview`, `development-workflow`, `testing-strategy`). A IA executa cega ao "porquê existimos", "o que o produto promete" e "como roda em produção" — exatamente o conhecimento que mais reduz alucinação.
2. **O conhecimento de engenharia está espalhado** em `.context/adrs`, `.context/standards`, `.context/stacks`, `.context/templates` no topo, sem um container coerente.
3. **A produção de contexto está acoplada a uma skill específica** (`prd-generation`), em vez de delegada a curadores especializados.

O framework **DDC (Domain-Driven Context)** resolve precisamente a arquitetura da informação: 4 camadas (business/product/engineering/operations), cada uma respondendo uma pergunta e com um dono, sob os princípios single source of truth + progressive disclosure + "apontar via `@`, nunca duplicar". Este design **adota a arquitetura de informação do DDC dentro do `.context/` do DevFlow**, reaproveitando o motor v2 como mecanismo de carregamento e os mecanismos existentes (Standards/ADRs/Stacks) como produtores de engenharia.

### Objetivo

Trazer a camada de conhecimento de 4 níveis do DDC para o DevFlow, com: estrutura física reorganizada, migração explícita e idempotente, consolidação dos padrões de engenharia em Standards, um novo mecanismo `knowledge` para narrativa de domínio, agentes-curadores como produtores, e wiring de carregamento no PREVC — **sem quebrar a compatibilidade com o dotcontext**.

---

## 2. Princípios herdados do DDC (adaptados ao DevFlow)

1. **Single source of truth** — o conhecimento vive numa camada; Standards, ADRs e CLAUDE referenciam via `@`, nunca duplicam.
2. **Progressive disclosure** — índice no SessionStart (Stage-1) + corpo sob demanda (Stage-2), reusando o motor v2.
3. **Native read** — as skills do DevFlow leem as camadas **diretamente** (todas as modes), sem depender do dotcontext (que continua intocado).
4. **Pergunta por camada + dono** — cada camada responde uma pergunta e tem um agente-curador responsável.

---

## 3. Decisões de design (resolvidas no brainstorming)

| # | Decisão | Escolha |
|---|---|---|
| D1 | Placement das 4 camadas | Promover ao topo de `.context/`; `engineering/` vira container |
| D2 | `engineering/` contém | `adrs/ standards/ stacks/ templates/` (DevFlow-native, relocados) |
| D3 | Migração | **Explícita** via `/devflow update migration` (= `/devflow migration`), idempotente — sem dual-read perpétuo |
| D4 | Escopo do spec | End-to-end: estrutura + migração + loading + produtores |
| D5 | `.context/docs/` + dotcontext | `docs/` **intocado** (compat); camadas são aditivas e DevFlow-native |
| D6 | Padrões de engenharia | **Consolidar em Standards** (`devflow:standards`); NÃO criar dirs `architecture/practices/contracts/processes` |
| D7 | Mecanismo `knowledge` | **Espelho completo do Standards** (builder `devflow:knowledge` + taxonomia + CREATE/AUDIT + loader) |
| D8 | Produtores | **Agentes-curadores dedicados** (front door), portados do DDC |
| D9 | Hooks de enforcement DDC | **Follow-up separado** (out of scope) |

---

## 4. Arquitetura — a árvore de 4 camadas

```
.context/
├── docs/  agents/  skills/  plans/      ← dotcontext-managed · INTOCADOS
│
├── business/                            ← conhecimento narrativo · curador: business-context
│   ├── vision.md  glossary.md  compliance.md
│   ├── business-model.md  metrics.md  icp.md
│
├── product/                             ← conhecimento narrativo · curador: product-context
│   ├── vision.md  design-system.md  tone-of-voice.md
│   ├── persona.md  policies.md
│
├── operations/                          ← conhecimento narrativo · curador: operations-context
│   ├── environments.md  deploy.md  monitoring.md  rollback.md
│   ├── incident-response.md  secret-rotation.md  backups.md
│
└── engineering/                         ← container · curador/roteador: engineering-context
    ├── adrs/        (← .context/adrs)        → devflow:adr-builder
    ├── standards/   (← .context/standards)   → devflow:standards   [absorve rules+contracts+architecture+practices-lintáveis]
    │   └── machine/ (linters + archTests)
    ├── stacks/      (← .context/stacks)      → devflow:scrape-stack-batch
    └── templates/   (← .context/templates)
```

### Regra de ouro de compatibilidade (invariante)

> DevFlow **nunca move nem edita** diretórios gerenciados pelo dotcontext (`docs/`, `agents/`, `skills/`, `plans/`). Apenas (a) adiciona camadas DevFlow-native (`business/`, `product/`, `operations/`) e (b) relocaliza suas próprias extensões (`adrs/`, `standards/`, `stacks/`, `templates/`) para dentro de `engineering/`.

Consequência: o Full mode do dotcontext (`getPhaseDocs`, `buildSemantic`, `fill`, `scaffoldPlan`, detecção Modo-B do `prd-generation`) permanece 100% funcional, pois `.context/docs/project-overview.md` e os demais docs scaffoldados continuam onde o dotcontext os escaneia.

---

## 5. Os quatro mecanismos de contexto

Cada padrão tem **um** jeito consistente de criar e usar — sem sobreposição:

| Mecanismo | Cobre | Builder/skill | Enforcement |
|---|---|---|---|
| **Standards** | rules + contracts + architecture + practices-lintáveis + commits | `devflow:standards` | linter PostToolUse + audit S1–S7 |
| **ADRs** | decisões (por que X sobre Y) | `devflow:adr-builder` | audit 12 checks + gate V |
| **Stacks** | refs de tecnologia versionada | `devflow:scrape-stack-batch` | pipeline scrape + SI-6 |
| **Knowledge** (novo) | narrativa business/product/operations | `devflow:knowledge` (espelha standards) | audit de completude + `knowledge-loader` |

### 5.1 Consolidação dos padrões de engenharia em Standards (D6)

Os 7 grupos de engenharia do DDC mapeiam para os mecanismos existentes — **não** para novos dirs de conhecimento:

| Grupo DDC | É regra operacional lintável? | Home no DevFlow | Ação |
|---|---|---|---|
| rules | ✅ | Standards (já é) | — |
| contracts (api, events, schemas, secrets) | ✅ doutrina prescritiva | Standards `category: contracts` | mesclar (taxonomia) |
| architecture (fsd, hexagonal, ddd) | ✅ via `enforcement.archTest` | Standards `category: architecture` | mesclar (nova categoria) |
| practices (tdd, bdd, clean-code) | ⚠️ parcial | lintável → Standards (`test-discipline`); disciplina → superpowers + gates PREVC | mesclar o lintável |
| processes (commits, ci, deploy) | ⚠️ parcial | commits/hygiene → Standards; deploy/release → `operations/` | mesclar o lintável |
| decisions | ❌ decisão imutável | `engineering/adrs/` | subsistema próprio |
| stacks | ❌ doc de referência | `engineering/stacks/` | subsistema próprio |

A taxonomia `taxonomy-of-concerns.yaml` já tem o eixo `category` (ex.: `runtime-validation` é `category: contracts`, `test-discipline` é `category: testing`). **Ação:** expandir a taxonomia com a categoria `architecture` e os concerns de contracts/process faltantes (api, events, secrets, commit-hygiene). O usuário cria qualquer padrão de engenharia com `/devflow standards new <concern>` — caminho único.

### 5.2 Mecanismo `knowledge` (D7 — espelho do Standards)

Espelha a **ergonomia** do Standards, não o modelo de conteúdo nem o enforcement:

| Eixo | Standards | Knowledge |
|---|---|---|
| Natureza | regra imperativa | narrativa descritiva |
| Artefato | `std-X.md` = prosa + frontmatter + **linter** | `<name>.md` = prosa + frontmatter, **sem linter** |
| Ativação | por **path** (`applyTo` glob → PostToolUse) | por **tópico/fase** (relevância no Planning, índice no SessionStart) |
| Enforcement | linter + audit S1–S7 | audit de completude (frontmatter, sem placeholder) |
| Builder | `devflow:standards` | `devflow:knowledge` |
| Taxonomia | `taxonomy-of-concerns.yaml` | `taxonomy-of-knowledge.yaml` (tipos de doc por camada) |

Frontmatter de um doc de conhecimento:
```yaml
---
type: knowledge
layer: business        # business | product | operations
name: vision
description: <1 linha — usada no índice Stage-1>
activation: always     # always | on-demand
owner: business-context
version: 1.0.0
---
```

**Defaults sempre-ativas** (herdado do DDC): `business/{vision,glossary,compliance}`, `product/{vision,tone-of-voice,design-system,persona}`. O restante é `on-demand`.

`devflow:knowledge` — builder com modos:
- **CREATE** — resolve o tipo de doc na `taxonomy-of-knowledge.yaml`, scaffolda o artefato (frontmatter + `sectionTemplate`).
- **AUDIT** — checks determinísticos de completude (K1 frontmatter completo, K2 sem placeholder de scaffold, K3 `activation` válida, K4 `layer`/`owner` válidos, K5 referências `@` apontam para arquivos reais).

---

## 6. Produtores — agentes-curadores (D8)

Modelo em três camadas:

```
FRONT DOOR (agentes)     business-context · product-context · engineering-context (roteador) · operations-context
        │ despacham para
MECANISMOS (skills)      adr-builder · standards-builder · scrape-stack-batch · knowledge (builder)
        │ operam sobre
SUBSTRATO (libs)         context-paths · knowledge-loader · taxonomias · audit
```

### 6.1 Os quatro agentes novos (`agents/`)

Portados do DDC (`framework_ddc/.claude/agents/ddc-*`), **genericizados** e adaptados ao DevFlow:

| Agente | Cura | Disciplina-chave |
|---|---|---|
| **business-context** | `business/` | cadeia de coerência vision→icp→business-model→metrics→compliance; ubiquitous language (glossary) |
| **product-context** | `product/` | ancorado no business como north-star; disciplina de dependências (`Depende de` / `É referenciado por`) |
| **engineering-context** | `engineering/` (ROTEADOR) | classifica briefing em 1 de 7 tipos e despacha para o mecanismo correto |
| **operations-context** | `operations/` | runbooks de produção; coerência com `processes` de engenharia |

**O roteador `engineering-context`** classifica "quero documentar X" e despacha:

| Tipo classificado | Despacha para |
|---|---|
| decisão entre alternativas | `devflow:adr-builder` |
| regra/contract/architecture/practice-lintável | `devflow:standards` |
| tecnologia versionada | `devflow:scrape-stack-batch` |
| disciplina (TDD/BDD execução) | superpowers (ponteiro, não produz artefato) |
| fluxo de produção (deploy/release) | `operations-context` |

O roteador **não inventa artefato novo** — é o front door que unifica a UX preservando os mecanismos consolidados. Complementa o `devflow:agent-dispatch` (que roteia *tasks de trabalho*, não documentação de contexto).

### 6.2 Memória dos agentes — MemPalace + napkin (não file-based)

Os agentes DDC trazem um sistema de memória **file-based por agente** (`.claude/agent-memory/<agente>/`). **Não portamos esse 4º sistema.** Em vez disso:

- **MemPalace** (`wing: devflow`) — recall semântico; cada curador grava suas descobertas como drawers escopadas por agente. O `memory-specialist` já existe.
- **napkin.md** (committed, always-active) — runbook curado, compartilhado com o time (cobre a parte "institucional shared" que o DDC resolvia commitando agent-memory).

Os blocos "Persistent Agent Memory" dos agentes DDC são **removidos** no porte; paths absolutos de outros projetos são genericizados; a persistência aponta para `.context/<layer>/` (não `.contexts/`).

### 6.3 Orquestradores (deixam de ser produtores)

| Skill | Antes | Depois |
|---|---|---|
| `prd-generation` | produzia o PRD one-shot | faz a entrevista e **delega** a `business-context` + `product-context`; PRD vira **view derivada** das camadas |
| `project-init` | scaffold `.context/` | scaffolda a árvore de 4 camadas e **delega** preenchimento inicial aos curadores |
| `context-sync` | sync docs/agents/skills | **delega** a re-sincronização de cada camada ao seu curador |

---

## 7. Migração explícita (D3)

### 7.1 Runner

`scripts/devflow-migrate.mjs` + skill `devflow:migration` (= `/devflow update migration`, alias `/devflow migration`). **Idempotente** — detecta o layout atual e converge para o canonical. Testado sobre cópia **tmpdir** (nunca muta dir versionado in-place).

Ordem de execução:
1. Lê `.context/.layout-version`. Ausente ⇒ layout v1 (atual).
2. **Cria** `business/ product/ operations/` com templates vazios (frontmatter + headers, no idioma do projeto) e os 4 agentes-curadores.
3. **Move** `adrs|standards|stacks|templates` → `engineering/*` via `git mv` (preserva histórico). Resolve a origem de ADRs de onde estiver (`docs/adrs` legado ou `adrs`).
4. **Reescreve** índices (ADR README, standards) e o allowlist SI-4 via `context-paths.mjs`.
5. Grava `.context/.layout-version: 2` + imprime relatório do que moveu.

### 7.2 Reconciliação com `/devflow update`

`/devflow update` ganha **Step 7 — drift estrutural**: após atualizar plugins, compara `.layout-version` do projeto com a do plugin. Defasado ⇒ lista na seção "Next Steps" e **sugere** (opt-in, nunca automático):

```
▸ Migração de layout de contexto (v1 → v2) — 4 camadas de conhecimento DDC
  Para ativar:  /devflow update migration
```

`/devflow update` só **detecta e sugere**; quem executa é o comando de migração.

### 7.3 Keystone — `scripts/lib/context-paths.mjs`

Mover `adrs/standards/stacks/templates` muda paths hardcoded em ~15 lugares. Em vez de caçar string por string, **uma única fonte** conhece os paths canônicos (`engineering/adrs`, `engineering/standards/machine`, `business`, etc.); todo o resto pergunta a ela.

Libs do v2 que passam a importar de `context-paths.mjs`: `path-resolver` (resolveAdrPath), `standards-loader`, `manifest-stacks`, `run-linter` (allowlist SI-4 → `engineering/standards/machine/`), hooks. Também é o ponto único de tolerância de leitura legada (lê de `docs/adrs` OU `adrs` OU `engineering/adrs`; escreve sempre no canonical).

---

## 8. Carregamento (reusa o motor v2)

- `scripts/lib/knowledge-loader.mjs` + skill `devflow:knowledge-filter` (espelha `adr-filter`):
  - **SessionStart Stage-1** — injeta `KNOWLEDGE_INDEX` (1 linha/doc: layer/name/description/activation).
  - **PreToolUse Stage-2** — carrega corpos `on-demand` que batem relevância.
  - **PREVC Planning Step 1** — `knowledge-filter` injeta as sempre-ativas + as relevantes à task como constraints do brainstorming, exatamente como o `adr-filter` já faz hoje (`skills/prevc-planning/SKILL.md:47-69`).

---

## 9. Mapeamento do executor DDC (`.claude/`) → DevFlow

Validação do lado executor (verificado no repo):

| DDC `.claude/` | DevFlow | Veredito |
|---|---|---|
| agent-memory/ (file-based) | MemPalace + napkin.md | substituir (§6.2) |
| agents/ context-architects | 4 agentes novos | portar (§6.1) |
| agents/ genéricos (tech-lead, qa, backend…) | roster DevFlow (architect, test-writer…) | já coberto |
| agents/ claude-* (meta-authoring) | skills (`skill-creation`, `standards-builder`, `adr-builder`, `superpowers:writing-skills`) | coberto por skills |
| hooks/ (guard-*, check-size, suggest-skills) | engine v2 cobre suggest/announce; guards → follow-up | parcial (§11) |
| skills/ (1 por tópico) | engine de filtragem just-in-time | superado — não portar |
| rules/ (22, `.claude/rules/` native) | Standards `.context/standards/` (loader próprio) | = Standards; seed da taxonomia |

**Três divergências deliberadas (DevFlow é superior):**
1. **skills/ → engine de filtragem** — o DDC cria 1 skill por tópico; o DevFlow carrega o contexto certo just-in-time. Menos superfície.
2. **rules → Standards (não `.claude/rules/` native)** — DevFlow é bridge cross-vendor (Cursor/Codex/Gemini); usa `.context/` + loader próprio (portável).
3. **agent-memory → MemPalace + napkin** — sem 4º sistema file-based.

---

## 10. Componentes a construir (TDD, `node:*` only)

| Componente | Tipo | Papel |
|---|---|---|
| `scripts/lib/context-paths.mjs` | lib | keystone — paths canônicos centralizados |
| `scripts/lib/knowledge-loader.mjs` | lib | carrega/filtra docs de conhecimento |
| `skills/knowledge-filter/SKILL.md` | skill | injeta conhecimento no PREVC Planning (espelha adr-filter) |
| `skills/knowledge/SKILL.md` + `references/taxonomy-of-knowledge.yaml` + `scripts/lib/knowledge-from-type.mjs` + `knowledge-audit.mjs` | builder | CREATE/AUDIT de docs de conhecimento |
| `scripts/devflow-migrate.mjs` + `skills/migration/SKILL.md` | runner | migração idempotente de layout |
| `agents/{business,product,engineering,operations}-context.md` | agentes | curadores (front door) |
| expansão `taxonomy-of-concerns.yaml` | dados | categoria `architecture` + concerns faltantes |
| `.context/adrs/NNN-context-layer-knowledge-ddc-v1.0.0.md` | ADR | registra a decisão arquitetural |

**Modificações:** `scripts/lib/{path-resolver,standards-loader,manifest-stacks,run-linter}.mjs` (importar de `context-paths`); `hooks/{session-start,pre-tool-use}` (Stage-1 KNOWLEDGE_INDEX, Stage-2 knowledge bodies); `skills/{prd-generation,project-init,context-sync,prevc-planning}/SKILL.md` (delegar a curadores; carregar conhecimento); `commands/devflow.md` (Step 7 drift + `migration`).

---

## 11. Fora de escopo (follow-up próprio)

- **Hooks de enforcement DDC** (`guard-secrets`, `guard-conventional-commit`, `budget/check-claude-md-size`) — cada um vira enforcement de um Standard ou hook num PR separado (decisão D9).
- **Ajuste do dotcontext upstream** para ler as 4 camadas — fora do nosso repo; as camadas são DevFlow-native lidas pelo loader próprio.
- **Migração de projetos NXZ em produção** — atividade manual pós-merge.
- **Limites duros como budget enforcement** (CLAUDE.md≤200, SKILL≤500, catálogo≤15k) — casa com o token-estimate/observability do v2; roadmap futuro.

---

## 12. Invariantes (aplicam-se a todos os Task Groups)

1. **dotcontext nunca é tocado** — `docs/`, `agents/`, `skills/`, `plans/` intocados; Full mode preservado.
2. **Single source of truth** — knowledge/standards/ADRs referenciam via `@`, nunca duplicam.
3. **Migração explícita, reversível, testada em tmpdir** — nunca muta dir versionado in-place durante testes (incidente prévio do linter FSD).
4. **TDD obrigatório** — RED→GREEN→REFACTOR; testes reais (unit + integração com fixtures de filesystem), nunca content-checks.
5. **Dependency-free** — apenas `node:*` builtins; sem `node_modules` novo.
6. **pt-BR** em specs/docs/templates; termos técnicos mantidos.
7. **Branch única** `feat/context-layer-knowledge-ddc`; commits atômicos; 1 PR; bump conforme magnitude.

---

## 13. Estratégia de testes

| Componente | Tipo de teste |
|---|---|
| `context-paths.mjs` | unit — resolução canonical + tolerância legada (fixtures tmpdir) |
| `knowledge-loader.mjs` | unit — índice Stage-1, filtro por activation/relevância |
| `knowledge` builder (CREATE/AUDIT) | unit — scaffold a partir da taxonomia; checks K1–K5 |
| `devflow-migrate.mjs` | integração — migração idempotente sobre cópia tmpdir de um `.context/` v1 simulado; assert layout v2 + `git mv` preserva histórico + re-execução é no-op |
| `/devflow update` Step 7 | integração — detecta drift e sugere (não executa) |
| hooks (Stage-1/Stage-2 knowledge) | shell — KNOWLEDGE_INDEX presente; corpo on-demand injetado |
| agentes-curadores | review manual + smoke (porte sem memória file-based; paths genéricos) |

Baseline: rodar a suíte atual antes (PF) e ao final (`FAIL=0`, `PASS >= baseline + novos testes`).

---

## 14. Próximo passo

Após aprovação deste spec → `superpowers:writing-plans` gera o plano de implementação task-a-task (TDD, bite-sized), com a ordem: keystone (`context-paths`) → mecanismo `knowledge` → migração → agentes → orquestradores → wiring de carregamento → ADR.
