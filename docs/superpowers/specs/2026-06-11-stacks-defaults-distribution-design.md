# Distribuição dos Stacks Defaults — Design (Fase 7)

> **DevFlow workflow:** stacks-defaults-distribution | **Scale:** MEDIUM | **Phase:** P→R
> **Data:** 2026-06-11 | **Versão alvo:** v1.18.0 (a partir de v1.17.0)

## Objetivo

Fazer os 22 stacks default do plugin (`assets/stacks/`, já na `main` desde v1.17.0) chegarem a qualquer projeto que use DevFlow, **espelhando o mecanismo já validado de standards** (`assets/standards/`): defaults vivem só no plugin, carregados via **live-load** em runtime, e um **filtro por framework detectado** narra o que é relevante.

## Contexto (estado atual verificado)

- `assets/stacks/`: 25 docs DDC (`.md`) em 9 concerns + `MANIFEST.txt` + `manifest.yaml` (`devflow-stack/v0`), com 22 `mcpIndexed` + 3 `skipDocs`. As docs oficiais já estão no **store global** do docs-mcp-server (compartilhado entre projetos) — nada a re-scrapar.
- **Gap:** o consumidor `scripts/lib/manifest-stacks.mjs:loadManifest()` lê **só** o manifest do projeto. Não há merge com os defaults do plugin. Nenhum projeto "enxerga" os 22.
- **Precedente (standards):** `scripts/lib/standards-loader.mjs:loadStandardsMerged()` faz dual-source (plugin `assets/standards/` + projeto, projeto vence por id, respeita `standards.local.yaml` `disable:`). O `hooks/session-start` injeta `<DEVFLOW_CONTEXT_INDEX>` via `scripts/lib/context-index-cli.mjs`. `devflow standards eject <id>` copia um default pro projeto.

## Decisões (fixadas com o usuário)

1. **Live-load puro** dos `.md` E do manifest — sem cópia física no projeto. O projeto só materializa entradas quando customiza (`eject`) ou adiciona libs novas (scrape).
2. **Stack-filter em ambos os gatilhos:** índice leve no **SessionStart** (filtrado pelo framework) + skill **on-demand no Planning** (docs completos), análogo a `knowledge-filter`/`adr-filter`.
3. **Abordagem A — paridade total com standards:** loader dedicado + lib de filtro compartilhada + skill + eject.
4. **Casos de borda do filtro:** `postgres`/`bigquery` detectados via pacote-cliente no alias map; `node@24` sempre incluído quando há `package.json`; `harness-engineering` e `gemini` não auto-incluídos (só via `eject` ou keyword da task).

## Arquitetura

### Componentes

| Componente | Arquivo | Papel |
|---|---|---|
| Loader dual-source | **novo** `scripts/lib/stacks-loader.mjs` | `loadStacksMerged(projectRoot, pluginRoot)` |
| Detecção + filtro | **novo** `scripts/lib/stacks-filter.mjs` | stacks mesclados + raiz → subconjunto relevante ao framework detectado |
| Índice SessionStart | **editar** `scripts/lib/context-index-cli.mjs` | usa loader+filter para listar stacks filtrados |
| Skill Planning | **novo** `skills/stack-filter/SKILL.md` (`devflow:stack-filter`) | on-demand no Planning; emite `<STACKS filtered="true">` |
| Eject | **editar** `scripts/devflow-stacks.mjs` | novo `devflow stacks eject <lib>` |
| Doc do fluxo | **editar** `skills/project-init/SKILL.md` | documenta live-load; **não** seeda os 22 |

### 1. `loadStacksMerged` (espelha `loadStandardsMerged`)

- Defaults de `<pluginRoot>/assets/stacks/` (origin `default`) + projeto de `contextPaths(projectRoot).stacks` com fallback legacy (origin `project`).
- Mesma lib (por **nome**) no projeto **vence** o default; uma entrada por nome.
- Respeita **novo** `.context/stacks.local.yaml` com `disable: [<lib>, ...]` (idêntico ao `standards.local.yaml`).
- `pluginRoot` default = `process.env.CLAUDE_PLUGIN_ROOT`.
- Retorna `{ frameworks: { <lib>: {version, mcpIndexed|skipDocs, applyTo, origin, concern, mdPath} }, ... }`. Lê o `.md` de cada lib pelo `MANIFEST.txt`/varredura de concerns; deriva `concern` do diretório.
- **Pure `node:*`** (Dependency Policy), reusa `parseFrontmatter`, `contextPaths`, e a leitura de manifest de `manifest-stacks.mjs`.

### 2. `stacks-filter.mjs` (detecção compartilhada)

