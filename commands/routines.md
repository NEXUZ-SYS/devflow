---
name: routines
description: Manage and run scheduled DevFlow maintenance routines (doctor, custom prompt chains)
user_invocable: true
---

# /devflow:routines

Rotinas de manutenção agendadas (file-based). Cada routine tem uma frequência e uma sequência de prompts que acionam commands/skills/agents. O SessionStart **sugere** rodar quando uma routine vence — este comando lista, executa e gerencia.

## Usage

```
/devflow:routines list             # mostra rotinas e estado (vencida / próxima data / off)
/devflow:routines run <id>         # executa os prompts da routine em sequência
/devflow:routines snooze <id> <n>  # adia a sugestão por n dias
/devflow:routines enable <id>      # ativa
/devflow:routines disable <id>     # desativa (sem remover)
```

## Behavior

1. Parse do subcomando
2. Invoke `devflow:routines` skill
3. A skill usa `node $CLAUDE_PLUGIN_ROOT/scripts/routines.mjs <sub>` para o estado e, em `run`, executa cada prompt da routine (command/skill/agent) e marca a execução (`mark-run`)

## Arguments

- `list` — lista rotinas com estado (lê `.context/routines.json`)
- `run <id>` — executa os `prompts[]` da routine em ordem; ao final grava `lastRun` e recalcula `nextRun`
- `snooze <id> <n>` — adia a sugestão por n dias
- `enable|disable <id>` — liga/desliga a routine

## Examples

```
/devflow:routines list
/devflow:routines run context-maintenance
/devflow:routines snooze context-maintenance 7
```
