---
name: routines
description: "Manage and execute scheduled DevFlow maintenance routines — list, run prompt chains (commands/skills/agents), snooze, enable/disable"
---

# Routines

Gerencia e executa rotinas de manutenção agendadas (file-based, `.context/routines.json`). O estado fica num CLI Node; a **execução dos prompts** (que acionam commands/skills/agents) é conduzida por este skill (o LLM), pois slash-commands/skills não rodam via bash.

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
   - `command` → invocar o slash-command em `value` (ex.: `/devflow:doctor`) com `args`.
   - `skill` → invocar o skill via Skill tool.
   - `agent` → despachar o agente (Agent tool) com a tarefa em `value`/`args`.
3. Ao concluir todos os prompts, registrar a execução:
   ```bash
   node "$CLAUDE_PLUGIN_ROOT/scripts/routines.mjs" mark-run <id>
   ```
   Isso grava `lastRun` e recalcula `nextRun`.

> Se um prompt for um command que altera o projeto (ex.: doctor `--fix`), respeitar o modelo de consentimento daquele command/skill (não burlar confirmações).

### `snooze <id> <n>` / `enable <id>` / `disable <id>`
```bash
node "$CLAUDE_PLUGIN_ROOT/scripts/routines.mjs" snooze <id> <n>
node "$CLAUDE_PLUGIN_ROOT/scripts/routines.mjs" enable <id>
node "$CLAUDE_PLUGIN_ROOT/scripts/routines.mjs" disable <id>
```

## Guidelines
- A sugestão automática de rotinas vencidas vem do hook SessionStart (bloco `DEVFLOW_ROUTINES_DUE`) — 1x/dia, respeitando snooze. Este skill é o executor/gestor.
- `run` só marca `mark-run` **após** executar os prompts com sucesso.
- Rotinas são versionadas (`.context/routines.json`) — o time compartilha a agenda de manutenção.
