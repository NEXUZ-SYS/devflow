# Design: Camada omp-aware do DevFlow

> **DevFlow workflow:** omp-integration | **Scale:** LARGE | **Phase:** P (Planning)
> **Data:** 2026-06-06 | **Autonomia:** supervised

## Objetivo

Otimizar o DevFlow para rodar como cidadão de primeira classe no **omp (oh-my-pi)** — sem fork, sem segunda base de código, sem tocar o núcleo `.claude/`. Foco em agentes e subagents: aproveitar o `task` tool nativo do omp (worktrees isoladas, output schemas, `spawns`), os model roles (`plan`/`smol`/`slow`/`commit`) e portar os hooks críticos para o modelo de extensões TS do omp.

## Contexto e premissas (resultado da pesquisa)

O omp é um agente de coding para terminal, fork do Pi, **deliberadamente compatível com Claude Code**: lê nativamente `.claude/agents`, `.claude/commands`, `.claude/skills`, MCP (`.mcp.json`) e o layout de marketplace de plugins Claude (`.claude-plugin/marketplace.json`). Logo, o DevFlow — distribuído como plugin Claude Code — **já carrega parcialmente** no omp via compat.

Três lacunas que o compat nativo **não** cobre, e que este design resolve:

1. **Hooks** — DevFlow usa bash + `hooks.json` (formato Claude Code). O omp espera extensões **TS/JS** (`pi.on(event)`). O `session-start` (detecção de modo, injeção do `using-devflow`, ADR guardrails, auto-recall MemPalace, prompts de autoFinish) **não roda** no omp.
2. **Dispatch de subagents** — `parallel-dispatch` e `autonomous-loop` usam o `Task` do Claude Code / `superpowers:dispatching-parallel-agents`. O omp tem o `task` tool nativo, muito mais rico: worktrees isoladas (`pi-iso`), `output` schema validado, `spawns` allowlist, `irc`, limite de concorrência, model role `smol` para fan-out.
3. **Model roles** — agentes do DevFlow não têm campo `model`; o omp roteia por roles (`default`/`smol`/`slow`/`plan`/`commit`).

**Decisão de escopo (aprovada):** Opção **B — camada omp-aware dual-target**. Aditiva, 1 base, sem fork. Captura ~80% do ganho do omp. Determinismo do loop em TS, telemetria por story, renderers de TUI e roteamento dinâmico de modelo ficam **fora de escopo** (registrados como possível fase C futura via ADR/PRD).

**Premissa de arquitetura do DevFlow:** o DevFlow é bridge de **dotcontext** (gera agentes personalizados por projeto em `.context/agents/`, via passo de *fill*) + **superpowers** (disciplina/TDD/brainstorming). Os `/agents/*.md` empacotados são fallbacks genéricos. Contrato de compat dotcontext: frontmatter v2 (`scaffoldVersion`, `type`, `name`, `status`, `generated`), headings fixos, e **`status: filled` nunca é sobrescrito**.

## Arquitetura

Camada aditiva no plugin; núcleo Claude Code intacto.

```
devflow/
├── omp/
│   ├── extension.ts            # bridge de hooks (wrap & reuse) + registros omp
│   ├── omp-roles.yaml          # mapa atividade → model role
│   ├── schemas/                # output schemas JTD (reviewer, validation, …)
│   │   ├── review-verdict.json
│   │   └── validation-verdict.json
│   └── lib/
│       ├── detect-runtime.mjs       # probe leve do runtime em execução
│       └── translate-tool-event.mjs # omp tool-event → shape JSON dos .mjs (pre/post)
├── .omp/                       # descoberta nativa do omp (manifesto)
├── scripts/lib/
│   └── omp-enrich-agents.mjs   # patch aditivo de frontmatter omp (pós-fill)
└── (núcleo inalterado: agents/, skills/, commands/, hooks/, .mcp.json)
```

### Unidades e interfaces

