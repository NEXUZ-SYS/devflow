# Spec — `/devflow:doctor` (Context Health Doctor) + Routines

> **Status:** Aprovado (Planning) · **Data:** 2026-05-28 · **Escala:** LARGE
> **Workflow:** context-doctor-routines · **Entregável deste ciclo:** spec + plano (sem implementação)

## Objetivo

Dar ao DevFlow um **health-check do contexto** (`/devflow:doctor`) que diagnostica e repara problemas de manutenção (config de MCP, MCP desconectados, saúde do MemPalace), e um **subsistema de routines** file-based que agenda execuções recorrentes e, via SessionStart, **sugere** (nunca executa sozinho) rodar quando vencidas.

## Problema (motivado por incidentes reais desta sessão)

1. `.mcp.json` com `command: "python"` (inexistente em sistemas só com `python3`) → MCP `failed` silenciosamente.
2. MCP `mempalace` desconectado sem sinal claro de causa.
3. Wings órfãs `repo.*` poluindo o palace global (lixo de teste que minerou tmpdirs reais).
4. Índice HNSW com drift (`Quarantined corrupt segment`) precisando `mempalace repair`.
5. Flag `autoMine: post-merge` setado mas hook não instalado (capability inerte).

Hoje não há ferramenta que **detecte** esses estados nem que **lembre** o usuário de manutenção periódica.

## Decisões de design (aprovadas)

| Fork | Decisão |
|---|---|
| **A — Registro de checks** | Lib plugável: `scripts/lib/doctor-checks/` — cada check é função bash com contrato padronizado. Novos checks sem tocar o comando. |
| **B — Routines file** | `.context/routines.yaml` (versionado/projeto — time compartilha). |
| **C — Consentimento de repair** | **Dry-run + confirma cada repair.** Destrutivos (deletar wings/drawers) nunca auto. |
| **D — Sugestão no SessionStart** | **1x/dia + snooze**, espelhando o padrão `DOCS_MCP_RECOMMENDATION`. Sugere, não executa. |
| **E — Agendador** | **Próprio, file-based, avaliado no SessionStart.** Sem daemon/cron; offline, versionável, testável com data mockada. Não usa o `/schedule` remoto. |

**Decisão arquitetural (registrável como ADR futuramente):** *"Agendador de manutenção file-based avaliado no SessionStart, sem daemon/cron, que sugere mas nunca executa sozinho."*

## Arquitetura

### Componente 1 — Check registry (`scripts/lib/doctor-checks/`)
Cada check expõe uma função que retorna um registro estruturado:
```
id            # ex.: mcp-config-valid
title         # legível (i18n)
status        # OK | WARN | FAIL
diagnosis     # o que está errado (frase i18n + evidência)
repair        # comando ou função de reparo (vazio = sem auto-repair)
severity      # info | warn | critical
destructive   # true => exige confirmação extra, nunca auto
```
**Checks iniciais:**
- `mcp-config-valid` — `.mcp.json` é JSON válido; sem `mcpServers` aninhado; cada `command` resolve no PATH (`command -v`). *(pega o bug python→mempalace-mcp)*
- `mcp-connectivity` — cada server em `.mcp.json` está conectado/alcançável (parse de `claude mcp list` quando disponível; senão, checagem best-effort do command/url).
- `mempalace-health` — CLI presente; wing do projeto existe; detecta **wings órfãs `repo.*`**; detecta **drift HNSW** (mensagem de quarantine / `repair-status`).
- `devflow-config` — `.context/.devflow.yaml` presente e parseável; chaves essenciais.
- `git-hooks` — se `mempalace.autoMine: post-merge`, confere se `.git/hooks/post-merge` está instalado (marker DevFlow).

### Componente 2 — `/devflow:doctor` (comando + skill `devflow:doctor`)
- `commands/doctor.md` (thin, `user_invocable`) → skill `devflow:doctor`.
- Roda todos os checks; imprime relatório agrupado por severidade (✓/⚠/✗).
- Para cada FAIL/WARN com `repair`: mostra diagnóstico + repair proposto, **dry-run**, pede confirmação; **destrutivo nunca auto**.
- Flags: default = diagnostica; `--fix` = modo interativo de reparo; `--check <id>` = roda só um check.

