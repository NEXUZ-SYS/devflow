# DevFlow para Monorepo — Modelo de Contexto em 3 Tiers (+ git worktree)

> **DevFlow workflow:** devflow-monorepo-3tier | **Scale:** LARGE | **Phase:** P (Planning) → R
> **Idioma:** pt-BR | **Projeto-alvo de validação:** nxz-brain (Turborepo + Bun, 8 apps + 13 packages)
> **Data:** 2026-06-10

## Objetivo

Permitir que o DevFlow gerencie o contexto (`.context/`) de um monorepo **isolando o que é específico de cada app/package sem perder a visão do projeto inteiro**, e operando bem sob **git worktree**. Sem forkar o dotcontext.

## Problema

O DevFlow é hoje **single-root**: um único `.context/` na raiz, com standards, ADRs, knowledge e estado de workflow **globais ao repo**. Num monorepo heterogêneo (frontends Next/React, backends Hono/MCP, site Fumadocs), um conjunto global de enforcement só pode fazer duas coisas, ambas ruins: aplicar regra do cluster errado (falso-positivo) ou diluir-se ao mínimo denominador comum (falso-negativo). E o estado de workflow versionado colide entre worktrees paralelos.

## Grounding (restrições reais de como o `.context/` é lido)

Apurado por leitura do código (dotcontext CLI `vinilana/dotcontext` v0.9.2 MIT e loaders do DevFlow):

- **dotcontext** acha a raiz por *walk-up* até o 1º `.context/` ou `.git/`, fixa **um root por sessão**, e lê **caminhos FIXOS não-recursivos** (`agents/`, `skills/`, `plans/`, `docs/`, `workflow/`). Não enxerga `.context/apps/<app>/...` nem múltiplos `.context/`. Sem noção de monorepo/workspace.
- **knowledge-loader do DevFlow** é **recursivo** dentro das 4 camadas DDC (`business/product/operations/engineering`), pulando `adrs/standards/stacks/templates/machine`. Logo `engineering/apps/<app>/*.md` **é descoberto hoje**.
- **standards/ADRs** são path-fixo e flat (índice único). **agents/skills/plans/workflow** são single-root.
- **session-start** resolve `.context/` a partir do `PWD` (cwd/worktree).

**Conclusão:** isolamento físico via múltiplos `.context/` (distribuído) **não é suportado** sem mudança grande. O que funciona hoje sem código é knowledge narrativo por app via subpastas recursivas. O enforcement (standards/ADRs) é global por construção.

## Decisão: composição, não fork

Avaliamos forkar o dotcontext para multi-root nativo. Veredito: **não fork**.

- dotcontext é pré-1.0, mantenedor único, e o "root" vive no harness — a área que mais muda. Fork = merge recorrente no arquivo mais quente, maior custo de manutenção contínua.
- **Alternativa adotada:** o DevFlow **compõe** o `.context/` que o dotcontext consome. O resolver decide *o que escrever/injetar* por escopo; o dotcontext permanece **vanilla**. Zero custo de upstream.

## O modelo: 3 tiers

A medição (ver Fase 0, abaixo) revelou que o escopo não é "raiz × app" — há um **terceiro tier natural, a família/cluster**:

```
TIER 1 · UNIVERSAL   → baseline do monorepo (vem dos packages de infra:
                        typescript-config, eslint-config, validators, auth, database)
   │
TIER 2 · FAMÍLIA     → cluster por stack:  backend (Hono/MCP)  |  frontend (Next/React)
   │
TIER 3 · APP-LOCAL   → decisões/regras de um app só (hub, fin, docs, mcp-server…)
```

**Resolução:** `aplicáveis(ws) = universal ∪ família(ws) ∪ app(ws)`.

## Layout do `.context/` (monorepo)

```
nxz-brain/
└── .context/
    ├── .layout-version            # "2"
    ├── manifest.monorepo.yaml     # ← NOVO: famílias + (opcional) overrides de scope
    ├── business/ product/ operations/   # compartilhado (visão-do-todo)
    ├── engineering/
    │   ├── adrs/                   # ADRs (universal + scope tag no frontmatter)
    │   ├── standards/              # standards (universal + scope tag)
    │   │   └── machine/            # linters
    │   └── apps/                   # ← knowledge + enforcement por app (Tier 3)
    │       ├── mcp-server/{overview.md, decisions.md, standards.local.yaml}
    │       ├── fin/...
    │       └── docs/...
    └── workflow/                   # estado — ver seção worktree (isolado por worktree)
```

- **Visão-do-todo:** `.context/` raiz é uma árvore só → o "todo" é trivial de navegar e o dotcontext lê normalmente.
- **Isolamento:** Tier 3 vive em `engineering/apps/<app>/` (já carregado pelo walk recursivo); enforcement é filtrado por scope tag.

## Manifesto + resolver + índice + validação

**Manifesto** (`manifest.monorepo.yaml`): mapa de famílias (derivável das deps do `package.json` — Hono/MCP vs Next/React) + overrides opcionais. Cada standard/ADR carrega `scope: universal | family:<f> | app:<ws>` no frontmatter.

**Resolver** (camada DevFlow, ~12 linhas — protótipo validado no spike): dado o app atual, devolve o conjunto aplicável dos 3 tiers.

**Índice por app** (`indexByApp()`): `{ ws: { universal[], family[], app[], applicable[] } }`. É o que o `sync` grava e o lint/Planning consultam.

