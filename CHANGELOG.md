# Changelog

All notable changes to DevFlow are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [1.20.0] — 2026-06-13

### Added — Cobertura de Standards: gaps de concern fechados (3 eixos)

A partir da análise em `docs/research/standards-coverage-gap.md`, fecha os gaps entre a doutrina de
engenharia (`framework_ddc/.contexts/engineering/`) e os Standards default:

- **Taxonomy (Eixo B):** registra os concerns lintáveis `module-size`, `environment-config`,
  `git-workflow` e fecha o órfão `typescript-strict` em `taxonomy-of-concerns.yaml` (23→27 entries),
  tornando-a fonte única de verdade. Novo `tests/standards/taxonomy-consistency.test.mjs` enforça o
  trio `taxonomy ↔ .md ↔ MANIFEST ↔ machine` (5 checks, incl. `linter:null ⟹ enforcedBy/aviso`).
- **Standards do Eixo A (a taxonomy já os definia):** `std-layer-boundaries`, `std-domain-events`,
  `std-pre-commit-hygiene` (+ MANIFEST). `pre-commit-hygiene` é `enforcedBy: hook:pre-commit`
  (enforcement repo-level, não file-linter).
- **Enforcement do Eixo C (8 stds sem linter), roteado pelo veículo correto:** 5 file-linters SI-4
  novos via TDD (`internationalization`, `accessibility`, `documentation`, `layer-boundaries`,
  `domain-events`); `commit-hygiene → hook:commit-msg`; `code-review → ci:danger`
  (`references/danger-code-review.md`); `state-management`/`caching`/`grounding` permanecem
  `linter: null` com `enforcedBy` explícito documentado.

`machine/*.js` permanecem bundled-only (ADR-007 anti-RCE); sync ao repo standalone fica no release.
Suíte `tests/standards/` 37/37; regressão odoo-standards 200/200, taxonomy/profile validation verdes.

## [1.19.0] — 2026-06-12

### Added — Integração ADR↔decisão cross-aware no PREVC

O `Step 3.5` do `prevc-planning` deixa de oferecer apenas CREATE e passa a **cruzar** a decisão arquitetural detectada com as ADRs já carregadas (bloco `<ADR_GUARDRAILS>`), escolhendo a ação:

- **EVOLVE** quando a decisão contradiz/estende uma ADR existente (oferece `/devflow adr:evolve <name>`, com `evolveHint` sugerido).
- **CREATE** quando nenhuma ADR trata do tema (`/devflow adr:new --mode=prefilled`).
- **silêncio** quando a decisão já está alinhada com uma ADR aprovada.

A heurística de detecção foi suavizada de 4/4 para **3/4**: núcleo obrigatório (`não-trivial` **E** `afeta stack/arquitetura`) + **≥1 reforço** (`alternativas` **OU** `implica guardrails`).

A consideração de ADR foi estendida às fases pós-Planning:

- **Review** — novo *ADR conflict gate*: relê o plano contra os guardrails e sinaliza conflito plano×guardrail como BLOCK.
- **Execution** — captura passiva de decisões emergentes em `.context/workflow/.adr-pending.json` (efêmero, gitignored, não interrompe o loop).
- **Confirmation** — *ADR sweep*: varre os candidatos capturados + ADRs tocadas (via `resolveAdrPath`) e oferece evolve/create em lote; nova seção "ADRs criadas/evoluídas" no summary.

Arquitetura: o **julgamento** (sinais, relação) fica no LLM; a **regra** vira lib determinística e testável — `scripts/adr-decision.mjs` (`evaluateSignals`, `decideAction`, `parseGuardrailsBlock`) e `scripts/lib/adr-pending.mjs` (envelope `{schema:1}`, dedup com normalização de diacríticos). O opt-out `skip_adr_offer` passa a cobrir o workflow inteiro (Planning + sweep do Confirmation).

### Fixed

- O `git diff` do gate de auditoria de ADR no `prevc-validation` (Steps 2.5/2.6) passa a cobrir o path canônico `.context/engineering/adrs/`, que não era contemplado — a fase V não detectava ADRs tocadas no path real.

42 testes novos (unit + E2E determinístico da cadeia P→E→C + guard de referências dos SKILL.md). Suíte de validação: 882/882.

## [1.18.0] — 2026-06-11

### Added — Distribuição dos stacks defaults (live-load + filtro por framework) — Fase 7

Os 22 stacks default do plugin (`assets/stacks/`, v1.17.0) passam a chegar a qualquer projeto **sem cópia**, espelhando o mecanismo de standards (`loadStandardsMerged`): defaults vivem só no plugin, carregados via live-load, e um filtro narra o que é relevante ao framework detectado.

- **`scripts/lib/stacks-loader.mjs`** — `loadStacksMerged(projectRoot, pluginRoot)`: dual-source (plugin `assets/stacks/` + projeto `.context/engineering/stacks/`), projeto vence por nome de lib, respeita `.context/stacks.local.yaml` `disable:`. Anota `origin`/`concern`/`mdPath`.
- **`scripts/lib/stacks-filter.mjs`** — detecta deps do projeto (`package.json`/`pyproject.toml`/`go.mod`/`Cargo.toml`) e filtra via alias map (`tailwind`→`tailwindcss`, `vercel-ai-sdk`→`ai`, `postgres`→`pg|…`, `bigquery`→`@google-cloud/bigquery`, + frontmatter `package:`). Bordas: `node` sempre que houver `package.json`; `harness-engineering`/`gemini` nunca auto-incluídos (só por keyword no skill).
- **`scripts/lib/context-index.mjs`** — índice do SessionStart usa `loadStacksMerged` + filtro: lista só stacks relevantes; entradas `origin: project` sempre aparecem. Regressão do índice de standards preservada.
- **`skills/stack-filter/SKILL.md`** (`devflow:stack-filter`) + `scripts/lib/stacks-filter-cli.mjs` — filtro on-demand no PREVC Planning (análogo a `knowledge-filter`/`adr-filter`); emite `<STACKS filtered>` com ponteiros `mcp__docs-mcp-server__search_docs`. Integrado no `prevc-planning` Step 1.
- **`devflow stacks eject <lib>`** — copia o `.md` narrativo default p/ `.context/engineering/stacks/`. Novo `scripts/lib/path-guard.mjs` (`isWithinDir`) extraído e compartilhado com `devflow-standards.mjs` (containment SI, prefix-attack safe).
- **`project-init`** documenta o live-load (não seeda os 22).
- **Testes:** 26 novos (loader/filter/eject/path-guard/filter-cli/context-index-stacks), TDD RED→GREEN. Suíte 845/845 (0 falhas, 1 skip), hooks session-start 50/50. Pure `node:*`.

## [1.17.0] — 2026-06-10

### Added — Stacks defaults padronizadas (`assets/stacks/`) + indexação no docs-mcp-server

O plugin passa a versionar um conjunto de **stacks defaults** — docs narrativos de conhecimento (DDC) curados à mão, irmãos de `assets/standards/`. Cada `.md` descreve convenções, anti-patterns e uso-no-projeto de uma tecnologia (Next 16, React 19, Zod 4, etc.), com frontmatter `version`/`upstream`.

- **25 docs DDC** movidos para `assets/stacks/<concern>/` em 9 concerns (ai, backend, database, frontend, language, runtime, state, testing, validation) + `MANIFEST.txt`.
- **`assets/stacks/manifest.yaml`** (`spec: devflow-stack/v0`): liga cada lib por **nome** (não `artisanalRef`), declarando `mcpIndexed: true` (doc oficial indexada) ou `skipDocs: true`. Validado por `scripts/lib/manifest-stacks.mjs` (`validateManifest` → 0 erros).
- **Indexação via `devflow:scrape-stack-batch`** no store global do `docs-mcp-server`: **22 libs** com doc oficial scrapeada (`mcpIndexed`), consultáveis via `mcp__docs-mcp-server__search_docs`. Conteúdo ancorado na fonte oficial — nunca fabricado (regra anti-fabricação da skill).
- **3 `skipDocs`:** `postgres` (API estável), `harness-engineering` (disciplina, não-produto), `gemini` (crawler hostil — `.md` narrativo cobre).
- **Notas de scrape** (no manifest): `openai` exigiu o host pós-redirect (`developers.openai.com`); `mastra-sdk` indexado em 2 passes (`/guides` + `/docs`); `shadcn-ui` em 2 passes (`/docs/installation` + `/docs/components`) com `scope: subpages` para escapar do root `/docs/v0` derivado do sitemap.

## [1.16.0] — 2026-06-10

### Added — Patch incremental no `/devflow config` (Step 5)

Quando o `.context/.devflow.yaml` já existe, o skill `devflow:config` deixava só dois caminhos: **manter tudo** ou **reconfigurar tudo**. Faltava o meio-termo óbvio — adicionar só o que falta (ex.: a seção `grounding:` ou o `routines.json`) sem mexer no resto. Esta versão introduz o **patch incremental** como caminho padrão.