| Unidade | O que faz | Como se usa | Depende de |
|---|---|---|---|
| `omp/extension.ts` | Registra handlers `pi.on(...)`; em cada evento invoca o hook bash/.mjs equivalente e injeta a saída | Carregado pelo omp via manifesto `omp.extensions` | scripts em `hooks/` e `scripts/lib/` |
| `omp-enrich-agents.mjs` | Aplica patch **aditivo** de frontmatter (`model`/`spawns`/`output`/`thinking-level`) a agentes `.context/agents/*.md` já filled, preservando o corpo | Chamado por `project-init` (pós-fill), `config`, `context-sync` | `omp-roles.yaml`, parser de frontmatter |
| `omp-roles.yaml` | Mapa declarativo atividade→role | Lido pelo enriquecedor e pelos skills de fase quando em omp | — |
| `detect-runtime.mjs` | Identifica o runtime corrente (claude/opencode/omp) | Probe em sessão/dispatch para ramificar comportamento | env/processo |
| `translate-tool-event.mjs` | Extrai `{toolName, filePath}` do evento omp e emite o JSON no shape dos `.mjs` (pre/post) | Chamado pelos handlers `tool_call`/`tool_result` | — |
| `schemas/*.json` | Output schemas dos agentes de review/validation | Referenciados no frontmatter `output` e no `task` | — |

## Componentes em detalhe

### 1. Bridge de hooks (wrap & reuse)

`extension.ts` é fino: **não reimplementa lógica**, apenas adapta eventos do omp para os scripts existentes e injeta a saída.

| Evento omp | Reusa (existente) | Resultado |
|---|---|---|
| `session_start` | `hooks/session-start` (bash) | injeta modo + skill `using-devflow` + ADR guardrails + auto-recall MemPalace |
| `session_before_compact` | `hooks/pre-compact` | flush de diário MemPalace |
| `session_start` / `session_compact` | `hooks/post-compact` | rehidrata checkpoint de workflow |
| `tool_call` (matcher Edit/Write) | `hooks/pre-tool-use` | git-guard (branch protection, retorna `{block, reason}`) **+ knowledge on-demand Stage-2** (`<KNOWLEDGE_ONDEMAND>` por path) |
| `tool_result` | `hooks/post-tool-use` | prompts de autoFinish / commit + linter de standards + nudge + **PREVC handoff guard (ADR-006)** |

Contrato: a extensão captura stdout dos scripts e usa a API do omp para entregar o conteúdo. **A confirmar na fase 2 (risco aberto):** o mecanismo exato de injeção de contexto no `session_start` — candidatos identificados na pesquisa são o evento `context`, o `before_agent_start` e `appendEntry`/`sendMessage`. A 1ª tarefa da fase 2 valida qual API entrega paridade com o `additionalContext` do Claude Code. Falha de um hook não derruba a sessão (degrada com aviso).

#### Standards: ativação em dois pontos (session_start + post)

Os **Standards** (`.context/engineering/standards/std-*.md` + linters, ADR-007) são enforçados por **dois** caminhos de hook, e o bridge deve carregar ambos:

1. **`session_start`** — injeta o índice de standards + stacks via `scripts/lib/context-index-cli.mjs` (já coberto pelo evento `session_start` acima). Dispara quando o projeto tem `.context/standards` **ou** quando o plugin traz os defaults.
2. **`tool_result` (post)** — roda os linters dos standards aplicáveis via `scripts/lib/run-linter-cli.mjs` (SI-4 sandboxed) **mais** o *nudge* de standard/stack quando um arquivo coberto é tocado. Defaults do plugin aplicam mesmo sem `.context/standards`.

#### Camada de tradução de eventos de ferramenta (compartilhada)

Os scripts de tool-event hoje casam no vocabulário do Claude Code (`Edit|Write`) e leem o evento no **shape JSON do Claude Code** via stdin. No omp os nomes de ferramenta são outros (`edit`, `write`, `ast_edit`) e o payload (`tool_call`/`tool_result`) tem outra forma. Por isso a extensão expõe **uma única utilidade de tradução** (`omp/lib/translate-tool-event.mjs`) que extrai `{toolName, filePath, …}` do evento omp e emite o JSON no shape esperado pelos `.mjs`. Ela serve **quatro** consumidores:

| Lado | Consumidor | Script reusado |
|---|---|---|
| `tool_call` (pre) | git-guard (branch protection) | `hooks/pre-tool-use` |
| `tool_call` (pre) | **knowledge on-demand Stage-2** (corpos por path) | `print-knowledge-bodies.mjs` |
| `tool_result` (post) | **linter de standards** + nudge | `run-linter-cli.mjs` |
| `tool_result` (post) | **PREVC handoff guard (ADR-006)** | `hooks/post-tool-use` |

