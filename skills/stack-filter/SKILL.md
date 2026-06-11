---
name: stack-filter
description: "Use para selecionar apenas os stacks (tecnologias) relevantes à task atual em vez de listar todos os 22 defaults — reduz ruído mantendo os stacks do(s) framework(s) detectado(s) do projeto. Invoque no início do PREVC Planning (após a task estar definida) ou sob demanda quando o usuário pedir 'filtre os stacks para X'. Usa loadStacksMerged (defaults do plugin + projeto) + stacks-filter (detecção por deps em package.json/pyproject/go.mod/Cargo.toml + alias map), e libera stacks sem-sinal (harness-engineering, gemini) por keyword-match na task. Emite um bloco <STACKS filtered> com ponteiros para o docs-mcp-server."
---

# stack-filter — Filtragem Contextual de Stacks

Seleciona os stacks (libs/frameworks/runtimes) relevantes a uma task específica em vez de listar todos os defaults do plugin. Análogo de `devflow:knowledge-filter`/`devflow:adr-filter` para a camada de stacks — complementa (não substitui) o índice filtrado que o `session-start` hook já injeta via `context-index-cli`.

**Announce at start:** "Invocando `devflow:stack-filter` — selecionando stacks do framework detectado para esta task."

## Quando invocar

- **Automaticamente** — durante `devflow:prevc-planning` Step 1, **depois** que a task está definida (junto de `adr-filter` e `knowledge-filter`).
- **Sob demanda** — quando o usuário pedir "filtre os stacks para X" ou mencionar que há muitos stacks no contexto.

## Como funciona

1. Resolve `projectRoot` (cwd ou `--project`) e `pluginRoot` (`$CLAUDE_PLUGIN_ROOT`).
2. Roda o CLI:

   ```bash
   node "$CLAUDE_PLUGIN_ROOT/scripts/lib/stacks-filter-cli.mjs" \
     --project=. --plugin="$CLAUDE_PLUGIN_ROOT" --task="<descrição da task>"
   ```

   O CLI:
   - `loadStacksMerged` — mescla os defaults do plugin (`assets/stacks/`) com o projeto (`.context/engineering/stacks/`), projeto vence por nome, respeita `.context/stacks.local.yaml` `disable:`.
   - `filterStacks` — inclui os stacks cujo pacote-cliente está nas deps detectadas (alias map: `tailwind`→`tailwindcss`, `vercel-ai-sdk`→`ai`, `postgres`→`pg|postgres|drizzle-orm|@prisma/client`, `bigquery`→`@google-cloud/bigquery`, etc.); `node` sempre que houver `package.json`.
   - **keyword-release** — `harness-engineering` e `gemini` (sem sinal de dep) entram só se a task mencionar termos relevantes (ex.: "agent/harness", "gemini").

3. Cole o bloco `<STACKS filtered="true">` resultante como contexto de stack do Planning. Cada lib `mcpIndexed` traz o ponteiro `mcp__docs-mcp-server__search_docs("<lib>", "<query>")`; libs `skipDocs` apontam o `.md` narrativo.

## Uso no contexto

- Os stacks listados são **descritivos** (o que o projeto usa), não constraints duros como guardrails de ADR.
- Para detalhes de API de uma lib `mcpIndexed`, consulte o docs-mcp-server (`search_docs`) — **não** responda de memória de treino (ver `std-grounding`/doc-grounding).
- Para customizar um stack default no projeto: `devflow stacks eject <lib>`.

## Fallback

Se o CLI/skill estiver indisponível (instalação incompleta) ou o projeto não declarar deps, o Planning segue **sem** contexto de stack — opt-in, igual a `adr-filter`/`knowledge-filter`.