- **Painel de estado (5.1):** mostra TODAS as 9 áreas configuráveis — inclusive as ausentes (✅ configurado / ⬚ não configurado): estratégia git, branches protegidas, CLI de PR, branch protection, auto-finish, MemPalace (+ hook auto-mine), docs-mcp-server, doc-grounding e rotinas de manutenção.
- **Menu de 3 vias (5.2):** Patch incremental (recomendado) · Reconfigurar tudo · Manter como está.
- **Multi-seleção (5.3):** lista as 5 unidades configuráveis com as **ausentes pré-marcadas** — o default já é "só o que falta", mas é possível marcar uma área existente para alterá-la. Roda apenas os blocos de pergunta das unidades marcadas.
- **Merge não-destrutivo:** novo helper `scripts/lib/devflow-yaml-merge.mjs` (`mergeSection` + `topLevelKeys`) substitui-ou-anexa **somente** a seção alvo, preservando cabeçalho-comentário e demais seções verbatim. Nova regra no Step 3 proíbe regenerar o arquivo inteiro no modo patch. `routines.json` e `.mcp.json` permanecem não-destrutivos por construção.
- **Testes:** `tests/validation/test-config-incremental-merge.mjs` — 8 casos cobrindo anexar/substituir/ordem/normalização/validação. RED→GREEN. Suíte de validação 819/819.

## [1.15.1] — 2026-06-10

### Fixed — Gate de git bloqueava escrita de auto-memory/napkin com `cwd` ausente

O hook `hooks/pre-tool-use` negava (`permissionDecision=deny`, mensagem "DevFlow não está configurado") escritas em **arquivos não-projeto** — auto-memory (`~/.claude/projects/*/memory/*`) e napkin (`.context/napkin.md`) — quando o evento chegava com `cwd` vazio/ausente (caso típico de `Write` fora do workspace). A exceção que emite `ask` para esses paths estava posicionada **depois** do `deny` de no-config: com `cwd` vazio a config resolvia para `""`, o deny de no-config disparava primeiro e o caminho de exceção nunca era alcançado.

- **Fix:** a exceção de paths não-projeto passa a ser avaliada **antes** do deny de no-config, via helpers `is_nonproject_path` + `emit_ask_nonproject`. Auto-memory e napkin nunca mais recebem `deny` — no máximo `ask` (confirmação), independentemente de `cwd`/config/branch. Comportamento preservado: `ask` em branch protegida com `cwd`, allow silencioso em branch de trabalho, e `deny` mantido para código do projeto sem config.
- **MemPalace:** opera via MCP (`mcp__mempalace__*`), não via Edit/Write — nunca foi interceptado pelo hook; documentado no comentário do fix.
- **Testes:** `tests/hooks/test-pre-tool-use.sh` passa de 10 → 14 casos / 20 asserts (novos: cwd vazio/ausente para memory/napkin → `ask`; código do projeto + cwd vazio → ainda `deny`). RED→GREEN. Sem regressão em permissions/grounding/napkin hooks.

## [1.15.0] — 2026-06-10

### Added — Modo doc-grounding obrigatório (`.devflow.yaml`)

Flag **opt-in** que força afirmações sobre **stack externo** (lib/framework/API/versão) a virem **apenas** do MCP de documentação canônico — resposta ao incidente em que o `search_docs` deu timeout e o agente respondeu de memória de treino. Operacionaliza o `std-grounding` (prose-only) para conhecimento de stack. Registrado no **ADR-009**.

- **Config:** seção `grounding:` no `.context/.devflow.yaml` com `mode: off | docs-first | docs-only` (ausência = off). `docs-first` complementa com disclosure explícito; `docs-only` é estrito (fail-closed).
- **Enforcement em camadas** (separando máquina de diretiva, com honestidade de escopo — NÃO é trava nos pesos):
  - **Hard** — `hooks/pre-tool-use` nega `WebSearch`/`WebFetch` quando o modo está ativo (mecânica `permissionDecision=deny` do ADR-004). Ramo self-contained antes do gate Edit/Write — branch-protection inalterada (regressão provada).
  - **Diretiva** — `hooks/session-start` injeta `<GROUNDING_MODE>` com o protocolo: consultar o MCP → citar `lib@versão` → fail-closed (parar e declarar em `docs-only`; complementar com disclosure em `docs-first`).
  - **UX** — pergunta P10 no `/devflow config` (§2.5) gera a seção; detecta os servers `*docs*` e pede o canônico quando há mais de um. `project-init` herda via interview.
  - **Safety-net** — check `grounding-mcp` no `/devflow:devflow-doctor`: WARN se o `docsMcpServer` canônico não está no `.mcp.json` enquanto o modo está ativo (evita fail-closed silencioso).
- **Escopo:** só stack externo — raciocínio geral e código do próprio projeto (via Read/Grep, domínio do `std-grounding`) seguem livres. Gap residual documentado: `Bash curl/wget` não é coberto pelo web-block.
- TDD: `test-pre-tool-use-grounding.sh` (10/10), `test-session-start-grounding.sh` (6/6), `test-doctor.mjs` (+5). Regressão zero nos hooks (pre-tool-use 13/0, permissions all-pass, session-start e2e 18/18, unit 21/21).

## [1.14.0] — 2026-06-09

### Added — Standards default do Odoo (profile-scoped) com gate de série-alvo

Novo eixo de enforcement específico de framework: **17 Standards de desenvolvimento Odoo** (`std-odoo-*`) embutidos no plugin e ativados **somente em projetos Odoo** (detecção via `profiles/odoo.yaml`). Ao contrário dos ~21 Standards universais, estes são copiados para `.context/engineering/standards/` do projeto no `init`/`sync`, virando `origin:project` — o sandbox SI-4 anti-RCE do set universal permanece **byte-idêntico** (ADR-008).

- **Tier 1 (lint forte):** `std-odoo-naming-conventions`, `std-odoo-manifest-hygiene`, `std-odoo-orm-discipline`, `std-odoo-computed-fields`, `std-odoo-i18n`, `std-odoo-code-hygiene`, `std-odoo-version-api-hygiene`, `std-odoo-js-modules`, `std-odoo-qweb-escaping`, `std-odoo-test-discipline`.
- **Tier 2 (parcial/heurístico):** `std-odoo-module-structure`, `std-odoo-orm-performance`, `std-odoo-security`, `std-odoo-owl-patterns`.
- **Tier 3 (NXZ, `weakStandardWarning`):** `std-odoo-oca-separation`, `std-odoo-qweb-pdf-safety`, `std-odoo-fiscal-br-integrity`.
- Cada std é o trio prosa + frontmatter + linter `machine/*.js`, concern-framed, com fontes oficiais Odoo 12/17/18 + OCA `pylint-odoo` citadas (nenhuma inventada). Construídos via TDD (RED→GREEN), ~190 fixtures de linter.
- **Gate de série-alvo (v1.1.0 dos 4 stds 17/18-oriented):** `version-api-hygiene` (≥17), `js-modules`/`owl-patterns` (≥16), `qweb-escaping` (≥15) leem a série do `version` no `__manifest__.py` mais próximo e se auto-suprimem (exit 0) em módulos de série anterior — resolve o misfire em código Odoo 12 num repo 12+18. Sem manifest, rodam normalmente.

### Added — Wiring de Standards/stacks por perfil de framework

- `scripts/lib/detect-framework.mjs`: `loadProfiles` normaliza as chaves `standards`/`stacks`; `frameworkContributions` as agrega (retrocompatível — perfil sem as chaves → arrays vazios).
- `profiles/odoo.yaml`: `+standards` (os 17 ids) e `+stacks` (wishlist Odoo 12/17/18 com `discoveryHints` oficiais, `mcpIndexed`).
- `scripts/devflow-stacks.mjs`: novo subcomando `add --lib=<l> --version=<v> --discovery-hint=<url>` que semeia o manifest de stacks do projeto com entradas `mcpIndexed`.
- `skills/project-init/SKILL.md` e `skills/context-sync/SKILL.md`: passo de cópia dos Standards do perfil + seeding das stacks (idempotente; respeita `standards.local.yaml disable:`; não sobrescreve std customizado).
- ADR-008 `framework-profile-scoped-standards` (audit 13/13); plano em `.context/plans/odoo-profile-standards.md`; guia em `docs/odoo-profile-standards.md`.

## [1.13.2] — 2026-06-09

### Fixed — `scrape-stack-batch/SKILL.md` atualizado para a Fase B (store global docs-mcp-server)

O `SKILL.md` da skill `scrape-stack-batch` ainda descrevia o pipeline pré-Fase B (4 stages com `md2llm` + consolidação em `.context/stacks/refs/*.md` + fence SI-6), enquanto `scripts/pipeline.mjs` já implementava o fluxo moderno (2 stages, scrape recursivo direto no store global do `docs-mcp-server`, declaração `mcpIndexed: true` no manifest). Qualquer agente que invocasse a skill anunciava e tentava executar um pipeline que não existe mais.

