# DevFlow

> Pare de codar sem processo. DevFlow transforma o Claude Code em um time completo de engenharia — com planejamento, revisão, TDD, agentes especialistas e validação automática.

DevFlow é um plugin que conecta [superpowers](https://github.com/obra/superpowers) (disciplina, TDD, brainstorming) com [dotcontext](https://github.com/vinilana/dotcontext) (agentes, workflow PREVC, contexto do projeto) em um fluxo unificado.

Markdown puro + shell. Zero dependências de runtime. Funciona como plugin para Claude Code, Cursor, Codex e Gemini CLI.

---

## Destaques

- **Workflow PREVC** — 5 fases com gates automáticos: Planning → Review → Execution → Validation → Confirmation
- **Loop autônomo** — execução story-by-story com contexto fresco, escalação automática e retry inteligente
- **Modos de autonomia** — `supervised` (padrão), `assisted` (humano nas pontas), `autonomous` (loop completo com safety net)
- **TDD obrigatório** — RED → GREEN → REFACTOR em TODOS os modos, com HARD-GATE bloqueante
- **21 agentes especialistas** — architect, product-manager, business-context, product-context, engineering-context, operations-context, backend, frontend, security-auditor, memory-specialist e mais
- **46 skills** — API design, refactoring, debugging, test generation, security audit, PRD generation, stack-filter, memory-recall, import-reversa, odoo-l10n-br, odoo-nxz-overlay...
- **ADRs como guardrails** — 6 templates (SOLID, TDD, Code Review, Layered, OWASP, AWS Data Lake) com compliance check no Validation
- **Napkin + MemPalace** — runbook local curado + memória semântica persistente opcional
- **Escala adaptativa** — auto-detecta complexidade e ajusta o fluxo (QUICK/SMALL/MEDIUM/LARGE)
- **PRD generation** — entrevista socrática, RICE scoring, roadmap faseado
- **Suporte a projetos existentes** — `--from-prd` converte PRD em stories.yaml, upgrade de autonomia mid-workflow
- **3 modos de operação** — Full (MCP), Lite (.context/), Minimal (standalone)
- **Multilíngue** — en-US, pt-BR, es-ES
- **208 testes automatizados** — unit, E2E, validação estrutural

---

## Arquitetura

```
┌──────────────────────────────────────────────────────┐
│                      DevFlow                         │
│          (skills + agents + hooks + gates)            │
├────────────────────┬─────────────────────────────────┤
│    superpowers      │          dotcontext              │
│    (disciplina)     │    (contexto + workflow)         │
├────────────────────┼─────────────────────────────────┤
│ brainstorming       │ fases PREVC                     │
│ TDD iron law        │ 21 agentes via MCP              │
│ SDD (subagents)     │ análise semântica               │
│ code review 2x      │ gestão de planos                │
│ anti-racional.      │ sync multi-tool                 │
│ git worktrees       │ escala adaptativa               │
├────────────────────┴─────────────────────────────────┤
│              Funcionalidades exclusivas DevFlow       │
├──────────────────────────────────────────────────────┤
│ Loop autônomo (stories.yaml + contexto fresco/story) │
│ TDD HARD-GATE (RED→GREEN→REFACTOR, todos os modos)   │
│ Geração de PRD (product-manager + RICE + MoSCoW)     │
│ git-strategy gate (proteção de branch via hook)      │
│ checkpoint/rehydration (PreCompact + PostCompact)    │
│ context-sync (/devflow:devflow-sync)                         │
│ roteamento de escala (QUICK/SMALL/MEDIUM/LARGE)      │
│ devflow-runner.mjs (safety net externo)              │
└──────────────────────────────────────────────────────┘
```

---

## Início Rápido

```bash
# 1. Instalar dependências (uma vez)
claude plugin install superpowers@claude-plugins-official --scope user
claude plugin marketplace add NEXUZ-SYS/devflow
claude plugin install devflow@NEXUZ-SYS --scope user

# 2. Inicializar no projeto
cd meu-projeto && claude
/devflow init

# 3. Começar a trabalhar
/devflow add autenticação com OAuth
```

Para instruções detalhadas de instalação, configuração e uso completo, veja o **[Manual do Usuário](docs/tutorial-setup.md)**.

---

## Documentação

| Documento | Conteúdo |
|-----------|----------|
| **[Manual do Usuário](docs/tutorial-setup.md)** | Instalação, configuração, fluxo completo, exemplos por escala, troubleshooting |
| **[Guia ADR/Standards/Linter](docs/guia-rapido-adr-standards-linter.md)** | Referência de uso da camada de contexto: quando criar cada artefato, encaixe no PREVC, troubleshooting |
| **[/devflow help](commands/devflow.md)** | Referência completa de comandos (também acessível via `/devflow help` no Claude Code) |
| **[Skills Map](references/skills-map.md)** | Mapa completo de skills nos 3 sistemas (DevFlow, superpowers, dotcontext) |

---

## Compatibilidade

| Ferramenta | Subagents | MCP | Hooks |
|------------|:---------:|:---:|:-----:|
| **Claude Code** | Completo | Completo | Completo |
| **Cursor** | Sequencial | Completo | Completo |
| **Codex** | Completo | -- | -- |
| **Gemini CLI** | Sequencial | Completo | -- |
| **OpenCode** | Sequencial | Completo | -- |

---

## Rodando no omp (oh-my-pi)

O DevFlow roda sob o **omp** via uma camada de extensão nativa (tool-gating,
compact e contexto dinâmico) que reaproveita os hooks bash existentes. Lance a
sessão pelo launcher `devflow omp` para contexto autoritativo desde o turno 1.

Detalhes de instalação, pré-requisitos e cobertura por subsistema:
[`docs/omp-integration.md`](docs/omp-integration.md).

---

## Context Layer (v1.0)

A partir da v1.0, o `.context/` ganha 4 dimensões novas que transformam o DevFlow de
"orquestrador de skills" em **harness completo** para projetos reais:

| Pasta/arquivo | Função | ADR |
|---|---|---|
| `.context/adrs/` | ADRs com path canônico (era `.context/docs/adrs/`); dual-read até v1.2 | ADR-001 |
| `.context/standards/` | Standards com tripla camada (Markdown + LLM frontmatter + linter sandboxed SI-4) | ADR-002 |
| `.context/stacks/` | Docs versionadas por library indexadas no store global do `docs-mcp-server` (`mcpIndexed` no manifest; refs `.md` são legado) | ADR-003 |
| `.context/permissions.yaml` | Gramática vendor-neutral deny → allow → mode → callback | ADR-004 |
| `.context/observability.yaml` | OTel GenAI semconv opt-in; `gen_ai.*` + `devflow.*` namespace | ADR-005 |
| `.context/.lock` | Hashes de conteúdo para reproducibility token | — |

**Comandos novos:**
```bash
devflow stacks scrape-batch --from-package    # bootstrap stack docs from package.json
devflow stacks validate                        # check artisanalRef integrity + SI-6 fence
devflow standards new error-handling           # scaffold std-<id>.md + linter template
devflow standards verify --strict              # fail CI on weak-standards
```

**Security invariants (SI-1 a SI-7)** aplicados: no `node -e` interpolation, `execFile`
sempre, URL allowlist (cloud metadata + RFC1918 + link-local + trailing-dot), linter
sandboxing (`.context/standards/machine/**` realpath gate), glob subset, snippet
sanitization (sha256 canary), hook sequencing.

**Filosofia de dependências:** zero npm deps em runtime. Seis primitivas in-house em
`scripts/lib/` substituem `micromatch`/`gray-matter`/`tiktoken`. OTel SDK é a única
exceção, lazy-loaded só com `observability.enabled: true`.

Ver `.context/adrs/00[1-5]-*.md` e `.context/plans/context-layer-v2.md` para o detalhe
de design e cobertura de testes (55 tests, 27 novos arquivos).

---

## Camada de Conhecimento DDC (v1.8)

A partir da v1.8, o `.context/` adota um layout DDC de 4 níveis que transforma o
contexto de projeto em **memória narrativa consultável** durante o PREVC.

### Árvore `.context/` com DDC

```
.context/
├── business/         # visão, ICP, métricas, glossário, compliance, modelo de negócio
├── product/          # visão, persona, tom de voz, design system, políticas
├── operations/       # runbooks, on-call, SLOs, infra configs
└── engineering/      # container único dos subsistemas técnicos
    ├── adrs/         # ADRs (path canônico re-canonicalizado de .context/adrs/ por ADR-006)
    ├── standards/    # standards tripla-camada (ADR-002)
    ├── stacks/       # pipeline artesanal de docs (ADR-003)
    └── templates/    # templates de scaffolding
```

**Por que `engineering/` como container:** garante que hooks e scripts lêem um
path determinístico; `context-paths.mjs` é o keystone — nenhum script hardcoda
paths, sempre consulta esse módulo.

### Os 4 mecanismos de contexto

| Mecanismo | Como usar | Quando usar |
|---|---|---|
| **Standards** | `devflow standards new <concern>` | Guardrails LLM para concerns operacionais (ex: `runtime-validation`) |
| **ADRs** | `/devflow:devflow-adr new` | Decisões de arquitetura com impacto duradouro |
| **Stacks** | `devflow stacks scrape-batch --from-package` | Docs de libraries consultáveis offline |
| **Knowledge** | `devflow:knowledge` skill (CREATE/AUDIT) | Narrativa de domínio (visão, ICP, personas, infra) |

O mecanismo **Knowledge** é novo na v1.8: a skill `devflow:knowledge` scaffolda
e audita docs narrativos em `.context/<layer>/` via CLI:

```bash
node scripts/devflow-knowledge.mjs new --type=<type-id> --name=<name> --project=<path>
node scripts/devflow-knowledge.mjs audit --name=<name> --project=<path>
```

### Os 4 agentes-curadores

Cada camada tem um agente responsável pela sua manutenção. Eles são o _front
door_ para escrita no `.context/` — nunca escreva nas pastas de camada
diretamente sem passar por um curador.

| Agente | Camada | Responsabilidade |
|---|---|---|
| `business-context` | `.context/business/` | Visão estratégica, ICP, métricas, glossário, compliance |
| `product-context` | `.context/product/` | Visão de produto, persona, tom de voz, design system, políticas |
| `operations-context` | `.context/operations/` | Runbooks, on-call, SLOs, configurações de infra |
| `engineering-context` | `.context/engineering/` | Arquitetura, subsistemas, roteamento de briefings técnicos |

### Migração do layout legado

Se o projeto usa o layout anterior (`.context/adrs/`, `.context/standards/`,
`.context/stacks/` na raiz do `.context/`), migre para o container `engineering/`:

```bash
/devflow update migration
# ou equivalente:
/devflow migration
```

O comando invoca `devflow:migration`, que reloca os subsistemas para
`.context/engineering/` e reescreve todas as cross-references sem perder histórico.

### Integração com PREVC e hooks

- **SessionStart** injeta `KNOWLEDGE_INDEX` — mapa de cross-references das camadas
  gerado por `scripts/lib/print-knowledge-index.mjs` — carregado 1x por sessão.
- **PreToolUse** injeta os corpos de knowledge relevantes ao arquivo em edição
  (`scripts/lib/print-knowledge-bodies.mjs`) — recuperação on-demand.
- **prevc-planning Step 1** usa o `devflow:knowledge-filter` para selecionar
  apenas os docs de camada relevantes à task antes de entrar no brainstorming.

**Compatibilidade com dotcontext:** os diretórios gerenciados pelo dotcontext
(`docs/`, `agents/`, `skills/`, `plans/`) não são tocados pelo DDC.

Ver `.context/engineering/adrs/006-context-layer-knowledge-ddc-v1.0.0.md` para
o design completo e rationale.

---

## Histórico de Versões

| Versão | Data | Destaques |
|--------|------|-----------|
| **1.23.0** | 2026-06-17 | Feat: **Sync provenance-aware** (`context-sync`/`project-init`). O sync deixa de pular cegamente todo artefato existente (regra "ausente"/`status: filled`) e passa a distinguir, por hash, **deploy intocado** (auto-atualiza para a versão nova do plugin) de **edição local real** (preserva + reporta) — para **skills e standards de profile** (agents seguem o fluxo `fillSingle`, fora). Nova lib determinística `scripts/lib/provenance-sync.mjs`: `resolveArtifacts` (profiles compostos → `{src,dest,framework}`), `decideArtifact` (7 linhas, incl. `pluginHash==null`), `applySync` **contido** (`isWithinDir` src⊂plugin/dest⊂`.context` + recusa de symlink + `refused`, report em paths relativos), CLI `apply`. Manifesto `.context/.provenance.json` (por projeto) + registry `assets/provenance/known-hashes.json` (270 hashes) gerado por **histórico de commits** (`gen-known-hashes.mjs`; git tags não servem — releases são commits), com `bump-version.sh --append` no release. Resolve o caso real: deploys antigos intocados (ex.: `odoo-development@1.19.1`) agora atualizam no sync. Segurança: testes RED de path-traversal + symlink. **22 testes da feature**; regressão do repo 396/396. |
| **1.22.0** | 2026-06-17 | Feat: **Artefatos Odoo multi-versão (12–18) em 3 camadas**. Os artefatos Odoo do plugin foram reestruturados separando framework genérico de conhecimento de empresa: **L1** (`odoo-development` + `frontend-specialist-odoo`) viram core genérico país-agnóstico cobrindo **Odoo 12–18** (frontend legacy widgets 12–14 → OWL1/2/3), com env desacoplado e grounding híbrido (tabelas + ponteiros `docs-mcp`/OCA); **L2** nova skill `odoo-l10n-br` (localização BR reutilizável: l10n_br/NFC-e/SEFAZ/DANFE, nomes OCA); **L3** nova skill `odoo-nxz-overlay` (arquitetura/grafo/bridges NXZ), implantada só em projetos NXZ via novo **`profiles/nxz.yaml`** que **compõe** sobre o profile odoo. `detect-framework.mjs` ganha detecção por `dirPrefixes`/`manifestContent` (match por chave, symlink-safe, cap anti-DoS) e `standardsWithOrigin` resolvendo a origem de cada std na composição. Standards NXZ (`oca-separation`, `fiscal-br-integrity`) migram p/ `profiles/nxz/`; demais 15 ficam genéricos no `profiles/odoo/`. Novo stack `backend/odoo.md` + wishlist 12–18. **Suíte de lint TDD** dedicada (8 critérios: cobertura de versão, env, separação de camadas, integridade estrutural, grounding, cross-refs, front-matter, integridade de profile). Env de projeto sai p/ `.context/odoo-project.md` (novo template). 75 testes do workflow + suíte do repo 330/330. |
| **1.21.0** | 2026-06-15 | Feat: **Importador Reversa → DevFlow** (skill `devflow:import-reversa` + comando `/devflow import-reversa <source>` + lib `scripts/reversa-import/`). Lê um projeto gerado pelo [Reversa](https://github.com/sandeco/reversa) e o **aterrissa** como projeto DevFlow executável com **fidelidade híbrida** (executar + preservar): deriva PRD faseado, ADRs, `plans.json`, esqueletos de plano e `stories.yaml` da **1ª onda** (decompõe o resto via `--from-prd`), e preserva os artefatos ricos originais linkados em `.context/imported/reversa/`. Arquitetura na fronteira do **IR** (parsers plugáveis → IR → emitters), pipeline puro + escrita não-destrutiva. **Pre-flight Readiness Gate** (triangula sinais; `state.json` não é gospel) e **Plan Consistency Validation** (7 checks) com reconciliação interativa. Confiança 🟦🟢🟡🔴 inline + `fidelity-report.md` (🔴 → stories "resolver lacuna"). Segurança: `toSlug`+`isWithinDir` (anti path-traversal), recusa de symlink na cópia, `stripInjection` (SI-6) no conteúdo de terceiro. Re-import não-destrutivo com manifesto de proveniência + diff por hash. **96 testes** (unit+integração+E2E contra fixture real em tmpdir; contratos validados contra `runner-lib`/`adr-frontmatter` reais); suíte do repo 329/329. |
| **1.19.0** | 2026-06-12 | Feat: **Integração ADR↔decisão cross-aware no PREVC**. O `Step 3.5` do `prevc-planning` passa a cruzar a decisão detectada com as ADRs já carregadas e oferecer **EVOLVE** (quando toca uma ADR existente), **CREATE** (quando não há) ou **silêncio** (quando alinhada) — antes só oferecia CREATE. Heurística de detecção suavizada para **3/4** (núcleo `não-trivial`+`afeta-stack` + ≥1 reforço `alternativas`/`guardrails`). Detecção estendida às fases pós-Planning: **Review** (ADR conflict gate plano×guardrail), **Execution** (captura passiva de decisões emergentes em `.context/workflow/.adr-pending.json`) e **Confirmation** (sweep em lote + seção no summary). Julgamento (LLM) separado da regra (lib testável): novos `scripts/adr-decision.mjs` (`evaluateSignals`/`decideAction`/`parseGuardrailsBlock`) e `scripts/lib/adr-pending.mjs` (envelope versionado, dedup com diacríticos). Fix: o git diff do `prevc-validation` passa a cobrir o path canônico `.context/engineering/adrs/`. 42 testes novos; suíte 882/882. |
| **1.18.0** | 2026-06-11 | Feat: **Distribuição dos stacks defaults (live-load + filtro por framework)**. Os 22 stacks default do plugin (`assets/stacks/`) passam a chegar a qualquer projeto **sem cópia**, espelhando o modelo de standards: novo `scripts/lib/stacks-loader.mjs:loadStacksMerged` (dual-source plugin+projeto, projeto vence por nome, respeita `.context/stacks.local.yaml` `disable:`); `scripts/lib/stacks-filter.mjs` detecta o(s) framework(s) por deps (`package.json`/`pyproject`/`go.mod`/`Cargo.toml` + alias map; `node` sempre c/ `package.json`; `harness-engineering`/`gemini` só por keyword). O índice do SessionStart (`context-index`) passa a listar só os stacks relevantes; novo skill **`devflow:stack-filter`** (on-demand no Planning, análogo a knowledge/adr-filter) + CLI. Novo subcomando **`devflow stacks eject <lib>`** (copia o `.md` narrativo p/ o projeto) e `scripts/lib/path-guard.mjs` (`isWithinDir` compartilhado, anti path-traversal). `project-init` documentado (live-load, não seeda). 26 testes novos; suíte 845/845, hooks 50/50. |
| **1.17.0** | 2026-06-10 | Feat: **Stacks defaults padronizadas + indexação no docs-mcp-server**. 25 docs DDC curados em `assets/stacks/<concern>/` (9 concerns) + `manifest.yaml` (`devflow-stack/v0`). 22 libs com doc oficial scrapeada no store global do `docs-mcp-server` (`mcpIndexed`, consultável via `search_docs`) + 3 `skipDocs` (postgres/harness-engineering/gemini). Conteúdo ancorado na fonte oficial (regra anti-fabricação). Notas no manifest: openai via host pós-redirect, mastra/shadcn em 2 passes. |
| **1.15.1** | 2026-06-10 | Fix: **gate de git não bloqueia mais auto-memory/napkin com `cwd` ausente**. O `hooks/pre-tool-use` negava escritas em arquivos não-projeto (auto-memory `~/.claude/projects/*/memory/*`, napkin `.context/napkin.md`) quando o evento chegava sem `cwd` (típico de `Write` fora do workspace) — a config resolvia p/ `""` e o deny de no-config disparava antes da exceção que emite `ask`. Exceção movida p/ antes do deny via helpers `is_nonproject_path`/`emit_ask_nonproject`; esses paths nunca mais recebem `deny` (no máximo `ask`). MemPalace é via MCP, não Edit/Write → nunca interceptado. `test-pre-tool-use.sh` 10→14 casos (RED→GREEN), sem regressão. |
| **1.13.1** | 2026-06-09 | Fix: **referências penduradas a `architect-specialist` → `architect`**. O nome canônico é `architect` (o que o dotcontext gera em `.context/agents/architect.md`; o DevFlow é bridge do dotcontext e não altera essa saída). `architect-specialist` era um fantasma vazado de templates de plano, deixando 3 skills (`prevc-review`/`prevc-planning`/`feature-breakdown`) referenciando um arquivo inexistente. Corrigidas as refs nesses skills + tabela de Agent Types em `templates/agents/scaffold.md`. Novo teste de regressão `test-bundled-agent-refs.mjs` (toda ref `.context/agents/X.md` tem fallback bundled). |
| **1.13.0** | 2026-06-09 | Feat: **Perfis de framework — seleção de agentes/skills por arquitetura**. O DevFlow passa a detectar o framework do projeto (a começar por **Odoo**) e ativar agentes/skills específicos automaticamente. Camada de dados `profiles/<framework>.yaml` (regras de detecção + `agents`/`skills`/`dispatchKeywords`) + detector `scripts/lib/detect-framework.mjs` (sem dependência nova — usa o `parseYaml` caseiro; busca `__manifest__.py`/`__openerp__.py` na árvore + deps em `pyproject.toml`/`requirements.txt`). `project-init` e `context-sync` passam a **unir** os agentes do perfil às tabelas base e a **copiar** as skills de framework para `.context/skills/`; `agent-dispatch` ganha discovery dinâmico (frontmatter `agentType`) + roteamento por `dispatchKeywords`. Agente `odoo-specialist` saneado para **template genérico** (ref quebrada `architect-specialist`→`architect` corrigida; paths/DBs/portas NXZ → placeholders preenchidos no init). Extensível a Rails/Django/etc. só adicionando um perfil. 11 testes (detecção, integridade referencial dos perfis, anti-leak do template). |
| **1.12.0** | 2026-06-08 | Feat: **Suporte ao runtime omp (oh-my-pi)** — camada aditiva (Opção B, sem fork) que torna o DevFlow cidadão de 1ª classe no omp. Launcher `devflow omp` (`scripts/omp-launch.mjs`) injeta contexto autoritativo via system prompt (`--system-prompt` mínimo + `--append-system-prompt`, autoridade posicional do omp); extensão `omp/extension.mjs` faz wrap & reuse dos hooks bash via evento `context` + handlers `tool_call`/`tool_result`/compact. `permissions.yaml` enforçado nas 4 categorias (fs/exec/net/tool) via `evaluatePermissions`; git-guard bloqueia de verdade (fail-closed em deps ausentes); standards/ADR/knowledge/MemPalace/napkin/routines roteados; detection-hardening do MCP cobre config global do omp (`~/.omp/agent/mcp.json`). Subagents via `task` tool (worktree + output schema); model roles por fase (`omp-roles.yaml`); enrich aditivo de agentes pós-fill (Steps 0.5/4.6 no init); manifesto `omp.extensions` (`package.json`). 50 unit + 5 E2E sob omp real; 2 spikes (API + autoridade de injeção). Auditoria de segurança V: re-âncora de autoridade contra prompt-injection de conteúdo de projeto, rejeição de traversal, fail-closed do gate. Núcleo `.claude/` intacto (só +10 linhas aditivas no `session-start`). Docs: `docs/omp-integration.md`. |
| **1.11.2** | 2026-06-05 | Fix: **mensagem `OK:` do `scrape` + testes auto-fallback determinísticos**. `cmdScrape` em `scripts/devflow-stacks.mjs` imprimia `OK: undefined (...)` — `runPipeline()` foi refatorado p/ `{library,version,url,indexed}` e o consumidor lia o contrato antigo. Extraída função pura `formatScrapeOk` (via main-guard, unit-testada) → `OK: indexed <lib>@<ver> from <url>`; removido `projectRoot` ignorado da chamada. Os 2 testes "real network" frágeis (premissa de "URL ruim" obsoleta — a raw README indexa com sucesso agora) tornados determinísticos: falha via host `.invalid` (exit 1 garantido) + novo teste all-failed; o sucesso-via-fallback vira opt-in (`RUN_NETWORK_TESTS=1`). Suíte validation 806/806 (0 falhas; antes 2 "de rede"). |
| **1.11.1** | 2026-06-05 | Infra: **Reestruturação DDC do repo standalone + retarget do fetch** (ADR-007 v2.2.0). O repo `NEXUZ-SYS/devflow-standards` passa ao layout DDC (`.context/business\|product\|operations\|engineering/standards`), fonte canônica navegável; os 13 linters entram como **fonte** em `machine/` (mas seguem **bundled-only** — `update` nunca fetcha `.js`, anti-RCE). `scripts/update-default-standards.sh` retargetado para buscar os `.md` de `.context/engineering/standards/` via constante `STD_SUBPATH` (anti-traversal preservado). Migração é no-op fail-safe (plugin antigo → HEAD root 404 → sem reversão, provado por Test 7=AC2). +Test 6 (anti-RCE no novo path) + `docs/standards-standalone-sync.md` (sync `.js` release-time, byte-match). Suíte 25/25 + smoke real em PROD. |
| **1.11.0** | 2026-06-04 | Feat: **Enriquecimento dos standards default + expansão de linters** (ADR-007 v2.1.0). Os 20 std `.md` enriquecidos da fonte `framework_ddc/.contexts/engineering/` (regras lintáveis restauradas, formato operacional ≤~70 linhas). Enforcement de **linter de arquivo 4 → 13**: novos `data-modeling`, `schemas`, `observability`, `migration`, `performance`, `naming-conventions`, `runtime-validation`, `api-conventions` + novo std stack-scoped **`typescript-strict`**; os 4 originais estendidos. `applyTo` passa a incluir `**/*.sql` (data-modeling/migration/performance). Conventional Commits enforçável por canal **opt-in** `hooks/commit-msg-guard.mjs` (não conta nos 13). Cada linter passou FP bar (sample conforme + ReDoS < 2s). Testes: CURATED+extensões+ReDoS param, applyTo-routing, E2E sem eject (fixtures `.sql`), commit-msg-guard. Revalidação 22→20 registrada. |
| **1.10.0** | 2026-06-04 | Feat: **Enforcement nativo de standards default sem eject** (ADR-007 v2.0.0). Reverte a postura warn-only: defaults podem trazer linter **bundlado** (`assets/standards/machine/std-<id>.js`) executado pelo sandbox **SI-4 origin-aware** (2º allowlist root do plugin). Conjunto curado inicial (security-reviewed, baixo FP): `security`, `error-handling`, `test-discipline`, `secret-conventions`. `pluginRoot` trust-anchored por marker (`--plugin` do `BASH_SOURCE`, fail-closed); linters **bundled-only** (fetch só `.md` — anti-RCE). `eject --with-linter` traz o linter ao projeto; plain `eject` anula. +8 suites de teste (incl. E2E pelo hook real, ReDoS guard). dotcontext intocado. |
| **1.9.5** | 2026-06-01 | Feat: **Biblioteca de Standards Default** — 20 arquivos `std-*.md` vendorizados em `assets/standards/` (16 universais + 4 condicionais, todos concern-first, `source: devflow-default`, warn-only). Portados das rules DDC: security, runtime-validation, error-handling, test-discipline, observability, performance, documentation, code-review, grounding, naming-conventions, migration, data-modeling, api-conventions, secret-conventions, schemas, commit-hygiene, accessibility, internationalization, caching, state-management. `MANIFEST.txt` de 20 linhas adicionado. Gate `tests/validation/test-default-standards-content.mjs` 3/3 PASS. |
| **1.8.0** | 2026-05-30 | Feat: **Camada de Conhecimento DDC** — `.context/` adota layout de 4 níveis (`business/`, `product/`, `operations/` + `engineering/` como container de `adrs/standards/stacks/templates`). Keystone `context-paths.mjs` centraliza paths canônicos; libs v2 (path-resolver, standards-loader, run-linter SI-4, manifest-stacks) refatorados. Novo mecanismo **Knowledge** (builder `devflow:knowledge` + `knowledge-loader`/`knowledge-audit` K1–K5 + taxonomia, incl. narrativa de engenharia D10). 4 **agentes-curadores** (business/product/engineering-roteador/operations-context, memória via MemPalace). Migração explícita `/devflow update migration` (idempotente, merge sem clobber). Carregamento no PREVC Planning (`knowledge-filter`) + hooks (SessionStart KNOWLEDGE_INDEX, PreToolUse corpos on-demand). Consolidação dos padrões de engenharia em Standards (taxonomia +5 concerns: architecture/contracts/process). ADR-006. dotcontext intocado (docs/agents/skills/plans). Self-repo migrado (dogfood). Agentes: 18 → 20. |
| **1.7.0** | 2026-05-30 | Feat(agents): porta dois agentes curadores DDC para o DevFlow — `business-context` (curador da camada `.context/business/`: vision, glossary, compliance, business-model, metrics, icp) e `product-context` (curador da camada `.context/product/`: vision, persona, tone-of-voice, design-system, policies). Memória via MemPalace (não file-based por agente); paths corrigidos para `.context/` (singular DevFlow); referências a projetos específicos DDC removidas; seção "Memória Persistente do Agente" substituída por seção "Memória" com MemPalace + napkin. Total de agentes: 16 → 18. |
| **1.6.0** | 2026-05-28 | Refactor (breaking, superfície de comando): **reverte o #24** e restaura o prefixo `devflow-` nos arquivos de comando. Os nomes curtos da 1.2.0 (`/devflow:status`, `/devflow:sync`, `/devflow:doctor`, etc.) colidiam com comandos nativos do Claude Code e de outros plugins; voltando a `commands/devflow-*.md` a invocação fica única (`/devflow:devflow-status`, `/devflow:devflow-doctor`, …). Dispatcher `/devflow <...>` inalterado. ~43 arquivos atualizados + texto de sugestão de routines no SessionStart. Mapping antigo→novo no CHANGELOG. |
| **1.5.0** | 2026-05-28 | Feat: **Context Doctor + Routines** — manutenção da saúde do contexto. `/devflow:devflow-doctor` (skill `doctor` + `scripts/doctor.mjs` + lib de checks plugáveis `scripts/lib/doctor.mjs`) diagnostica config de MCP inválida/comando fora do PATH, MCP desconectados, e saúde do MemPalace (wings órfãs `repo.*`, drift de índice HNSW) — propõe repairs com **dry-run + confirmação** (destrutivos nunca auto). Subsistema de **routines** file-based (`scripts/lib/routines.mjs` + `/devflow:devflow-routines` + `.context/routines.json`): agenda `Nd/Nw/Nm`, routine default `context-maintenance` (doctor a cada 7d); SessionStart **sugere** rodar quando vencida (1x/dia + snooze, espelhando `DOCS_MCP_RECOMMENDATION`) sem executar. `config` semeia `routines.json`. 31 testes novos (doctor/routines unit+CLI+session-start, com mocks/data injetada — nunca tocam palace/`.mcp.json` reais). **Fix herdado:** isolamento do teste post-merge (PATH só-coreutils, sem mempalace real) + limpeza das wings órfãs `repo.*` do palace. |
| **1.4.1** | 2026-05-28 | Fix(UX): o `config` skill agora **oferece** instalar o git hook de auto-mine ao final da configuração (Step 4.5, opt-in sim/não) quando mempalace está ativo com `autoMine: post-merge` — fecha o gap em que o flag default ficava setado mas inerte até o usuário rodar `/devflow:devflow-memory install-hook`. Continua não-intrusivo (pergunta antes de tocar no `.git/`). |
| **1.4.0** | 2026-05-28 | Feat: auto-mine do MemPalace via git hook `post-merge` — mantém a wing do projeto em sincronia com o estado integrado a cada merge/pull na branch protegida (cobre merges via terminal **e** via autoFinish). Novo `scripts/post-merge-mempalace.sh` (puro bash, não-bloqueante/background, fail-safe `exit 0`, branch-guard, validação de `wing` contra injeção) + `scripts/install-git-hook.sh` (instala em `.git/hooks/`, idempotente, **no-clobber** de hook alheio). Exposto via `/devflow:devflow-memory install-hook` (skill `memory-ops`); opt-in explícito controlado por `mempalace.autoMine: post-merge` (default; `off` desativa sem desinstalar) — `config` skill passa a gerar o flag. 16 testes (`tests/hooks/test-post-merge-mempalace.sh`, com mock mempalace + repo tmp, sem tocar palace real). Docs em `tutorial-setup` e `post-update-guide`. |
| **1.3.0** | 2026-05-28 | Feat+Fix: ativação do MemPalace corrigida e operacionalizada. MCP config agora usa o console script canônico `mempalace-mcp` (não `python -m mempalace.mcp_server`, que falha em sistemas só com `python3`); `tutorial-setup` troca o inexistente `mempalace mcp:install claude --local` por `claude mcp add mempalace -- mempalace-mcp`; `config` skill e `post-update-guide` documentam o fluxo `init → mine → wake-up`. Novo comando `/devflow:devflow-memory <mine\|wake-up\|status\|sweep\|sync>` (com `mine --convos` para sessões do Claude Code e `sync --apply` para poda) backed pela skill `devflow:memory-ops`, escopada à wing do projeto via `.context/.devflow.yaml`. |
| **1.1.1** | 2026-05-16 | Docs: novo `docs/guia-rapido-adr-standards-linter.md` — manual de referência da camada de contexto (ADR + Standards + Linter): anatomia dos 3 artefatos com snippets reais, árvore de decisão de quando criar cada um, fio condutor end-to-end (concern `runtime-validation`), encaixe no PREVC, mecânica do linter (`standards-loader` → `applyTo` → `run-linter` + sandbox SI-4), referência do subset de glob SI-5 e dos 7 checks de audit, troubleshooting. Reflete o modelo concern-first da 1.1.0. |
| **1.1.0** | 2026-05-16 | Feat: Standards desacoplados de ADRs (concern-first) — `standards-builder` v0.2 gera standards a partir de uma taxonomia de concerns operacionais (`skills/standards-builder/references/taxonomy-of-concerns.yaml`, 6 concerns iniciais) em vez de 1:1 por lib/ADR. FROM-CONCERN é o default; FROM-ADR vira legado com warning+log; novo modo MIGRATE transiciona std lib-centric → concern std com deprecação. 6 libs novas (`taxonomy-loader`, `concern-resolver` fuzzy-match, `standard-from-concern`, `standard-enrich`, `standards-search`). CLI ganha `new --concern`, `--enrich-from-adr`, `search --by-guardrail`/`--by-concern`, `new --migrate`. Audit ganha check S7 (lib-centric detection, WARN não-bloqueante). `adr-builder` Step 5e: hook reverso recomenda inject/create concern std pós-ADR. Fixes: `loadStandards` pula `deprecated:true`; PostToolUse matcher inclui `Edit`. 108 testes do refactor (unit+contract+integration+E2E). Spec/plan em `docs/superpowers/`. |
| **1.0.0** | 2026-05-06 | First stable release of the context layer foundation. v0.x → v1.0 marks the harness as production-ready across 5 platforms. Ships Gap 1-4: Standards (`.context/standards/` triple-layer + SI-4 linter sandbox), Stacks (`.context/stacks/` artisanal pipeline replacing Context7 SaaS), Permissions (`.context/permissions.yaml` vendor-neutral deny-first), Observability (`.context/observability.yaml` OTel GenAI semconv opt-in). 5 ADRs Aprovados (001-005). 7 security invariants (SI-1 to SI-7) enforced by tests. Zero runtime deps (6 in-house primitives replace micromatch/gray-matter/tiktoken; OTel single exception lazy-loaded). 55 tests (28 baseline + 27 new files). 4 audit rounds with 1 CRITICAL + 4 HIGH + 6 MEDIUM blockers — all fixed inline. ADR canonical path migrated `docs/adrs/` → `adrs/` with dual-read until v1.2. See CHANGELOG.md for migration recipe. |
| **0.13.3** | 2026-04-27 | Fix: invocações de scripts ADR (`adr-update-index.mjs`, `adr-audit.mjs`, `adr-evolve.mjs`) agora usam `${CLAUDE_PLUGIN_ROOT}/scripts/` em vez de `scripts/` relativo — bug crítico onde `/devflow adr:new` em projetos do usuário falhava silenciosamente porque os scripts vivem só no plugin install (`~/.claude/plugins/cache/...`), não no projeto; consequência: README/índice de ADRs não era regenerado e o LLM podia salvar o ADR em pasta errada por confusão de paths; novo HARD-GATE no preflight da skill `adr-builder` reforça (a) save **MUST** ir para `.context/docs/adrs/`, (b) scripts **MUST** ser invocados via `${CLAUDE_PLUGIN_ROOT}/scripts/...`, (c) falha do `adr-update-index.mjs` deve ser surfaced (não engolida); afeta `skills/adr-builder/SKILL.md` (12 sites), `skills/prevc-validation/SKILL.md` (3 sites), `commands/adr.md` (1 site); incident reference: usuário relatou que `/devflow adr:new` não regenerava o README e salvava em path divergente |
| **0.13.2** | 2026-04-27 | Fix: `project-init` agora cria `.context/skills/README.md` em todos os tiers (Step 4.5 obrigatório) explicando que skills genéricos do DevFlow vêm via plugin (não copiados ao projeto) e que esse diretório é só para skills específicos do projeto — fecha gap de UX em projetos green-field onde `.context/skills/` ficava vazio/inexistente e usuário pensava que init falhou; Step 7 (Report) atualizado com seção "Skills available" listando skills do plugin disponíveis + estado de `.context/skills/`; checklist renumerado (5 = Ensure skills README); workflow de projeto existente intacto (HARD-GATE de delegação para `context-sync` quando `.context/docs/` já existe não foi tocado) |
| **0.13.1** | 2026-04-27 | Fix: `prevc-confirmation` Step 4 (Finalize Branch) consulta `autoFinish` em `.context/.devflow.yaml` antes de invocar a skill genérica `superpowers:finishing-a-development-branch` — `autoFinish: true` agora executa direto via `gh pr merge --squash --delete-branch` + cleanup local (sem menu de 4 opções); `autoFinish: false`/ausente mantém comportamento atual; correção em nível de plugin (não memória local) para propagar config declarada do projeto a todas as sessões; incident reference: finalização da `feature/adr-system-v2` apresentou menu mesmo com `autoFinish: true`; 7/7 testes de regressão em `tests/validation/test-prevc-confirmation-autofinish.mjs` |
| **0.13.0** | 2026-04-25 | Feat: ADR system v2.1.0 — template com 12 hard rules e 7 categorias, nova skill `devflow:adr-builder` (modos CREATE/AUDIT/EVOLVE), lib Node de auditoria determinística (12 checks, sem dependências externas — apenas stdlib), integração ativa com `prevc-planning` (Step 3.5: ADR opportunity check), `prevc-validation` (Step 2.6: ADR Audit Gate) e `adr-filter` (suporte a schema v2 de 14 colunas + Kind filter); migração de ADRs 001/002 para v2.1.0 com fix de stringify ordering; comando dispatcher unificado, 4 evolve flows (patch/minor/major/supersede) com mitigações S1+S5; 78 arquivos / +7977 linhas; resolve 3 gaps bloqueantes da revisão de arquiteto; B7 (Suite D — subagent E2E harness) registrado como plan futuro |
| **0.12.1** | 2026-04-23 | Docs: adiciona `TEMPLATE-ADR.md` em `.context/templates/adrs/` — template em branco (frontmatter + secoes Contexto/Decisao/Alternativas/Consequencias/Guardrails/Enforcement/Relacionamentos/Evidencias) para criacao manual de ADRs ou uso em ferramentas externas (ex: claude.ai); README dos templates atualizado com secao "Template em Branco" |
| **0.12.0** | 2026-04-23 | Feat: skill `devflow:adr-filter` — seleciona apenas ADRs relevantes à task atual via filtragem semântica (task topics + stack resolution com fallback 2-tier); `prevc-planning` Step 1 agora invoca a skill em vez de dumpar todas as ADRs aprovadas; inclui helper `scripts/detect-project-stack.sh` (python/typescript/go/rust via pyproject.toml/package.json/go.mod/Cargo.toml) com 13 testes E2E; política aprovada por PoC: task menciona stack → usa; task não menciona → detecta filesystem; detecção vazia → inclui todas (precaução); plataformas (aws/terraform) exigem menção explícita — nunca incluídas por precaução |
| **0.11.1** | 2026-04-22 | Fix: `/devflow update` agora inclui Step 4c para atualizar skills externas via raw GitHub — napkin (blader/napkin) é puxado de `main` e sobrescrito em `~/.claude/skills/napkin/` com escrita atômica (`.new` + rename); fetch failure é silencioso (warning, não interrompe pipeline); só atualiza se a skill já estiver instalada localmente (nunca auto-instala); helper genérico `scripts/update-external-skill.sh` reutilizável para outras skills externas, 13 testes E2E novos |
| **0.11.0** | 2026-04-22 | Feat: session-start hook auto-injeta `<ADR_GUARDRAILS>` com regras SEMPRE/NUNCA/QUANDO de ADRs aprovadas em `.context/docs/adrs/` — guardrails passam a ser carregados 1x por sessão (cache-friendly), não mais dependentes de invocação explícita de `devflow:prevc-planning`/`context-awareness`; só ADRs com `status: Aprovado` são carregadas, drafts ignorados; 15 testes E2E novos (`tests/hooks/test-adr-context.sh`) |
| **0.10.10** | 2026-04-21 | Fix: wording do `MSG_HANDOFF_REMINDER` reforça que handoff é contínuo, não um gate pré-compact — PreCompact captura `handoff.md` automaticamente e PostCompact recupera após a compactação, sem interromper o trabalho ou o `/compact`; esclarece para o LLM que o update é incremental conforme avança, não uma ação bloqueante antes da compactação (3 idiomas) |
| **0.10.9** | 2026-04-21 | Fix: branch protection hook agora permite Edit/Write sob confirmação em auto-memory (`~/.claude/projects/*/memory/*`) e napkin (`.context/napkin.md`) em branches protegidas — emite `permissionDecision: "ask"` para arquivos não-projeto, evita bloqueio desnecessário em ajustes de memória/curadoria sem abrir brecha em código-fonte, i18n em 3 idiomas, skill `git-strategy` documenta a exceção, 13 testes novos |
| **0.10.8** | 2026-04-15 | Fix: `prevc-confirmation` agora tem Step 0 (WIP pre-check) como HARD-GATE — antes da pipeline de finalização, checa mudanças descommitadas fora do escopo da branch para evitar sweep acidental de WIP alheio no commit final |
| **0.10.7** | 2026-04-15 | Fix: MemPalace padronizado como pacote Python nativo (`pipx install mempalace`) — `/devflow update` agora atualiza MemPalace via pipx/pip (com detecção de npm legado e aviso), `post-update-guide` e `tutorial-setup` corrigidos, MCP config usa `python -m mempalace.mcp_server` |
| **0.10.6** | 2026-04-15 | Fix: `prevc-flow` agora tem HARD-GATE proibindo trabalho de planejamento no nível do orquestrador — Step 4 reforça delegação imediata para `devflow:prevc-planning` (que invoca `superpowers:brainstorming`), anti-patterns adicionados contra perguntas clarificadoras no orquestrador |
| **0.10.5** | 2026-04-10 | Fix: README update agora é Step 1 obrigatório na pipeline de finalização (prevc-confirmation) — alinhado com hook messages, HARD-GATE antes do bump e merge, anti-patterns reforçados, pipeline 9 steps sequenciais |
| **0.10.4** | 2026-04-10 | Fix: seleção de idioma agora é gate bloqueante no `/devflow init` — idioma definido ANTES de qualquer scaffold/instalação, dotcontext instalado com `--lang` no idioma correto, todo conteúdo gerado no idioma do usuário |
| **0.10.3** | 2026-04-09 | `/devflow update` agora mostra próximos passos de configuração após atualizar — detecta features não configuradas (MemPalace, dotcontext, Language, Git Strategy, etc.) e exibe comandos exatos de ativação, i18n em 3 idiomas |
| **0.10.2** | 2026-04-09 | Fix: pipeline de finalização de branch agora é explicitamente obrigatória e sequencial — mensagens de hook reforçam que NUNCA se deve pular etapas ou fazer merge antes de completar README/bump (3 idiomas) |
| **0.10.1** | 2026-04-09 | Fix: `/devflow update` despachava para `context-sync` em vez de rodar comandos de plugin — adicionada tabela de routing explícita no command skill |
| **0.10.0** | 2026-04-09 | Integração mempalace: memória semântica persistente para agentes — skill `devflow:memory-recall`, comando `/devflow:devflow-recall`, agente memory-specialist, auto-recall no SessionStart (detecta MCP mempalace), diary flush/rehydration nos hooks PreCompact/PostCompact, diary de handoff no PostToolUse, entrevista de config mempalace no `/devflow init`, sanitização de segurança em valores YAML, referências em skills-map e docs |
| **0.9.5** | 2026-04-05 | Napkin: memória persistente de aprendizado baseada em [blader/napkin v6.0.0](https://github.com/blader/napkin) — skill `devflow:napkin` com runbook curado (.context/napkin.md), injeção no SessionStart, curadoria no PreCompact, re-injeção no PostCompact, nudge em falhas no PostToolUse, categorias híbridas (4 fixas + agent-specific notes), caps 15/7, 103 testes |
| **0.9.1** | 2026-04-04 | Fix: version bump nunca é pulado na finalização de branch — Step 1 (Version Bump) no prevc-confirmation antes do merge, hook PostToolUse detecta `gh pr merge`/`git merge` via Bash e injeta BUMP WARNING, 240 testes |
| **0.9.0** | 2026-04-03 | Sistema de ADRs como guardrails para IA: 6 templates organizacionais (SOLID, TDD, Code Review, Layered Architecture, OWASP, AWS Data Lake), entrevista de stack no `/devflow prd`, recomendação e instanciação automática de ADRs, leitura de guardrails no Planning, compliance check no Validation, suporte em context-awareness e context-sync, 252 testes |
| **0.8.0** | 2026-04-03 | Hook PostToolUse com commit prompt e finalização de branch automática: pergunta "Quer commitar?" após tasks, "Quer finalizar a branch?" com pipeline completa (README, bump, push, merge), comportamento adaptável por autonomia (supervised/assisted/autonomous), detecção de capacidades do projeto, i18n em 3 idiomas |
| **0.7.1** | 2026-04-03 | prd-generation self-contained: templates alternativos (One-Page, Feature Brief, Agile Epic), frameworks de discovery e métricas (Hypothesis, OST, North Star, Feature Success Metrics), instrução de idioma para todo output, correção de referência quebrada no agente product-manager |
| **0.7.0** | 2026-04-02 | Loop autônomo (supervised/assisted/autonomous), TDD HARD-GATE em todos os modos, E2E obrigatório para auth/pagamentos, `--from-prd` para projetos existentes, upgrade de autonomia mid-workflow, context-sync workflow scope, devflow-runner.mjs (safety net), 208 testes |
| **0.6.3** | 2026-03-31 | `/devflow update` para atualizar tudo de uma vez, auto-detect de scope do plugin |
| **0.6.0** | 2026-03-30 | Suporte multilíngue (en-US, pt-BR, es-ES), seleção de idioma persistente, hooks e respostas traduzidos |
| **0.5.0** | 2026-03-29 | Reescrita do README e tutorial com guia completo de uso |
| **0.4.0** | 2026-03-28 | PRD generation com entrevista socrática e RICE scoring, checkpoint persistence, workflow files em branches protegidas |
| **0.3.0** | 2026-03-27 | Handoff system resiliente, branch protection gate, `/devflow:devflow-sync` para manter `.context/` atualizado |
| **0.2.0** | 2026-03-26 | 11 bridge skills, skills map unificado, project-init com scaffolding `.context/`, auto version bump |
| **0.1.0** | 2026-03-25 | Release inicial: workflow PREVC, 15 agentes, skills base, hooks SessionStart/PreCompact/PostCompact, git-strategy |

---

## Estrutura do Plugin

```
devflow/
├── commands/         # 11 commands: /devflow + 10 subcomandos (adr, dispatch, doctor, import-reversa, memory, next, recall, routines, status, sync)
├── skills/           # 44 skills (PREVC, bridge, on-demand, PRD, autonomous-loop, napkin, memory-recall, import-reversa)
├── agents/           # 20 playbooks de agentes (inclui memory-specialist, business-context, product-context, engineering-context, operations-context)
├── templates/        # Templates para scaffolding (stories-schema.yaml)
├── scripts/          # devflow-runner.mjs, runner-lib.mjs (safety net)
├── hooks/            # SessionStart, PreCompact, PostCompact, PreToolUse, PostToolUse, i18n
├── locales/          # Traduções (en-US, pt-BR, es-ES)
├── references/       # Mapa de skills + mapeamento de ferramentas por plataforma
├── tests/            # 208 testes (unit, E2E, validação estrutural)
├── .claude-plugin/   # Manifesto do plugin para Claude Code
└── .cursor-plugin/   # Manifesto do plugin para Cursor
```

---

## Licença

MIT — [NEXUZ-SYS/devflow](https://github.com/NEXUZ-SYS/devflow)
