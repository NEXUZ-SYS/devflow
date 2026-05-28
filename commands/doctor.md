---
name: doctor
description: Diagnose and repair the health of the DevFlow context (MCP config, connectivity, MemPalace)
user_invocable: true
---

# /devflow:doctor

Health-check do contexto DevFlow: diagnostica erros de configuração de MCP, servidores MCP desconectados, e problemas de manutenção do MemPalace (wings órfãs, drift de índice) — e propõe/roda os repairs com confirmação.

## Usage

```
/devflow:doctor                # diagnostica tudo e mostra o relatório
/devflow:doctor --fix          # modo interativo: propõe e aplica repairs (com confirmação)
/devflow:doctor --check <id>   # roda só um check (ex.: mcp-config-valid)
```

## Behavior

1. Parse das flags
2. Invoke `devflow:doctor` skill
3. A skill roda `node $CLAUDE_PLUGIN_ROOT/scripts/doctor.mjs --json`, apresenta o relatório por severidade e, em `--fix`, conduz os repairs com **dry-run + confirmação** (destrutivos nunca automáticos)

## Arguments

- `--fix` — ativa o modo de reparo interativo (default: só diagnostica)
- `--check <id>` — roda um único check: `mcp-config-valid`, `mcp-connectivity`, `mempalace-health`, `devflow-config`, `git-hooks`

## Examples

```
/devflow:doctor
/devflow:doctor --fix
/devflow:doctor --check mempalace-health
```