- `skills/scrape-stack-batch/SKILL.md` (v0.2.0): reescrito para o fluxo Fase B — frontmatter (description + deps sem `md2llm`/`sanitize-snippet`), Fase D em 2 stages (RESOLVE → SCRAPE via `recursiveScrape`), consumo via `mcp__docs-mcp-server__*`, manifest `mcpIndexed`, comandos reais do CLI (`--auto-fallback`, `validate --strict`, `audit`, `discover-source`), anti-pattern reformulado (nunca fabricar conteúdo / `mcpIndexed` fantasma) e SI-6 marcado como legado.
- `scripts/devflow-stacks.mjs`: removido o flag `--mode=create|refresh|validate` (parseado mas nunca consumido — semântica da era refs/); mensagem do `discover-source` atualizada (o aviso "AVOID SPA" citava `md2llm`; `docs-mcp-server --scrape-mode auto` cobre SPAs via playwright). `parseArgs` exportada para teste.
- `README.md`: linha da tabela Context Layer (`.context/stacks/`) atualizada para o store global.
- Testes novos em `tests/scripts/test-devflow-stacks.mjs`: `parseArgs` não reconhece `--mode`; output do `discover-source` não menciona `md2llm`. Suíte stacks 42/42 (1 smoke gated).

## [1.13.1] — 2026-06-09

### Fixed — Referências penduradas a `architect-specialist` → `architect`

Correção de **referências quebradas pré-existentes** ao agente architect. O nome canônico é **`architect`** — é o que o **dotcontext** gera em `.context/agents/architect.md` (o DevFlow é bridge do dotcontext e não pode alterar essa saída) e o que o agente bundled (`agents/architect.md`) sempre usou. O nome `architect-specialist` era um **fantasma de nomenclatura** que vazou de templates de plano, deixando três skills com referências a um arquivo que nunca existiu:

- `skills/prevc-review/SKILL.md`, `skills/prevc-planning/SKILL.md`, `skills/feature-breakdown/SKILL.md` → passam a referenciar `.context/agents/architect.md`.
- `templates/agents/scaffold.md` (tabela de Agent Types) → corrigido para `architect`.

Novo teste de regressão `tests/integration/test-bundled-agent-refs.mjs`: toda referência `.context/agents/<name>.md` em qualquer skill/agent bundled deve ter um fallback `agents/<name>.md` (AC1). Suíte relacionada 12/12.

## [1.13.0] — 2026-06-09

### Added — Perfis de framework (seleção de agentes/skills por arquitetura)

O DevFlow passa a considerar a **arquitetura/framework do projeto** ao selecionar agentes e skills, em vez de usar apenas as tabelas genéricas de tipo de projeto. Primeiro framework suportado: **Odoo**.

**Camada de dados — `profiles/<framework>.yaml`.** Mapeamento data-driven: regras de `detect` (`files` na árvore + `manifestDeps` por manifesto) → `agents` + `skills` + `dispatchKeywords`. Adicionar suporte a um novo framework (Rails, Django, Next.js, …) é criar um perfil irmão — sem mudança de código. `profiles/odoo.yaml` detecta `__manifest__.py`/`__openerp__.py` e `odoo`/`openerp` em `pyproject.toml`/`requirements.txt`.

**Detector — `scripts/lib/detect-framework.mjs`.** API `loadProfiles` / `detectFrameworks` / `frameworkContributions` + CLI (`node scripts/lib/detect-framework.mjs <projectRoot>` → JSON). Sem dependência nova: perfis lidos pelo `parseYaml` caseiro de `frontmatter.mjs`. Walker com profundidade limitada (skip de `node_modules`/`.git`/`.context`/etc.).

**Wiring.** `project-init` (Step 3c-1/3c-3/3c-4) e `context-sync` passam a **unir** os agentes do perfil às tabelas base e a **copiar** os diretórios de skill do framework (`skills/<slug>/`) para `.context/skills/`. `agent-dispatch` ganha discovery dinâmico de agentes via frontmatter `agentType` (não só os 15 fixos) + roteamento Lite por `dispatchKeywords`.

**Template genérico do `odoo-specialist`.** O agente bundled foi saneado para distribuição: referência quebrada `architect-specialist` → `architect` corrigida; tabela "Ambientes de Desenvolvimento" com paths absolutos NXZ, nomes de DB e portas → placeholders preenchidos no `/devflow init`.

### Tests

11 testes de integração (`node --test`): detecção de framework (manifest/pyproject positivo, projeto Node negativo), integridade referencial dos perfis (todo agent/skill listado existe como arquivo) e anti-leak do template `odoo-specialist` (refs resolvem, sem paths/DBs NXZ). Fixtures em tmpdir — nenhum diretório versionado é mutado.

## [1.12.0] — 2026-06-08

### Added — Suporte ao runtime omp (oh-my-pi)

Camada **aditiva** (Opção B, sem fork, núcleo `.claude/` intacto) que torna o DevFlow cidadão de primeira classe no **omp** (oh-my-pi, agente de coding TS/Bun compatível com Claude Code).

**Mecanismo de contexto autoritativo (launcher).** `scripts/omp-launch.mjs` (`devflow omp`) roda o `session-start`, captura o contexto DevFlow e faz `exec omp --system-prompt "<bloco 0 mínimo>" --append-system-prompt "<contexto>" -e omp/extension.mjs "$@"`. Descoberta empírica (spike de autoridade, `omp/SPIKE-omp-api.md`): a autoridade no omp é **posicional** — só o bloco 0 do system prompt é obedecido; `before_agent_start.message` (role custom) e o evento `context` (role user) são apenas parciais. O combo system-prompt mínimo + append entrega autoridade preservando os defaults do omp.

**Extensão (`omp/extension.mjs`).** Wrap & reuse dos hooks bash existentes: `tool_call` (permissions 4 categorias via `evaluatePermissions` + git-guard via `pre-tool-use`, com bloqueio real `{block}`), `tool_result` (linter de standards + nudge + handoff guard ADR-006), compact (snapshot/rehidratação MemPalace), e evento `context` para contexto dinâmico intra-sessão. Libs puras: `translate-tool-event`, `parse-hook-output` (envelope JSON, stdout misto), `permissions-bridge` (shape plano, todas categorias), `resolve-cwd`, `run-bash-hook` (`{stdout, ok}`, fail-closed), `detect-runtime`.

**Integração & otimização.** Detection-hardening do MCP cobre config global do omp (`~/.omp/agent/mcp.json`/`.omp/mcp.json`) para modo Full + MemPalace. Seleção de runtime no `init` (Step 0.5, `detect-installed-runtimes`); enrich aditivo de agentes pós-fill (Step 4.6, `omp-enrich-agents`/`omp-enrich-project-agents` + `omp-roles.yaml` + schemas), respeitando o HARD-GATE de `filled`. Branch omp no `parallel-dispatch`/`autonomous-loop` (dispatch via `task` tool, worktree isolada, output schema). Model roles por fase (`pi/plan`/`pi/slow`/`default`/`pi/smol`). Manifesto `omp.extensions` (`package.json` mínimo, sem `version`). Docs: `docs/omp-integration.md`.

### Security

Auditoria de segurança da fase V: (1) **re-âncora de autoridade** no bloco 0 do launcher — conteúdo de fonte-de-projeto (napkin/ADR/knowledge), que é elevado ao tier de system prompt, é declarado como dado de referência não-autoritativo (anti prompt-injection); (2) rejeição de **path traversal** (`..`) em `translate-tool-event`; (3) **fail-closed** do git-guard quando o hook não pôde executar (deps ausentes). Controles SI-1/SI-4/SI-6, permissions deny-first e git-guard preservados (não burlados).

### Tests

50 testes unit/integração + 5 E2E sob omp real (autoridade, compact, git-guard, exec-deny, task-dispatch). TDD RED→GREEN em todas as tasks; 2 spikes empíricos (API de extensão + autoridade de injeção).

### Fora de escopo (YAGNI — fase futura)

Loop PREVC determinístico em TS, telemetria por story, renderers de TUI, roteamento dinâmico de modelo, fusão MemPalace↔Hindsight nativa.

## [1.11.0] — 2026-06-04

### Added/Changed — Enriquecimento dos standards default + expansão de linters (ADR-007 v2.1.0)

**Enriquecimento.** Os 20 standards default (`assets/standards/std-*.md`) foram enriquecidos a partir da fonte de verdade `framework_ddc/.contexts/engineering/`, restaurando regras determinísticas perdidas na condensação (mantendo o formato operacional ≤ ~70 linhas). Revalidação registrada em `docs/standards-revalidation-22to20.md`: dos 22 `.claude/rules`, 17 viraram std diretamente; 5 ficam em outras camadas (operations/git-strategy/meta); +3 std de outras fontes.