- **Detecção de deps** do projeto: `package.json` (deps+devDeps), `pyproject.toml`, `go.mod`, `Cargo.toml` (mesma família de fontes do `input-resolver`/`adr-filter`).
- **Mapa stack→dep (alias):** lê o frontmatter `package:` do `.md` quando presente (ex.: `anthropic-sdk`→`@anthropic-ai/sdk`, `openai-sdk`→`openai`, `google-genai-sdk`→`@google/genai`); aliases adicionais curados onde o nome difere (`tailwind`→`tailwindcss`, `vercel-ai-sdk`→`ai`, `postgres`→`pg|postgres|drizzle-orm|@prisma/client`, `bigquery`→`@google-cloud/bigquery`); senão match pelo nome da lib.
- **Regras de borda:**
  - `node` → incluído sempre que houver `package.json`.
  - `harness-engineering`, `gemini` → **não** auto-incluídos (entram só por `eject`/override do projeto, ou por keyword-match quando usado no skill de Planning com a task).
- **Saída:** `{ matched: [{lib, version, mcpIndexed, mdPath}], reason: {<lib>: "dep:next"|"runtime:package.json"|...} }`. Sem rede, puro `node:*`.

### 3. Índice SessionStart (`context-index-cli.mjs`)

- Passa a chamar `loadStacksMerged` + `stacks-filter` → injeta no `<DEVFLOW_CONTEXT_INDEX>` apenas os stacks relevantes ao framework detectado (não os 22 sempre).
- **Regressão obrigatória:** o índice de standards default segue idêntico. Gate R2 do hook inalterado.

### 4. Skill `devflow:stack-filter` (Planning on-demand)

- Recebe a task; usa `stacks-filter.mjs`; soma keyword-match leve (libera `harness-engineering`/`gemini`/etc. se a task mencionar termos do `.md`).
- Emite bloco `<STACKS filtered="true">` com: por lib relevante, um resumo curto + ponteiro pro MCP (`mcp__docs-mcp-server__search_docs` com `lib@version`) e o caminho do `.md` narrativo.
- Invocado pelo `prevc-planning` Step 1 (junto de `adr-filter`/`knowledge-filter`). Fallback: se indisponível, Planning segue sem stacks (opt-in, igual aos outros filtros).

### 5. `devflow stacks eject <lib>` (espelha `standards eject`)

- Copia `assets/stacks/<concern>/<lib>.md` → `.context/engineering/stacks/<concern>/<lib>.md`.
- Guards de containment (R5): `lib` validada por regex, `src` contido em `assets/stacks/`, `dest` contido no stacks dir do projeto. `--force` para sobrescrever. Erro claro se default inexistente.
- Resolve `concern` varrendo `assets/stacks/*/<lib>.md` (ou via `MANIFEST.txt`).

### 6. `project-init`

- **Não** seeda os 22 (live-load cobre). Documenta no SKILL.md que os stacks default são live-loaded e customizáveis via `devflow stacks eject`. Comportamento de profile-stacks detectados (via `devflow stacks add`) **inalterado**.

## Fluxo de dados

```
assets/stacks/ (plugin defaults)  ─┐
                                   ├─► loadStacksMerged ─► stacks-filter ─┬─► context-index-cli (SessionStart: índice filtrado)
.context/engineering/stacks/ ──────┘   (projeto vence)   (por deps/node)  └─► skill stack-filter (Planning: docs + ponteiro MCP)
.context/stacks.local.yaml (disable)                                          eject: assets/stacks/<c>/<lib>.md → projeto
```

## Testing (TDD obrigatório, RED→GREEN→REFACTOR, testes reais)

| Arquivo | Cobre |
|---|---|
| `tests/.../test-stacks-loader.mjs` | merge default+project, project-wins por nome, `stacks.local.yaml` disable, fallback legacy, pluginRoot ausente |
| `tests/.../test-stacks-filter.mjs` | detecção package.json/pyproject/go.mod/Cargo.toml; alias map (tailwind/ai/@anthropic-ai/sdk/pg/@google-cloud/bigquery); `node` com/sem package.json; `harness`/`gemini` não auto-incluídos; projeto sem deps |
| `tests/.../test-stacks-eject.mjs` | copia ok, containment R5, `--force`, lib inexistente, resolução de concern |
| `test-context-index-cli` (estender) | stacks filtrados aparecem; **regressão** do índice de standards |
| Regressão | suíte de validação completa; `test-session-start` e2e (hook inalterado a não ser via CLI) |

## Escopo / YAGNI / não-objetivos

- **Não** seeda manifest; **não** re-scrapa (MCP global já populado); **não** altera a mecânica de scrape nem o schema `devflow-stack/v0`.
- **Não** adiciona scanner de arquivos (`.sql`/`docker-compose`) — detecção por dep/alias é suficiente nesta fase.
- Versão alvo: bump **minor** 1.17.0 → 1.18.0 (feature aditiva).

## Riscos

| Risco | Mitigação |
|---|---|
| `context-index-cli` quebrar índice de standards | teste de regressão dedicado antes de tocar |
| Alias map incompleto (lib não detectada) | aliases vêm do frontmatter `package:` (fonte única); libs sem match simplesmente não aparecem (fail-safe, não erro) |
| Hook SessionStart sensível (incidente histórico de `cwd`) | mudança fica no CLI node, não no bash do hook; gate R2 inalterado; e2e do hook na validação |
| Duplicação se projeto também tiver a lib | merge dedup por nome (project-wins), igual standards |