Mapeia `edit|write|ast_edit` ⇒ gatilho de Edit/Write (incluindo `ast_edit`, que o Claude Code não tem → ganho de cobertura). Sem essa tradução, **nem o linter de standards (post) nem o knowledge on-demand (pre) disparam** no omp. Vira tarefa própria na fase 2, com teste dedicado da tradução.

#### ADR/decisions e Knowledge (contexto de produto): paridade no omp

Ambos são **carregados por contexto** (não enforçados por linter), em pontos que o bridge já cobre via wrap & reuse:

**ADR/decisions** — dois pontos:
1. **`session_start`** — guardrails de ADR injetados (bash lê `.context/adrs/`; v1.0+). Coberto pelo evento `session_start`.
2. **`tool_result`** — PREVC handoff bypass guard (ADR-006). Coberto pela tradução de evento acima.
3. *(Planning)* skill `adr-filter` + `adr-chain.mjs` — roda via compat `.claude/` + node.

**Knowledge / contexto do produto sendo desenvolvido** — três stages:
1. **`session_start` (Stage-1)** — índice dos docs de knowledge (product/business/ops/eng) via `print-knowledge-index.mjs`. Coberto pelo `session_start`.
2. **`pre-tool-use` (Stage-2)** — corpos on-demand de docs relevantes ao arquivo tocado (`.context/product/` vision/persona/tone, `.context/business/`, …) via `print-knowledge-bodies.mjs`. Coberto pela tradução de evento (`tool_call` → path).
3. *(Planning)* skill `knowledge-filter` + `knowledge-loader.mjs` — docs `activation: always` (vision, glossary, persona, tone, design-system) + task-relevant. Roda via compat `.claude/` + node.

Conclusão: ADR e Knowledge **funcionam no omp** desde que o bridge cubra `session_start`, `tool_call` (Stage-2 knowledge) e `tool_result` (ADR handoff guard) — todos já no escopo. O único trabalho novo é a camada de tradução compartilhada (acima), que também habilita os standards.

#### Napkin, Routines e MemPalace: paridade no omp

Subsistemas restantes ligados a hooks, todos cobertos pelo wrap & reuse:

| Subsistema | Pontos de hook | Cobertura no omp | Trabalho novo |
|---|---|---|---|
| **Napkin** | `session_start` injeta `<NAPKIN_RUNBOOK>` (cria do template se faltar) | bridge `session_start` | nenhum |
| **Routines** | `session_start` roda `routines.mjs due` → `<DEVFLOW_ROUTINES_DUE>` | bridge `session_start` | nenhum |
| **MemPalace** | auto-recall (`session_start`) + snapshot (`pre-compact`) + rehidratação (`post-compact`) | bridge `session_start`/`session_before_compact`/`session_compact`; **servidor é MCP, nativo no omp** | detection-hardening (abaixo) |

**Detection-hardening (lacuna real, mais ampla que MemPalace):** a detecção em `session-start` procura MCP em `.mcp.json` e `~/.config/claude/mcp.json` (paths do Claude Code). O omp guarda config MCP global em `~/.omp/agent/mcp.json`. Se `mempalace` — ou `dotcontext`, que define o **modo Full/Lite** — estiver **só** no config global do omp, a detecção dá falso negativo (auto-recall e detecção de modo falham em silêncio). O `.mcp.json` de projeto (escrito pelo DevFlow) é lido pelos dois, então o caso comum funciona; a lacuna é config **global-only** do omp. Tarefa: estender a detecção de MCP (mempalace **e** dotcontext) em `session-start` para varrer também `~/.omp/agent/mcp.json` (e `.omp/mcp.json` de projeto). Mantém-se MemPalace via MCP; **não** se funde com o Hindsight nativo do omp (fora de escopo).

### 2. Enriquecimento omp dos agentes (pós-fill, aditivo)

Novo **Step 4.5** em `project-init`, executado **após o fill** (Step 4) e respeitando o HARD-GATE "nunca sobrescrever `filled`":