**Validação de integridade** (roda em `sync`/`doctor`): scope bem-formado; família existe; app existe; **nenhum workspace em duas famílias**. Gate que garante índice confiável antes de virar enforcement.

## Indexação — como e quando

| Momento | Ação no modelo 3 tiers |
|---|---|
| `/devflow init` | Deriva o mapa de famílias das deps; grava `manifest.monorepo.yaml` |
| **SessionStart** | Resolve o **app atual** (worktree/cwd) → injeta só o índice escopado |
| `/devflow:devflow-sync` | Regenera o índice por-app de standards/ADRs + valida integridade |
| **lint-time** | Aplica só o conjunto resolvido daquele app |

## Monorepo × git worktree (primeira classe)

**Princípio:** o *worktree* é a unidade de **trabalho isolado**; o `.context/` raiz é a unidade de **verdade compartilhada**.

| Camada | Política | Por quê |
|---|---|---|
| Manifesto 3 tiers | **Compartilhado** (committed) | Verdade do projeto; idêntico em todo worktree |
| Knowledge por app (`engineering/apps/<app>/`) | **Compartilhado** (committed) | Contexto do app é o mesmo em qualquer branch |
| Standards/ADRs (todos os tiers) | **Compartilhado** (committed) | Enforcement consistente |
| `.context/workflow/` (stories, checkpoint, plano ativo) | **Isolado por worktree** (gitignored) | Cada worktree = uma feature; estado não pode colidir |
| MemPalace (diários/decisões) | **Compartilhado** (indexado pelo repo) | Memória do projeto é uma só |

**Mecanismos exigidos pelo worktree:**

1. **Resolução de "app atual"** — convenção de branch `feat/<app>-<slug>` → `app=<app>`; fallback por arquivos tocados (`git diff`). SessionStart injeta só o índice daquele app.
2. **Composição roda por worktree** no session-start (cwd = worktree); dotcontext faz walk-up e acha o `.context/` local. Barato.
3. **`git-strategy` gate reconhece worktree** — estar num worktree de feature já satisfaz o isolamento de branch; o gate não exige "crie uma branch".
4. **Estado de workflow per-worktree** — `.context/workflow/` passa a **gitignored** (ou `$GIT_DIR/worktrees/<wt>/devflow-state/`). **Única mudança de comportamento existente**; todo o resto é aditivo.

## Faseamento

- **Fase 0 — Spike de medição (CONCLUÍDA).** Mediu divergência e provou o modelo. Resultados: **51 standards divergentes** (≥5 = limiar), **14/21 ADRs locais (67%)**, **47% de ruído** cortado pelo escopo. Resolver + indexador + validador implementados e **13/13 testes verdes** (sandbox `/tmp/devflow-3tier-spike/`, throwaway).
- **Fase 1 — Baseline single-root híbrido (sempre paga, ~0 código no framework).** Inicializar `.context/` na raiz do nxz-brain; knowledge por app em `engineering/apps/<app>/`; usar os filtros existentes (`knowledge-filter`, `adr-filter`). Entrega isolamento de knowledge + visão-do-todo já.
- **Fase 2 — Composição/escopo de enforcement (justificada pela Fase 0).** Manifesto + scope tags + resolver + índice por-app + validação; resolução de app-atual por worktree; mover `.context/workflow/` para per-worktree; `git-strategy` ciente de worktree.

## Impacto no framework DevFlow

| Componente | Mudança |
|---|---|
| `project-init` | Detectar monorepo → gerar `manifest.monorepo.yaml` (famílias das deps) + `engineering/apps/<app>/` |
| `context-sync` | Regenerar índice por-app + rodar validação de integridade |
| `standards-builder` / `adr-builder` | Aceitar e gravar `scope:` no frontmatter |
| `knowledge-filter` / `adr-filter` | Ficar cientes de app/família (escopo determinístico além do semântico) |
| SessionStart hook | Resolver app-atual via worktree/cwd; injetar índice escopado |
| `git-strategy` gate | Reconhecer worktree como isolamento de branch |
| `.context/workflow/` | Passar a per-worktree (gitignored) |

## Estratégia de testes (TDD)

Cada grupo de implementação começa por teste que falha (RED → GREEN → REFACTOR):

- **Resolver:** unit — inclusão/exclusão por tier (backend não recebe regra de React etc.). *(provado no spike)*
- **Indexador:** unit — shape do índice por app; `applicable = universal ∪ família ∪ app`. *(provado)*
- **Validador:** unit — pega scope mal-formado, família/app inexistente, workspace em duas famílias. *(provado)*
- **Detecção de família:** unit + integração — derivar família das deps reais do `package.json`.
- **Resolução de app-atual:** unit — branch convention + fallback por `git diff`.
- **Worktree isolation:** integração — dois worktrees com estado de workflow independente, sem colisão.
- **E2E:** validação ponta-a-ponta num app piloto (ex.: mcp-server) com lint escopado rodando — em cópia/branch a partir de `origin/main`, **nunca in-place** sobre WIP.

## Não-objetivos (YAGNI)

- Multi-root nativo no dotcontext / fork.
- `.context/` distribuído por workspace (`apps/<app>/.context/`).
- Agents/skills/plans por app (permanecem globais nesta iteração).

## Riscos e mitigação

- **Drift do manifesto vs realidade** → validação de integridade no sync/doctor (já provada).
- **Mudança em `.context/workflow/` (gitignored) quebrar fluxos atuais** → migração explícita + nota no `update migration`.
- **Resolução de app-atual errada** → fallback por arquivos tocados + universal sempre presente (nunca sub-enforce o baseline).
```