**Expansão de enforcement (4 → 13 linters de arquivo).** Novos linters bundlados curados (baixo FP, ReDoS < 2s, security-reviewed): `data-modeling` (TIMESTAMP sem tz / VARCHAR(n) / FLOAT em DDL), `schemas` (z.any()/.passthrough()), `observability` (console.log em runtime), `migration` (CREATE INDEX sem CONCURRENTLY / UPDATE sem WHERE / VACUUM FULL), `performance` (SELECT */OFFSET/key instável), `naming-conventions` (enum TS / boolean negativo), `runtime-validation` (process.env.X! non-null), `api-conventions` (verbo no path), e **`typescript-strict`** (novo std stack-scoped TS-only: any/enum/default-export). Os 4 linters originais foram **estendidos** (secret: `NEXT_PUBLIC_*KEY`/`console.log(process.env)`; error: catch-só-console.log; security: SQL string-interpolada; test: waitForTimeout/assert trivial).

**applyTo `.sql`.** `data-modeling`/`migration`/`performance` passam a casar `**/*.sql` — sem isso os linters SQL não disparavam em arquivos de migração reais.

**commit-hygiene.** Conventional Commits passa a ser enforçável por um canal **opt-in** `hooks/commit-msg-guard.mjs` (não é linter de arquivo; não conta nos 13).

**Testes.** test-default-linters (CURATED + extensões + ReDoS parametrizado sobre os 13), test-applyto-sql-routing, test-e2e-enriched-linters-hook (hook real sem eject, fixtures `.sql`), test-commit-msg-guard. ADR-007 evolui para **v2.1.0** (Aprovado; v2.0.0 → Substituído).

## [1.10.0] — 2026-06-04

### Changed — Enforcement nativo de standards default sem eject (ADR-007 v2.0.0)

**Reversão consciente da postura warn-only.** A ADR-007 evolui para **v2.0.0** (major): defaults PODEM trazer linter executável **bundlado no plugin** (`assets/standards/machine/std-<id>.js`), executado pelo sandbox **SI-4 origin-aware** (2º allowlist root `<pluginRoot>/assets/standards/machine/`). Um projeto que usa os defaults agora recebe enforcement **sem eject**.

**Conjunto curado inicial (baixo falso-positivo, security-reviewed):** `security` (dangerouslySetInnerHTML), `error-handling` (catch vazio — regex sem ReDoS), `test-discipline` (it/describe/test `.only|.skip`), `secret-conventions` (formatos de chave conhecidos: sk-/ghp_/AKIA/xox/AIza). Os demais seguem warn-only.

**Segurança.** `run-linter.mjs` usa `loadStandardsMerged(projectRoot, pluginRoot)` e resolve o linter pela **origem carimbada pelo loader** (project→`.context`, default→plugin), nunca `fm.origin`. `pluginRoot` é **trust-anchored** por marker `.claude-plugin/plugin.json` (preferindo `--plugin` do `BASH_SOURCE` do hook sobre o env `CLAUDE_PLUGIN_ROOT` envenenável; fail-closed se não-verificado). Linters são **bundled-only**: `update-default-standards.sh` busca só `.md`, nunca `.js` (invariante TCB anti-RCE, fixado por teste de regressão). As 5 verificações SI-4 valem para ambos os roots.

**`eject` repensado.** `eject <id> --with-linter` traz/cria o linter no `machine/` do projeto e religa `enforcement.linter` no caminho canônico; o plain `eject` **anula** o `enforcement.linter` (sem referência pendurada). O hook PostToolUse não gateia mais em `.context/standards`.

**Testes.** +8 suites (SI-4 origin-aware, runner merged, trust-anchor, CLI/hook wiring, linters default + FP bar + ReDoS guard, anti-RCE fetch, eject --with-linter, E2E pelo hook real). dotcontext intocado.

## [1.9.5] — 2026-05-31

### Added — Biblioteca de Standards Default de Engenharia

**Defaults plugin-bundled (warn-only, concern-first)** — O DevFlow passa a shippar ~20 standards default de engenharia vendorizados em `assets/standards/` (16 universais + 4 condicionais), portados das rules/contracts genéricas. `source: devflow-default`, `enforcement.linter: null` (warn-only) — guidance injetada just-in-time, sem complicar o sandbox SI-4. Contracts DB-específicos ficam de fora (vão para o subsistema de stacks).

**Carregamento just-in-time** — `standards-loader.mjs` ganha `loadStandardsMerged(projectRoot, pluginRoot)`: merge de 2 fontes (plugin-defaults + projeto, projeto vence por `id`), `disable:` via `.context/standards.local.yaml`, symlink-safe. Defaults entram no índice Stage-1 (`context-index.mjs` + gate do `session-start`) marcados `[default]`; o filtro por `applyTo`/task seleciona só os relevantes.

**Override por projeto** — `/devflow standards eject <id>` copia um default para `.context/engineering/standards/` (editável, linter opcional em `machine/`), com path-containment. Override por mesmo `id`; desligar via `disable:`.

**Manutenção ao vivo** — `/devflow update` Step 4d (`update-default-standards.sh`) refresca o snapshot via fetch https do repo standalone `NEXUZ-SYS/devflow-standards` (à la napkin), com HEAD-guard + host hardcoded + validação de MANIFEST (anti-traversal) + sanitização SI-6 dos corpos buscados + fail-safe offline. **Não** usa git submodule (quebra o install do plugin).

**Taxonomia** — +12 concerns em `taxonomy-of-concerns.yaml` (security, performance, documentation, grounding, migration, data-modeling, schemas, code-review, accessibility, i18n, caching, state-management). **ADR-007** registra a decisão (plugin-bundled + fetch, warn-only, eject; trust-boundary SI-6). dotcontext intocado.

## [1.8.0] — 2026-05-30

### Added — Camada de Conhecimento DDC (4 níveis, mecanismo knowledge, 4 curadores)

**Layout DDC no `.context/`** — O `.context/` adota 4 dimensões de conhecimento narrativo
(`business/`, `product/`, `operations/`, `engineering/`) separadas dos diretórios gerenciados
pelo dotcontext (`docs/`, `agents/`, `skills/`, `plans/`, que permanecem intactos).

**`engineering/` como container** — Os subsistemas técnicos (`adrs/`, `standards/`, `stacks/`,
`templates/`) migram para `.context/engineering/`, garantindo path determinístico para hooks e
scripts. `context-paths.mjs` é o keystone: nenhum script hardcoda paths. ADR-006 re-canonicaliza
o path de ADRs de `.context/adrs/` para `.context/engineering/adrs/` (refina ADR-001).

**Mecanismo Knowledge** — Nova skill `devflow:knowledge` (modos CREATE e AUDIT) scaffolda e
audita docs narrativos de domínio (visão, ICP, personas, infra). CLI:
`devflow-knowledge.mjs new --type=<id> --name=<name> --project=<path>` e
`devflow-knowledge.mjs audit --name=<name> --project=<path>`.

**4 agentes-curadores** — `business-context`, `product-context`, `operations-context` e
`engineering-context` são os front doors de escrita nas camadas de conhecimento. Os dois últimos
são novos (18 → 20 agentes). Os orquestradores `prd-generation`, `project-init` e `context-sync`
delegam para esses agentes em vez de invocar APIs inexistentes.

**Migração explícita** — `/devflow update migration` (alias `/devflow migration`) invoca
`devflow:migration` para relocar subsistemas legados para `engineering/` e reescrever
cross-references. É um comando explícito opt-in — nenhum hook move arquivos automaticamente.

**Integração PREVC + hooks:**
- SessionStart injeta `KNOWLEDGE_INDEX` via `print-knowledge-index.mjs` (1x/sessão, cache-friendly).
- PreToolUse injeta corpos de knowledge relevantes ao arquivo em edição via `print-knowledge-bodies.mjs` (Stage-2, on-demand).
- `prevc-planning` Step 1 usa `devflow:knowledge-filter` para selecionar docs relevantes à task.

**ADR-006** — `.context/engineering/adrs/006-context-layer-knowledge-ddc-v1.0.0.md` documenta
a decisão completa com guardrails SEMPRE/NUNCA/QUANDO.

**Não afetado:** diretórios dotcontext (`docs/`, `agents/`, `skills/`, `plans/`), hooks de
branch protection, pipeline PREVC de finalização, sistema de ADRs e standards existentes.

**Follow-up conhecido (T20):** hook anti-bypass que detecta edições diretas nas pastas de camada
sem passar pelo curador correspondente — registrado como plan futuro.

## [1.6.0] — 2026-05-28

### Changed (breaking, command surface only — reverte o #24)