1. Para cada `.context/agents/*.md` (filled ou unfilled), derivar defaults omp a partir de `role` + `phases` usando `omp-roles.yaml`.
2. Propor ao usuário (entrevista) `model`/`spawns`/`output`/`thinking-level` por agente, com default pré-selecionado; usuário confirma ou ajusta.
3. Aplicar **somente como patch de frontmatter** (campos aditivos), preservando o corpo e os headings dotcontext.

A mesma sub-rotina (`omp-enrich-agents.mjs`) é reusada por:
- `devflow:config` — re-tunar depois da inicialização;
- `devflow:context-sync` — ao atualizar agentes já filled, mexe **apenas** nos campos omp.

Os `/agents/*.md` empacotados recebem **defaults omp aditivos** (template genérico), que o Claude Code e o dotcontext ignoram como campos extras.

### 3. Dispatch de subagents via `task` tool

`parallel-dispatch` e `autonomous-loop` ganham um **branch omp** (ativado quando `detect-runtime` reporta omp):
- despacho via `task` com **worktree isolada** (`pi-iso`), `output` schema validado e `spawns` allowlist do frontmatter do agente;
- fan-out de stories independentes com `model: smol` (custo↓), respeitando `blocked_by`;
- coordenação entre agentes vivos via `irc` quando necessário;
- **gates leem o JSON validado** do `output` (ex.: `{correctness, findings[], confidence}`) em vez de prosa.

Em Claude Code, o caminho atual (Task / superpowers) permanece inalterado.

### 4. PREVC → model roles (cobre sub-skills superpowers)

`omp-roles.yaml` indexa por **atividade**, não só pelas letras PREVC:

| Atividade | Role omp |
|---|---|
| `superpowers:brainstorming` (P) | `plan` |
| `superpowers:writing-plans` (P) | `plan` |
| Review profundo / architect / security-auditor (R, V) | `slow` |
| Execução TDD (E) | `default` |
| Fan-out de subagents (E) | `smol` |
| Confirmação / commit / docs (C) | `commit` |

Skills de fase consultam o mapa quando em omp; em Claude Code o mapa é inerte.

### 5. Seleção de runtime no init (multi-seleção)

Novo passo em `project-init`, **logo após o Step 0 (idioma)**:
1. Detectar runtimes instalados na máquina (`command -v claude`, `opencode`, `omp`).
2. Apresentar via `AskUserQuestion` **apenas os instalados**, multi-seleção, com o runtime corrente pré-marcado.
3. Gravar `runtimes: [...]` em `.context/.devflow.yaml`.
4. Ativar o que cada runtime escolhido exige (ex.: manifesto `omp.extensions` só se `omp` estiver na lista).

Em paralelo, `detect-runtime.mjs` faz um **probe leve em runtime** para confirmar qual está rodando agora e ramificar dispatch/hooks. Papéis distintos: opt-in explícito no setup × confirmação na sessão.

### 6. Distribuição & instalação

omp é compat com marketplace de plugin Claude. Documentar `/marketplace add NEXUZ-SYS/devflow` no omp e adicionar entrada `omp.extensions` no manifesto do plugin para a extensão TS carregar. **1 artefato** para os dois runtimes.

## Fluxo de dados

```
project-init
  Step 0  idioma  →  Step 0.5  seleção de runtime (multi)  →  Tier 1/2/3 scaffold
  →  Step 4 fill (dotcontext)  →  Step 4.5 enrich omp (aditivo, entrevista)

sessão omp
  session_start → extension.ts → exec(hooks/session-start) → pi.inject(contexto/modo)

execução (E) em omp
  autonomous-loop (branch omp) → task(agent, worktree, output schema, model:smol)
  → JSON validado → gate lê veredito → commit/escalona
```

## Tratamento de erros

- Hook que falha no omp: log + degradação graciosa (sessão continua sem o bloco injetado).
- `task` que falha/timeout: cai no fluxo de retry/escalonamento já existente no `autonomous-loop`.
- Frontmatter omp não reconhecido por Claude Code/dotcontext: **validado na 1ª tarefa do plano** (compat-check); se rejeitar, fallback para arquivos `.omp/agents/` gerados.
- `detect-runtime` ambíguo: default para comportamento Claude Code (mais conservador).

