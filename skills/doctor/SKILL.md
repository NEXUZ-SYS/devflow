---
name: doctor
description: "Diagnose and repair DevFlow context health — MCP config/connectivity, MemPalace wings & index — with consent-gated repairs"
---

# Doctor

Roda o health-check do contexto DevFlow e conduz os repairs com **consentimento**. Diagnóstico é read-only; reparos só com confirmação; reparos destrutivos nunca rodam sozinhos.

**Announce at start:** "I'm using the devflow:doctor skill to check context health."

## Pre-requisite

Node disponível (o repo é Node-first). A engine de checks é `scripts/doctor.mjs` (no plugin: `$CLAUDE_PLUGIN_ROOT/scripts/doctor.mjs`).

## Step 1: Diagnosticar

```bash
node "$CLAUDE_PLUGIN_ROOT/scripts/doctor.mjs" --json
```

(Ou `--check <id>` para um único check.) O JSON traz `results[]` com `{id, title, status, diagnosis, repair, severity, destructive}`.

Apresente um resumo legível agrupado por severidade (FAIL → WARN → OK), citando `diagnosis` e, quando houver, o `repair` proposto.

## Step 2: Repairs (só se `--fix`, ou se o usuário pedir)

Para cada resultado FAIL/WARN com `repair` não-vazio, em ordem de severidade:

1. **Mostrar** o diagnóstico + o repair exato proposto (dry-run: explique o que vai mudar).
2. **Confirmar** com o usuário antes de aplicar (AskUserQuestion ou pergunta direta).
3. **Aplicar** só após confirmação. Repairs típicos:
   - `mcp-config-valid` → editar `.mcp.json` (corrigir command/aninhamento). **Respeitar branch protection** (pode exigir branch via `devflow:git-strategy`).
   - `mcp-connectivity` → instruir reconnect no menu `/mcp` (ação do usuário).
   - `mempalace-health` (drift) → rodar `mempalace repair`.
   - `mempalace-health` (wings órfãs) → **DESTRUTIVO**: listar drawers (tools MCP `mempalace_list_drawers`) e remover com `mempalace_delete_drawer` **só após confirmação explícita** de quais wings.
   - `git-hooks` → `/devflow:memory install-hook`.

## Step 3: Salvaguardas

- **Nunca** aplicar repair `destructive: true` sem confirmação explícita do alvo exato.
- **Nunca** aplicar repairs em modo não-interativo/autônomo sem consentimento.
- Edições em arquivos do projeto (`.mcp.json`) passam pelo gate de branch protection (hook git-strategy).
- Diagnóstico (`--json` sem `--fix`) é sempre seguro (read-only).

## Step 4: Fechar

Resuma o que foi reparado e o que ficou pendente (ex.: reconnect manual de MCP, restart do Claude Code). Sugira `/devflow:routines` para agendar o doctor periodicamente.

## Guidelines

- Diagnóstico primeiro, repair depois — sempre com o usuário no controle.
- Este skill é o motor do check `mempalace-health` que detecta o tipo de problema visto em `/devflow:memory status` (wings órfãs, drift) e propõe `mempalace repair`/limpeza.
- Novos checks entram em `scripts/lib/doctor.mjs` (array `CHECKS`) — sem tocar este skill.