### Componente 3 — Routines (`scripts/lib/routines.sh` + `commands/routines.md` + skill `devflow:routines`)
- `.context/routines.yaml`:
  ```yaml
  routines:
    - id: context-maintenance
      description: Health-check do contexto DevFlow
      enabled: true
      frequency: 7d            # Nd | Nw | Nm  (sem cron completo no MVP)
      lastRun: null
      nextRun: 2026-06-04      # calculado; null => vencida já
      prompts:
        - { type: command, value: "/devflow:doctor" }
      # prompts podem encadear: command | skill | agent
  ```
- Engine: calcula `nextRun = lastRun + frequency`; marca vencidas (`nextRun <= hoje`); grava `lastRun`/recalcula ao rodar.
- Comando `/devflow:routines [list|run <id>|snooze <id> <dias>|enable/disable <id>]`. `run` executa os `prompts[]` em sequência (cada um aciona o command/skill/agent correspondente).
- Default: ships com a routine `context-maintenance` (doctor a cada 7d) ao `/devflow init`/`config`.

### Componente 4 — SessionStart (`hooks/session-start`)
- Lê `.context/routines.yaml`; acha rotinas com `nextRun <= hoje` e `enabled`.
- Respeita **1x/dia** (`lastSuggested` por routine) e **snooze** (`snoozeUntil`).
- Emite bloco `<DEVFLOW_ROUTINES_DUE>` (i18n) sugerindo `/devflow:routines run <id>`. **Nunca executa.**
- Data atual injetada/mockável (sem `Date.now()` em libs JS; em bash, `date` — nos testes, via variável de ambiente override).

### Componente 5 — Catálogo de repairs (casos canônicos)
| ID | Detecção | Repair proposto | Destrutivo |
|---|---|---|---|
| R1 | `command` do `.mcp.json` não resolve no PATH | sugerir console script correto (ex.: `mempalace-mcp`) | não |
| R2 | MCP desconectado | sugerir reconnect / revisar command/url | não |
| R3 | wings órfãs `repo.*` no palace | listar + sugerir remoção | **sim** (confirma) |
| R4 | drift HNSW | sugerir `mempalace repair` | não |
| R5 | `autoMine` setado sem hook | sugerir `/devflow:memory install-hook` | não |

### i18n
Mensagens (títulos de check, diagnósticos, bloco de sugestão) em `locales/{en,pt,es}` seguindo o padrão dos hooks existentes.

### Testes (HARD constraint)
- `tests/hooks/test-doctor.sh` — cada check com fixtures tmp (`.mcp.json` quebrado, config ausente, etc.). **Mock de `mempalace`, `claude`, e PATH controlado** — jamais o palace/`.mcp.json` reais. *(Trava do incidente: o teste do post-merge minerou o palace real por deixar mempalace real no PATH — aqui o PATH de teste só contém mocks.)*
- `tests/hooks/test-routines.sh` — engine de agendamento com **data mockada** (env override): vencida/não-vencida, snooze, 1x/dia, run grava lastRun.
- `tests/hooks/test-session-start-routines.sh` — injeção do bloco só quando vencida + respeitando snooze/1x-dia.

## Fora de escopo (MVP)
- Cron real / execução headless (decisão E: só sugere).
- Sintaxe cron completa (só `Nd/Nw/Nm`).
- Auto-repair de destrutivos.

## Riscos
- **Isolamento de teste** (incidente recorrente) — mitigado por PATH só-mock + data mockada.
- **Ruído no SessionStart** — mitigado por 1x/dia + snooze.
- **Parsing YAML em bash puro** (zero deps) — usar o mesmo estilo grep/awk já usado para `.devflow.yaml`; manter schema simples.
- **Falsos positivos de connectivity** — `mcp-connectivity` é best-effort; nunca marca FAIL destrutivo.