## Estratégia de testes (TDD obrigatório)

RED → GREEN → REFACTOR. Testes **reais** (unit + E2E), não content checks. E2E destrutivo só em tmpdir (cópia), nunca in-place.

- **Unit:** `omp-enrich-agents.mjs` (patch aditivo preserva corpo/headings; respeita `filled`); `detect-runtime.mjs`; parsing de `omp-roles.yaml`.
- **Unit:** `translate-tool-event.mjs` — extrai `{toolName, filePath}` de payloads `tool_call`/`tool_result` do omp; mapeia `edit|write|ast_edit`.
- **Unit:** detection-hardening — mempalace/dotcontext configurados só em `~/.omp/agent/mcp.json` são detectados (modo Full + auto-recall ativam).
- **Integração:** compat-check de frontmatter (Claude Code loader + dotcontext não rejeitam campos extras); manifesto `omp.extensions` descoberto; tradução de evento alimenta corretamente `run-linter-cli.mjs` (post) e `print-knowledge-bodies.mjs` (pre).
- **E2E (omp instalado):** `session_start` injeta contexto **+ índice de standards + guardrails ADR + índice de knowledge**; um Edit via omp (a) dispara o **linter de standards**, (b) injeta **knowledge on-demand Stage-2** (corpos de produto/negócio do arquivo tocado), (c) aciona o **PREVC handoff guard (ADR-006)**; `task` despacha em worktree e retorna JSON validado; seleção de runtime grava `.context/.devflow.yaml`. Se omp não estiver instalado no CI, marcar como skip explícito (sem mascarar).

## Faseamento

1. **Compat-check de frontmatter** (Claude Code + dotcontext) + `detect-runtime.mjs`.
2. **Bridge de hooks** — `session_start` (incl. índice de standards + guardrails ADR + índice de knowledge + napkin + routines + auto-recall MemPalace) primeiro, **com detection-hardening** (varrer `~/.omp/agent/mcp.json` e `.omp/mcp.json` para mempalace/dotcontext); depois compact (snapshot/rehidratação); depois a **camada de tradução de eventos** (`translate-tool-event.mjs`) servindo os quatro consumidores: git-guard + knowledge on-demand Stage-2 no `tool_call` (pre); linter de standards + nudge + PREVC handoff guard (ADR-006) no `tool_result` (post).
3. **Enriquecimento de agentes** — `omp-enrich-agents.mjs` + Step 4.5 no init + reuso em config/sync + seleção de runtime (Step 0.5).
4. **Dispatch via `task`** + output schemas (branch omp em parallel-dispatch/autonomous-loop).
5. **Model roles** (`omp-roles.yaml` consumido pelos skills) + distribuição/docs (`omp.extensions`, guia de install).

## Fora de escopo (YAGNI — possível fase C futura)

Loop PREVC determinístico em TS, telemetria por fase/story, renderers de TUI, roteamento dinâmico de modelo, fusão MemPalace↔Hindsight. Registrar como ADR/PRD se o uso real do omp provar necessidade.

## Critérios de sucesso

- DevFlow instalável e funcional no omp via 1 artefato.
- `session_start` injeta contexto/modo no omp (paridade com Claude Code).
- **Standards funcionam no omp com paridade:** índice injetado no `session_start` e linters disparados no `tool_result` para `edit`/`write`/`ast_edit`.
- **ADR/decisions funcionam no omp:** guardrails no `session_start`, PREVC handoff guard (ADR-006) no `tool_result`, `adr-filter` na fase P.
- **Knowledge / contexto de produto funciona no omp:** índice no `session_start`, corpos on-demand no `pre-tool-use` (por path), `knowledge-filter` (always-active + task) na fase P.
- **Napkin, Routines e MemPalace funcionam no omp:** napkin + routines via `session_start`; MemPalace via MCP nativo + recall/compact pelo bridge; detecção de MCP cobre config global-only do omp.
- Subagents despachados via `task` com isolamento e output estruturado; gates leem JSON.
- Agentes enriquecidos com roles/spawns/output sem quebrar Claude Code nem dotcontext.
- Seleção de runtime no init grava preferências e ativa só o necessário.
- Núcleo `.claude/` inalterado; testes reais passando.
