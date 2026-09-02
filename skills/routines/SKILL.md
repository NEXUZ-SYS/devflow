---
name: routines
description: "Manage and execute scheduled DevFlow maintenance routines — list, run prompt chains (commands/skills/agents), snooze, enable/disable"
user-invocable: false
---

# Routines

Gerencia e executa rotinas de manutenção agendadas (file-based). O hook SessionStart **executa** sozinho as rotinas da classe `auto`; as demais são conduzidas por este skill (o LLM), pois slash-commands e skills não rodam via bash.

**Announce at start:** "I'm using the devflow:routines skill to manage maintenance routines."

## Pre-requisite
Node disponível. CLI: `$CLAUDE_PLUGIN_ROOT/scripts/routines.mjs`. Arquivo: `.context/routines.json` (criado pelo `/devflow config` a partir de `templates/routines.json`, ou manualmente).

## Subcomandos

### `list`
```bash
node "$CLAUDE_PLUGIN_ROOT/scripts/routines.mjs" list --json
```
Apresentar cada routine com estado (VENCIDA / próxima data / off) e seus prompts.

### `run <id>`
1. Ler a routine:
   ```bash
   node "$CLAUDE_PLUGIN_ROOT/scripts/routines.mjs" list --json
   ```
2. Para cada item de `prompts[]` **em ordem**, executar conforme o `type`:
   - `command` → invocar o slash-command em `value` (ex.: `/devflow:devflow-doctor`) com `args`.
   - `skill` → invocar o skill via Skill tool.
   - `agent` → despachar o agente (Agent tool) com a tarefa em `value`/`args`.
3. Ao concluir todos os prompts, registrar a execução:
   ```bash
   node "$CLAUDE_PLUGIN_ROOT/scripts/routines.mjs" mark-run <id>
   ```
   Isso grava `lastRun` e recalcula `nextRun`.

> Se um prompt for um command que altera o projeto (ex.: doctor `--fix`), respeitar o modelo de consentimento daquele command/skill (não burlar confirmações).

### Classes de execução

Cada rotina declara `execution`:

| Valor | Quem executa | Quando |
|---|---|---|
| `auto` | o **hook**, em node, sem LLM | sozinha, na data agendada |
| `confirm` | o usuário decide | na data agendada o sistema **pergunta**; nunca roda sozinha |
| `model` | o LLM (skill/agent/comando sem script) | quando o usuário manda rodar |

Ausente, o valor é derivado: todos os passos `check` → `auto`; qualquer outra coisa → `confirm`.
Retrocompatível — um `routines.json` já em campo não muda de comportamento.

O `/devflow:devflow-doctor` é `confirm` porque leva **~16s**. A verificação barata (~0,2s) roda
sempre e o **propõe** quando encontra divergência: diagnóstico barato é contínuo, diagnóstico caro
é sob consentimento.

### Tipos de passo

| `type` | Executável sem LLM | Observação |
|---|---|---|
| `check` | **sim** | nomeia um **grupo** de checks do doctor (`CHECK_GROUPS` em `scripts/lib/routines.mjs`), não uma lista de ids — acrescentar um check não exige editar o `routines.json` de cada projeto |
| `command` | não | slash-command |
| `skill` | não | Skill tool |
| `agent` | não | Agent tool |

### Onde mora o estado

| Arquivo | Git | Conteúdo |
|---|---|---|
| `.context/routines.json` | **versionado** | definição: `id`, `description`, `enabled`, `frequency`, `execution`, `prompts` |
| `.context/runtime/routines-state.json` | **gitignored** | estado por máquina: `lastRun`, `nextRun`, `lastSuggested`, `snoozeUntil` |

O time compartilha a agenda e ela replica entre dispositivos via clone; cada máquina tem o seu
próprio "hoje". A ausência de qualquer `lastRun` é o sinal de **primeiro contato** (clone novo),
que dispara o relato de bootstrap.

Dois predicados, deliberadamente distintos: `shouldRun` (execução) e `shouldSuggest`
(`shouldRun` + guarda de 1x/dia, só para surfacing).

### `snooze <id> <n>` / `enable <id>` / `disable <id>`
```bash
node "$CLAUDE_PLUGIN_ROOT/scripts/routines.mjs" snooze <id> <n>
node "$CLAUDE_PLUGIN_ROOT/scripts/routines.mjs" enable <id>
node "$CLAUDE_PLUGIN_ROOT/scripts/routines.mjs" disable <id>
```

## Guidelines
- O hook SessionStart **executa** as rotinas `auto` vencidas (bloco `DEVFLOW_ENV_CHECKUP`) e sugere as demais (`DEVFLOW_ROUTINES_DUE`). Este skill é o executor manual e o gestor.
- O checkup fica em **silêncio** quando está tudo certo; só fala no primeiro contato pós-clone ou quando há divergência.
- `run` só marca `mark-run` **após** executar os prompts com sucesso.
- A **definição** é versionada; o **estado de execução** é por máquina (ver acima).