Restaura o prefixo `devflow-` nos arquivos de comando. Os nomes curtos
introduzidos na 1.2.0 (`/devflow:status`, `/devflow:sync`, `/devflow:doctor`,
`/devflow:next`, etc.) colidiam com comandos nativos do Claude Code e de
outros plugins. Voltando a `commands/devflow-*.md`, a invocação fica
globalmente única.

**Mapping antigo → novo:**

| 1.5.x | 1.6.0 |
|-------|-------|
| `/devflow:adr` | `/devflow:devflow-adr` |
| `/devflow:dispatch` | `/devflow:devflow-dispatch` |
| `/devflow:next` | `/devflow:devflow-next` |
| `/devflow:recall` | `/devflow:devflow-recall` |
| `/devflow:status` | `/devflow:devflow-status` |
| `/devflow:sync` | `/devflow:devflow-sync` |
| `/devflow:memory` | `/devflow:devflow-memory` |
| `/devflow:doctor` | `/devflow:devflow-doctor` |
| `/devflow:routines` | `/devflow:devflow-routines` |

O dispatcher principal `/devflow <...>` (init/config/update/prd/language/scale)
não muda. Atualiza ~43 arquivos (commands, skills, docs, specs, tests, README)
e o texto de sugestão de routines no hook SessionStart.

## [1.2.0] — 2026-05-26

### Changed (breaking, command surface only — no data/config migration needed)

Command slugs renamed to drop the redundant `devflow-` prefix. Because the plugin is registered as `devflow`, Claude Code mounted each command as `/devflow:devflow-<verb>` (e.g. `/devflow:devflow-dispatch`), which duplicated the word. Renaming the source files in `commands/` shortens every invocation by 8 characters and matches the help text users were already seeing.

Mapping:

| Old (until v1.1.1) | New (v1.2.0) |
|---|---|
| `/devflow:devflow-dispatch` | `/devflow:devflow-dispatch` |
| `/devflow:devflow-next` | `/devflow:devflow-next` |
| `/devflow:devflow-status` | `/devflow:devflow-status` |
| `/devflow:devflow-sync` | `/devflow:devflow-sync` |
| `/devflow:devflow-adr` | `/devflow:devflow-adr` |
| `/devflow:devflow-recall` | `/devflow:devflow-recall` |

`/devflow:devflow` (the help/entry command) is unchanged — only the verb-style commands were renamed.

ADR subcommand syntax updated from `/devflow adr:new` to `/devflow:devflow-adr new` (space instead of colon) to match standard plugin command pattern.

Files renamed via `git mv` (history preserved):
- `commands/devflow-dispatch.md` → `commands/dispatch.md`
- `commands/devflow-next.md` → `commands/next.md`
- `commands/devflow-status.md` → `commands/status.md`
- `commands/devflow-sync.md` → `commands/sync.md`
- `commands/devflow-adr.md` → `commands/adr.md`
- `commands/devflow-recall.md` → `commands/recall.md`

`name:` frontmatter in each command file updated to the new short slug. Help text in `commands/devflow.md` and all 27 docs/skills/specs/tests references updated to the new invocation form. No aliases were added — old `/devflow:devflow-<verb>` commands are gone.

### Migration

No project state to migrate. Users running v1.1.1 should:
1. Run `/devflow update` (or the equivalent `claude plugin update`) to fetch the new plugin
2. Replace any muscle-memory shortcuts: `/devflow:devflow-status` → `/devflow:devflow-status`, etc.

---

## [1.0.0] — 2026-05-07

### Hotfix added pre-merge: ADR ↔ standards/stacks chain integration

User pushback during PR review: the 5 new artifact types (standards, stacks, etc.) existed but `adr-builder` did not surface them as follow-up actions after CREATE. Worse, naive "offer to create" would duplicate when N+1 ADRs touched the same domain. Resolved with a **dedup-aware graph integration**:

- **`scripts/lib/adr-chain.mjs`** — new lib with 3 lookup functions:
  - `findRelatedStandards(adr, projectRoot)` — Jaccard token match + stack-glob boost; returns top-3 candidates with scores OR `wouldCreate: <derived-id>` when no match. Already-linked standards (this ADR's slug already in `relatedAdrs`) are excluded so reruns are idempotent.
  - `extractStackMentions(adr)` — regex extracts `<lib>@<version>` (incl. `@scope/name@x.y.z`) only when `category: arquitetura`. Reuses `isSafeLibrary` check from input-resolver (rejects path-traversal-shaped names).
  - `findStackMatches(mentions, projectRoot)` — categorizes each mention vs `manifest.yaml`: `linked` (exact version match), `drift` (different version), `new` (absent), `skipped` (skipDocs:true).
  - `findStandardsLinkingAdr(adrSlug, projectRoot)` — inverse lookup for audit Check #13.

- **`scripts/adr-chain-suggest.mjs`** — CLI emitter, JSON or text format. Used by SKILL.md Step 5d.

- **`skills/adr-builder/SKILL.md` Step 5d** — dedup-aware chain offer post-CREATE: presents grouped options for standards (link existing / create new / pick from candidates) and stacks (link existing / refresh different version / scrape new). All opt-in — pular tudo é válido.

- **`scripts/adr-audit.mjs` Check #13** — soft warning ("Cobertura por Standard") when an Aprovado ADR has a `## Guardrails` section but no standard references it via `relatedAdrs`. Never blocks the gate — surfaces the "ADR rule never operationalized as runtime linter" gap visibly without forcing fixes.

- **17 unit tests** for `adr-chain.mjs` + 1 fixture-tolerance fix in `test-adr-audit.mjs` (skips Check #13 in fixtures that pre-date the addition).

Total tests: **56 PASS / 0 FAIL** (was 55 before hotfix).

---

## [1.0.0] — 2026-05-06

**First stable release of the DevFlow context layer foundation.**
v0.x → v1.0 marks the harness as production-ready across 5 supported
platforms (Claude Code, Cursor, Codex, Gemini CLI, OpenCode).

This release ships the full Gap 1-4 work tracked in
`.context/plans/context-layer-v2.md` (48 task groups, 215+ steps, 5 weeks
of design + execution under PREVC supervised mode):

### Headline changes

- **Semana 0** — ADR canonical path migrated `.context/docs/adrs/` →
  `.context/adrs/` with dual-read transitional support (removed in v1.2)
- **Gap 1 — Standards** (`.context/standards/`): triple-layer (Markdown +
  LLM-readable frontmatter + executable linter sandboxed via SI-4)
- **Gap 2 — Stacks** (`.context/stacks/`): artisanal pipeline
  (`docs-mcp-server` CLI + `md2llm`) replaces SaaS dependency on Context7
- **Gap 3 — Permissions** (`.context/permissions.yaml`): vendor-neutral
  deny-first grammar (deny → allow → mode → callback)
- **Gap 4 — Observability** (`.context/observability.yaml`): OTel GenAI
  semconv + `devflow.*` extension namespace, opt-in default

### Security invariants (SI-1 through SI-7)

Every component built in this release is tied to one or more cross-cutting
security invariants enforced by tests:

- **SI-1**: No `node -e` with interpolated user-controlled strings (regression
  test grep)
- **SI-2**: External commands always via `execFile`, never shell
- **SI-3**: URL allowlist (cloud metadata, RFC1918, link-local IPv4/IPv6,
  ULA, trailing-dot bypass) — applied to scrape URLs, callback URLs, OTel
  exporter endpoints
- **SI-4**: Linter execution sandboxed (path normalization + allowlist +
  realpath + `execFile node` + 5s timeout)
- **SI-5**: Glob subset (`**`/`*`/`?`/`{a,b}` only) — schema validators
  reject negation/extglob at load time
- **SI-6**: Scraped content sanitization (strips role markers + ignore-
  instructions phrases + sha256 canary fence)
- **SI-7**: Hook sequencing (X.2 before 0.5; deny-first ordering)

### 5 ADRs (all Aprovado)

| ADR | Topic | Decision kind |
|---|---|---|
| 001 | ADR path migration to .context/adrs/ | firm |
| 002 | Standards triple-layer | firm |
| 003 | Stack docs artisanal pipeline | firm |
| 004 | Permissions vendor-neutral | firm |
| 005 | Observability OTel GenAI | gated |

### Dependency policy

DevFlow stays **dependency-free** at runtime. Six in-house primitives
under `scripts/lib/` (glob, frontmatter, token-estimate, url-validator,
sanitize-snippet, path-resolver) replace `micromatch` / `gray-matter` /
`tiktoken`. The OpenTelemetry SDK is the **single exception** —
lazy-loaded only when `observability.enabled: true`. `docs-mcp-server`
and `md2llm` are invoked via `npx -y` (not bundled).

### Test summary

- 28 baseline tests on `main` → **55 tests** on `feat/context-layer-v2`
  (+27 new test files; 1 smoke gated by `RUN_SMOKE=1`)
- 4 audit rounds (architect + code-reviewer + security-auditor) with
  14 review findings + 8 security findings — **all blocking items fixed
  inline** (1 CRITICAL + 4 HIGH + 6 MEDIUM)

### Known limitations (deferred to v1.1+)

- **Token budget enforcement (Gate 5)** — observability only in v1.0;
  enforcement awaits 2-3 sprints of telemetry data
- **Performance validation in self-repo** — devflow is a bridge plugin
  without application frameworks. Full V.4 perf benchmarks deferred to
  pilot project test fixture (`tests/fixtures/project-simulation/`,
  scaffolded but not populated to 50-ADR scale here)
- **PII scrubbing** is best-effort regex (emails, IPv4, long digits).
  PCI/PHI workflows must use external scrubbers (Datadog Sensitive Data
  Scanner) and/or keep `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT`
  disabled
- **OTLP exporter auth headers** — operators needing Datadog API keys etc.
  must set them via env vars in v1.0; first-class support in v1.1
- **`allow.tool: ["mcp__dotcontext__*"]` wildcards** — trusts MCP namespace;
  malicious user-installed MCP plugins could match. Lower impact (user-
  initiated install) but tracked for v1.1 docs
- **`parseInlineArray`** comma split breaks on `["a,b", "c"]` — real ADR/
  manifest patterns don't use quoted commas; v1.1 will switch to
  state-machine split

### Migration recipe (for projects on v0.13.x)

ADRs in legacy `.context/docs/adrs/`:

```bash
git mv .context/docs/adrs .context/adrs
grep -rln 'docs/adrs/' .context/ | xargs sed -i 's|docs/adrs/|adrs/|g'
node scripts/adr-update-index.mjs
git commit -m "chore(adr): migrate path from docs/adrs to adrs (devflow v1.0)"
```

Dual-read keeps v0.13.x projects working until v1.2 — migration is
opt-in until then.

---

## [1.0.0 development] — Semana 4 (Observability OTel) cumulative

> Mini-V/C entry per checkpoint policy. Security audit returned
> **PROCEED-WITH-CONSTRAINTS** (1 HIGH + 2 MEDIUM + 2 LOW); **all 5 items
> fixed inline before merge**. Final semana of Gap 1-4 work — release path
> (F.0a Aprovado batch + F.1-F.5) opens after this checkpoint.

### Added (Gap 4 — Observability OTel)

- **ADR-005** (`observability-otel-genai`, Proposto, audit 12/12 PASS):
  decision_kind `gated` (privacy + cost). 4 Drivers (standardization,
  replay, observability-before-enforcement, vendor-neutrality). Status
  flips to Aprovado in F.0a.
- **`.context/observability.yaml`** template:
  - `enabled: false` (default; opt-in)
  - 6 `gen_ai.*` + 12 `devflow.*` extension attributes captured
  - `gen_ai.prompt`/`gen_ai.completion` redacted by default
  - `contentCapture.envVar: OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT`,
    `redactPii: true`
- **`scripts/lib/otel.mjs`**:
  - `loadObservabilityConfig` / `validateObservabilityConfig` (now applies
    SI-3 to `exporter.endpoint` per HIGH audit fix — same denylist as
    `permissions-evaluator` callback URL)
  - `createSpan(cfg, name)` — no-op when disabled (zero overhead, no SDK
    loaded); lazy-loads `@opentelemetry/sdk-node` + `exporter-trace-otlp-http`
    on first use when enabled. OTel deps are the SINGLE exception to no-deps
    policy.
  - `initOtel(cfg)` — awaitable initializer (MEDIUM #1 fix: prevents
    first-N-spans-dropped in one-shot CLIs)
  - `redactAttribute` — drops attribute by name OR scrubs PII (email/IPv4/
    long digits) when `redactPii: true`
  - `isContentCaptureEnabled` — gated by env var
- **`scripts/lib/repro-token.mjs`**:
  - `computeReproToken({ model, params, lockHash, toolDefinitionsHash })`:
    sha256 of canonical JSON (key-order-independent)
  - `hashToolDefinitions(tools)`: sorts by name (or full canonical JSON
    when name absent — LOW fix, prevents anonymous-tool collision)
- **`scripts/lib/otel-cli.mjs`**: stdin emitter for hook invocation. Awaits
  `initOtel` before emitting span (MEDIUM #1 fix). SI-1 compliant. 1MB cap.
- **Hook integrations** (all guarded by `if [ -f .context/observability.yaml ]`):
  - `hooks/session-start`: emits `devflow.session_start` span at end
  - `hooks/pre-tool-use`: emits `devflow.permission.deny` span before exit
    on deny (uses `gen_ai.tool.name` per OTel GenAI semconv — LOW fix)
  - `hooks/post-tool-use`: emits `devflow.tool_use` span at end of every
    tool call

### Security fixes (inline, from Semana 4 audit)

- **HIGH** — SSRF parity gap on `exporter.endpoint`. Operator-supplied OTLP
  endpoint had only "is non-empty string" check; `permissions-evaluator`
  callback already enforces SI-3 denylist. **Fixed**:
  `validateObservabilityConfig` now rejects metadata IPs (169.254.0.0/16,
  fd00:ec2::254, metadata.* hostnames, instance-data.ec2.internal),
  RFC1918 (10/8, 172.16-31/12, 192.168/16), 0/8, IPv6 link-local
  (fe80::/10) and ULA (fc00::/7), and trailing-dot bypass. Allows
  `http://localhost` (dev pattern: Jaeger/Phoenix on :4318). 5 regression
  tests added.
- **MEDIUM #1** — first-N spans silently dropped due to fire-and-forget
  `ensureSdkInitialized`. **Fixed (path c)**: added `initOtel(cfg)`
  awaitable wrapper; `otel-cli.mjs` awaits it before `createSpan`. Hooks
  invoke the CLI as one-shot, so the latency is acceptable.
- **MEDIUM #2** — PII patterns miss IPv6, formatted credit cards, JWT/AWS
  keys, formatted phones. **Fixed (path b)**: ADR-005 guardrail wording
  downgraded to "best-effort PII scrubbing" with explicit guidance for
  PCI/PHI environments to use external scrubbers (Datadog Sensitive Data
  Scanner) and/or keep content capture disabled.
- **LOW** — `gen_ai.tool.call.id` set to tool name (broke OTel GenAI
  semconv correlation in Langfuse/Phoenix). **Fixed**: renamed to
  `gen_ai.tool.name` in both `pre-tool-use` and `post-tool-use` hooks.
- **LOW** — `hashToolDefinitions` collision when multiple tools lack
  `name`. **Fixed**: fallback to full canonical JSON as sort key.

### Tests

- 53 tests post-Semana 3 → **55 tests** post-Semana 4 (+2 test files: 17
  cases for otel.mjs incl. 5 SSRF regressions + 8 cases for repro-token.mjs).
  All passing. SI-1 still PASS (no `node -e` interpolation).

### Known limitations (tracked, not blocking)

- LOW: PII scrubbing is best-effort (regex-based). Production PCI/PHI
  workflows require external scrubber. Documented in ADR-005 + observability.yaml.
- LOW: `OTLPTraceExporter` without explicit auth headers — operators
  needing auth (e.g., Datadog API key) must add `headers` to
  `exporter` config; v1.1 will support this directly.

---

## [1.0.0 development] — Semana 3 (Permissions) cumulative

> Mini-V/C entry per checkpoint policy (option B). Security audit returned
> **PROCEED-WITH-CONSTRAINTS** with 2 HIGH + 2 MEDIUM + 3 LOW; **all 4
> non-LOW items fixed inline before merge**.

### Added (Gap 3 — Permissions vendor-neutral)

- **ADR-004** (`permissions-vendor-neutral`, Proposto, audit 12/12 PASS):
  documents the deny→allow→mode→callback grammar. 4 Drivers
  (portabilidade, auditabilidade, defense-in-depth, composability).
  Status flips to Aprovado in F.0a.
- **`.context/permissions.yaml`** template:
  - `spec: devflow-permissions/v0` with `evaluationOrder: [deny, allow, mode, callback]`
  - 17 fs deny patterns (env, .ssh, secrets, AWS creds, kubeconfig,
    terraform state, etc. — N4 expanded coverage)
  - 11 exec deny patterns (force-push variants, `curl|sh`, `rm -rf /*`, etc.)
  - 5 net deny patterns (cloud metadata IPs)
  - allow.fs.{read,write} + allow.exec + allow.tool wildcards
  - `mode: prompt` (default), `callback: { url: null }` (opt-in)
  - `claudeCodeCompat: { preserveGitStrategyHook, preserveBranchProtectionExceptions }`
- **`scripts/lib/permissions-evaluator.mjs`**:
  - `evaluatePermissions(event, cfg)`: order deny → allow → mode → callback
  - `validatePermissionsSchema(cfg)`: SI-5 (rejects extglob/negação on all
    glob fields) + SI-3 (callback URL denylist with link-local IPv4/IPv6,
    ULA, instance-data, trailing-dot — H2 fix)
  - `loadPermissions(projectRoot)`: parses YAML, calls validator,
    **fail-closed to mode:deny on schema errors** (M1 fix from audit)
  - `extractNetTargets(command)`: extracts URLs/hostnames from Bash
    commands so `deny.net` is enforceable at runtime (H1 fix)
- **`scripts/lib/permissions-cli.mjs`**: stdin wrapper for hook invocation
  (SI-1 compliant, 1MB stdin cap).
- **`hooks/pre-tool-use`** wiring: permissions check runs FIRST (before
  Edit/Write filter, before branch-protection). Uses event.cwd (not PWD)
  so user-project permissions.yaml is read correctly. Inline JSON
  escape via `python3 json.dumps`.
- **`skills/git-strategy/SKILL.md`**: new "Compatibilidade com
  permissions.yaml" section explaining defense-in-depth + roadmap of
  hook removal in v1.2.

### Security fixes (inline, from Semana 3 audit)

- **HIGH H1**: `deny.net` declared but never evaluated at runtime — cloud
  metadata IPs in YAML were silently ignored. Fixed by adding URL/hostname
  extraction from Bash commands + direct `event.url` field handling.
  3 regression tests added.
- **HIGH H2**: SI-3 sync regex check missed link-local IPv4 (169.254.0.0/16
  beyond just `.169.254`), IPv6 link-local (fe80::), ULA (fc00::/7),
  `instance-data.ec2.internal`, trailing-dot bypass. Extended denylist
  with all gaps + URL parser-based trailing-dot check. 5 regression tests.
- **MEDIUM M1**: `loadPermissions` previously accepted invalid configs (bad
  globs, extglob/negation) silently — leading to silent fail-open at match
  time. Now calls `validatePermissionsSchema` at load and returns
  `{...cfg, mode: "deny"}` (fail-closed) when errors found. 1 regression test.
- **MEDIUM M2**: `localhost:*/admin/*` deny rule was unreachable at runtime
  (subset of H1). Fixed by H1's URL extraction; rule now matches Bash
  commands invoking `curl http://localhost:...`.

### Tests

- 51 tests post-Semana 2 → **53 tests** post-Semana 3 (+2 new test files:
  18 unit cases for permissions-evaluator including 9 security regressions
  + 3 shell integration cases for pre-tool-use). All passing.

### Known limitations (tracked, not blocking)

- LOW: `allow.exec: ["npx *"]` permits arbitrary code via untrusted npm
  packages — by design (operator opts in); v1.1 docs guide will flag this.
- LOW: `allow.tool: ["mcp__dotcontext__*"]` wildcards trust MCP namespace —
  malicious user-installed MCP plugin could register `mcp__dotcontext__rce`
  and slip through. Lower impact (user-initiated install).
- LOW: `permissions-cli.mjs` swallows errors silently to avoid
  fail-closed-by-error. v1.1 will add stderr diagnostic logging.

---

## [1.0.0 development] — Semana 2 (Stacks) cumulative

> Mini-V/C entry per checkpoint policy (option B). Security audit by
> `devflow:security-auditor` returned REVISE with 1 CRITICAL + 1 HIGH +
> 2 LOW; CRITICAL (path traversal via library name) and HIGH (path
> traversal via artisanalRef) **fixed inline before merge**.

### Added (Gap 2 — Stacks + artisanal pipeline)

- **ADR-003** (`stack-docs-artisanal-pipeline`, Proposto, audit 12/12 PASS):
  documents the pipeline architecture with corrected CLI invocation
  (`docs-mcp-server fetch-url`, NOT `docs-cli` as in spec). 6 Drivers
  (determinism/latency/cost/resilience/governance/audit). Status flips
  to Aprovado in F.0a.
- **`.context/stacks/`** scaffolding: `manifest.yaml` stub + `refs/.gitkeep`
  + `llms.txt` template. DevFlow self-repo has no frameworks (bridge plugin)
  but the structure is in place for user projects.
- **`scripts/lib/manifest-stacks.mjs`**:
  - `loadManifest(projectRoot)` parses `.context/stacks/manifest.yaml`
  - `validateManifest(m)`: spec, framework version, applyTo glob subset
    (SI-5), AND `artisanalRef` must match `refs/<lib>@<version>.md` with
    no traversal/abs paths (Semana 2 audit HIGH fix)
  - `hashRef()` returns sha256 hex of ref file
  - `findMissingRefs()` detects declared refs without backing file
- **`scripts/lib/frontmatter.mjs` rewrite**: recursive `parseBlock()`
  unblocks arbitrary nesting depth (manifests, future permissions/observability
  configs). Also handles list-of-maps pattern (`- key: val` with continuation
  lines) for `wishlist` entries.
- **Skill `scrape-stack-batch/`**:
  - `scripts/input-resolver.mjs` (Fase A): `parseArgPairs` /
    `resolveFromPackage` / `resolveFromManifest` / `resolveAll` with SI-3
    URL validation. **All 3 input paths reject path-traversal library
    names** (Semana 2 audit CRITICAL fix).
  - `scripts/discovery.mjs` (Fase B): registry probes (npm/PyPI/crates.io),
    llms.txt HEAD probe, optional web_search fallback. **Triple-gated
    SI-3** — every URL passes `validateUrl` before being returned.
  - `scripts/confidence.mjs`: scoring per spec §3.4.4 (max() rule),
    classify by 0.8/0.6 thresholds (recommended/review/uncertain).
  - `scripts/pipeline.mjs` (Fase D): RESOLVE/SCRAPE/REFINE/CONSOLIDATE.
    All `npx` invocations via `execFile` (SI-2). SI-6 sanitization +
    sha256 canary fence wrapping output. Defense-in-depth library
    validation in BOTH `resolve()` AND `consolidate()` (Semana 2 audit
    CRITICAL fix).
  - `SKILL.md` + 2 templates (confirmation + error prompts).
- **`scripts/devflow-stacks.mjs`** CLI dispatcher:
  - `validate [<lib>] [--strict]`: schema + missing refs + SI-6 fence
    + ≥5 code blocks (md2llm sanity)
  - `scrape <lib> <ver> --source=<type> --from=<url>`: single-lib pipeline
  - `scrape-batch [args] [--from-package|--from-manifest] [--dry-run]`:
    plan + delegation to skill for interactive flow
- **`scripts/devflow-drift.mjs`** + **`.github/workflows/stack-drift.yml`**:
  nightly + on-PR drift detection. Opens GitHub issue (with dedup) on
  nightly drift; fails PR check on PR drift.

### Security fixes (inline, from Semana 2 audit)

- **CRITICAL**: Path traversal via library name (e.g.,
  `package.json` key `"../../../tmp/pwned"`) would have written
  consolidated `.md` files outside `.context/stacks/refs/`. Fixed by:
  (1) tightening `SLUG_RE` in `pipeline.mjs` to npm-spec
  (`@scope/`-optional + single segment, no `..`, no leading dots);
  (2) defense-in-depth re-validation in `consolidate()`;
  (3) `isSafeLibrary()` filter in all 3 input-resolver paths
  (`parseArgPairs`, `resolveFromPackage`, `resolveFromManifest`).
  Added 5 regression tests across input-resolver and pipeline suites.

- **HIGH**: Path traversal via `artisanalRef` (e.g., manifest
  `artisanalRef: "../../../etc/passwd"`) would have allowed arbitrary
  local file reads via `existsSync`/`readFileSync`. Fixed by adding
  strict `refs/<safe-chars>.md` regex check in `validateManifest()`.
  Added 4 regression tests in `test-manifest-stacks.mjs`.

### Tests

- 44 tests post-Semana 1 → **51 tests** post-Semana 2 (+7 new test
  files: confidence, discovery, pipeline, input-resolver, devflow-stacks,
  devflow-drift, manifest-stacks). 1 skipped (smoke pipeline gated by
  `RUN_SMOKE=1` env). 9 net regression tests added by security fixes.

### Known limitations (tracked, not blocking)

- LOW: `parseInlineArray` in frontmatter parser splits on comma —
  edge case `["a,b", "c"]` parses as 3 items. Real ADR/manifest
  patterns don't use quoted commas; documented constraint, fix in v1.1.
- LOW: GitHub Actions `actions/github-script@v7` interpolation — mitigated
  by parser-level rejection of backticks/`${` in framework keys (regex
  `[A-Za-z_][\w-]*`), but remains a defense-in-depth gap. v1.1 will
  switch to `core.getInput`-based pattern.

---

## [1.0.0 development] — Semana 1 (Standards) cumulative since 1.0.0-rc1

> Mini-V/C entry per checkpoint policy (option B). Final 1.0.0 release ships
> after all 4 Gaps + V/C task groups complete. Security audit by
> `devflow:security-auditor` returned PASS with 3 LOW + 2 INFO items (no
> blockers); LOW #1 (stdin size cap) fixed inline.

### Added (Gap 1 — Standards)

- **ADR-002** (`adopt-standards-triple-layer`, Proposto, audit 12/12 PASS):
  documents the architectural decision for standards as triple layer (Markdown
  + LLM-readable frontmatter + executable linter, with `weakStandardWarning`
  fallback). Status flips to Aprovado in F.0a.
- **`.context/standards/`** directory + `README.md` authoring guide (pt-BR)
  covering frontmatter spec, applyTo glob subset (SI-5), linter sandboxing
  (SI-4), 7 anti-patterns, and CLI usage.
- **`scripts/lib/standards-loader.mjs`** — `loadStandards(projectRoot)` parses
  frontmatter, validates applyTo against SI-5, marks weak standards.
  `findApplicableStandards(filePath, standards)` filters by glob match.
- **`scripts/lib/run-linter.mjs`** — SI-4 sandboxed linter runner:
  - 5 enforcement layers (format regex → forbidden chars → absolute path →
    sandbox prefix → realpath symlink check)
  - `execFile('node', [linter, file], { timeout: 5000, maxBuffer: 1MB })` —
    no shell, no `exec`
  - 11 unit tests + 3 RCE rejection shell tests (path traversal, abs path,
    shell metacharacters with canary file)
- **`scripts/lib/run-linter-cli.mjs`** — stdin wrapper for hook invocation.
  SI-1 compliant (no `node -e` interpolation). 1MB stdin size cap (security
  audit LOW #1 fix).
- **`scripts/devflow-standards.mjs`** — CLI dispatcher:
  - `new <id>` scaffolds `.context/standards/std-<id>.md` + linter template
  - `verify [<id>] [--strict]` validates applyTo subset, linter file existence,
    weak-standard warnings; `--strict` exits non-zero on weak standards
- **`hooks/post-tool-use`** integration: parses Edit/Write events from stdin,
  invokes `run-linter-cli.mjs` via JSON envelope, appends violations to the
  reminder context.
- **Frontmatter parser extended** (`scripts/lib/frontmatter.mjs`): handles
  non-empty inline arrays (`applyTo: ["src/**", "test/**"]`).

### Tests

- 39 tests post-Semana 0 → **44 tests** post-Semana 1 (+5 new test files,
  +25 test cases). All passing.
- Security regression: SI-1 (no `node -e` interpolation), SI-4 (3 RCE vectors
  rejected), SI-5 (glob subset enforced) — all PASS.

### Known limitations (tracked, not blocking)

- Weak-standard policy is non-blocking by default (security LOW). CI must
  invoke `devflow standards verify --strict` to enforce.
- `applyTo: ["**"]` would match dotfiles like `.git/`, `.context/`. Linters
  still sandboxed via SI-4, but standards using global patterns may produce
  noise. Tracking for v1.1 (`findApplicableStandards` exclusion list).

---

## [1.0.0-rc1] — 2026-05-06

Release candidate for **v1.0.0** — first stable release of the context layer
foundation. v0.x → v1.0 marks the harness as stable for production use across
the 5 supported platforms (Claude Code, Cursor, Codex, Gemini CLI, OpenCode).

This RC ships **Semana 0 (ADR path migration)** of the context-layer-v2 work.
Subsequent RCs will land Gap 1 (Standards), Gap 2 (Stacks), Gap 3 (Permissions),
Gap 4 (Observability) before the final 1.0.0 release.

### BREAKING (mitigated by dual-read)

- **ADR canonical path migrated** from `.context/docs/adrs/` to `.context/adrs/`.
  - All scripts (`adr-update-index`, `adr-audit`, `adr-evolve`) and the
    `hooks/session-start` hook now READ from both paths during the v1.0.x and
    v1.1.x transition window. Path is removed in **v1.2.0**.
  - Existing projects on legacy path continue working without changes.
  - SessionStart and `adr-audit` emit `LEGACY_PATH_DETECTED` warning when only
    legacy contributes ADRs.
  - `adr-evolve` migrates legacy ADRs to canonical path on `--apply`
    (transparent migration during patch/minor evolves).
  - **Migration recipe** for projects in legacy state:
    ```bash
    git mv .context/docs/adrs .context/adrs
    grep -rln 'docs/adrs/' .context/ | xargs sed -i 's|docs/adrs/|adrs/|g'
    node scripts/adr-update-index.mjs
    git commit -m "chore(adr): migrate path from docs/adrs to adrs (devflow v1.0)"
    ```

### Added

- **Security invariants (SI-1 through SI-7)** as plan-level constraints
  embedded in `.context/plans/context-layer-v2.md`:
  - SI-1: No `node -e` interpolation of user-controlled strings (regression
    test at `tests/hooks/test-no-node-e-interpolation.sh`)
  - SI-2: External commands always via `execFile`, never shell
  - SI-3: URL allowlist (`scripts/lib/url-validator.mjs`) — rejects cloud
    metadata, RFC1918, link-local, file://, and other SSRF vectors; defeats
    DNS rebinding by re-resolving hostnames
  - SI-4: Linter execution sandboxed (path normalization + allowlist + execFile
    + 5s timeout)
  - SI-5: Glob subset enforcement — schema validators reject negation (`!`) and
    extglob (`+(...)`/`@(...)`/etc.)
  - SI-6: Scraped content sanitization (`scripts/lib/sanitize-snippet.mjs`) —
    strips role markers + ignore-instructions phrases; wraps in fenced
    delimiter with sha256 canary
  - SI-7: Hook sequencing constraints (X.2 before 0.5; deny-first ordering)

- **In-house primitives** (no npm dependencies):
  - `scripts/lib/glob.mjs` — micromatch substitute (subset: `**`, `*`, `?`,
    `{a,b}`)
  - `scripts/lib/frontmatter.mjs` — gray-matter substitute (YAML subset,
    rejects anchors and references)
  - `scripts/lib/token-estimate.mjs` — tiktoken substitute (char-approx ±15%,
    sufficient for observability Gate 3 in v1.0)
  - `scripts/lib/url-validator.mjs` — SI-3 SSRF allowlist
  - `scripts/lib/sanitize-snippet.mjs` — SI-6 prompt-injection stripper
  - `scripts/lib/path-resolver.mjs` — Semana 0 dual-read helper
    (`resolveAdrPath`)

- **ADR template fields (optional, v1.0+)**:
  - `summary` field (Y-statement, ≤240 chars) — used by SessionStart in
    `<ADR_GUARDRAILS>` Stage-1 disclosure when present
  - `Drivers` section (omit if ≤2 forces) — for decisions with ≥3 concurrent
    forces

- **ADR-001** (Proposto): Migrate save path from `.context/docs/adrs/` to
  `.context/adrs/` with dual-read transitional support. Audit 12/12 PASS.
  Status flipped to Aprovado in F.0a after content stabilizes.

### Changed

- `skills/adr-builder/SKILL.md`: 9 path occurrences updated; HARD-GATE
  forbids legacy path explicitly (read-only via dual-read).
- 6 other skills (`adr-filter`, `prevc-validation`, `prevc-planning`,
  `prd-generation`, `context-sync`, `context-awareness`) updated to canonical
  path; readers (`adr-filter`, `prevc-planning`, `prevc-validation`) gained
  dual-read fallback notes.
- `scripts/adr-update-index.mjs`: scans both paths; writes README to
  whichever path contains ADRs (canonical wins on collision).
- `scripts/adr-audit.mjs`: emits stderr `LEGACY_PATH_DETECTED` when only
  legacy path exists.
- `scripts/adr-evolve.mjs`: migrate-on-write — patch/minor evolves move
  legacy ADRs to canonical path atomically via `git mv`.
- `hooks/session-start`: dual-path scan + N6 stderr warning when legacy
  contributes ADRs.

### Removed

- The 2 test ADRs (`001-tdd-python`, `002-code-review`) from the devflow
  self-repo `.context/docs/adrs/` — they were test data, not real architectural
  decisions about devflow itself. Numbering reset for v1.0 organizational ADRs.

### Tests

- 28 baseline tests → **40+ tests** after Semana 0 (12+ new across the in-house
  primitives, dual-read scenarios, and security regressions). All passing.

### Known Limitations (deferred to later RCs)

- Token budget enforcement (Gate 5) — observability only in v1.0; enforcement
  is roadmap v1.1+ once 2-3 sprints of telemetry are collected.
- Performance validation in self-repo not representative — full V.4 perf
  benchmarks run against `tests/fixtures/project-simulation/` (Task Group V.1
  in subsequent RCs).
- Standards (Gap 1), Stacks (Gap 2), Permissions (Gap 3), Observability
  (Gap 4) ship in subsequent RCs before final 1.0.0.

---

## [0.13.6] — Earlier

See git history for prior versions.
