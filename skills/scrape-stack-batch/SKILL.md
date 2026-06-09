---
name: scrape-stack-batch
description: "Use when the user wants to index versioned framework documentation into the docs-mcp-server global store (declared via mcpIndexed in .context/engineering/stacks/manifest.yaml). Trigger words: 'scrape stacks', 'gerar refs', 'atualizar stacks', 'refresh stack docs', 'devflow stacks scrape', 'scrape-batch'. Also trigger when /devflow init detects stacks in package.json/pyproject.toml/Cargo.toml/go.mod and the user wants to bootstrap their docs. Two modes: BATCH (multiple libs from package.json|manifest wishlist|args; per-stack discovery + confirmation + parallel scrape) and SINGLE (one lib with explicit source). Pipeline: docs-mcp-server recursive scrape into the global store; consumers query via MCP tools."
version: 0.2.0
deps:
  external:
    - "@arabold/docs-mcp-server@^2.2.1"
  internal:
    - "scripts/lib/url-validator.mjs"
    - "scripts/lib/scrape-recursive.mjs"
    - "scripts/lib/manifest-stacks.mjs"
trigger_phrases:
  - "scrape stack"
  - "scrape-batch"
  - "gerar refs"
  - "atualizar stacks"
  - "refresh stack docs"
  - "scrapear docs"
---

# Scrape Stack Batch — DevFlow Edition

Discovers official documentation sources for npm/PyPI/crates libraries and indexes versioned docs into the **docs-mcp-server global store** via recursive scrape. Consumers (agents, Camadas 1-4) query the indexed libraries through MCP tools (`mcp__docs-mcp-server__search_docs`, `list_libraries`, `find_version`) — there is no per-project `.md` output.

> **Fase B (histórico):** versões anteriores desta skill geravam arquivos `artisanalRef` em `.context/stacks/refs/<lib>@<version>.md` via md2llm + sanitização SI-6. Esse fluxo foi removido — o store global É o output. Refs `.md` existentes são tratados como legado read-only (ver `devflow stacks validate`). A migração está documentada no header de `scripts/pipeline.mjs` desta skill.

**Announce at start:** "Invocando `devflow:scrape-stack-batch` — vou descobrir fontes, pedir confirmação e scrapeando em paralelo."

---

## Quando invocar

- **Setup inicial** de projeto novo: `devflow stacks scrape-batch --from-package` lê `package.json` e bootstrap a manifest com todas as deps
- **Adicionar lib ad-hoc**: `devflow stacks scrape <lib> <version>` quando o agent encontra import de lib não pinada
- **Upgrade major**: `devflow stacks scrape next 16.0.0` quando dev faz upgrade do framework
- **Refresh trimestral** (cron-style): re-scrape libs core para capturar updates de doc

**NÃO invocar para:** libs com API estável (Postgres, lodash, stdlib) — marque `skipDocs: true` no manifest.

---

## Workflow (4 fases A→D)

### Fase A — INPUT RESOLUTION (`scripts/input-resolver.mjs`)

Resolve a lista final de `<lib>@<version>` para processar.

| Input mode | Source | Trigger |
|---|---|---|
| `--from-package` | `package.json` deps + devDeps | Bootstrap inicial ou auditoria completa |
| `--from-manifest` | `manifest.yaml` `wishlist:` | Lista priorizada para "rodar overnight" |
| `<lib>@<version> ...` | Args explícitos | Adição ad-hoc ou upgrade pontual |
| `--from-url <url>` | URL explícito | Scrape de fonte específica (single-lib mode) |

URLs de qualquer fonte passam por `validateUrl()` (SI-3) antes de qualquer fetch. Cloud metadata (169.254.x), RFC1918, file:// são rejeitados.

### Fase B — DISCOVERY (`scripts/discovery.mjs`)

Para cada `<lib>`, probe 3 estratégias em sequência:

1. **Registry lookup** (npm | PyPI | crates.io | Go proxy) — extrai `homepage` + `repository.url`
2. **llms.txt probe** — HEAD em `<homepage>/llms.txt` ou `/.well-known/llms.txt`
3. **Web search** (fallback) — apenas quando registry+llms.txt vazios E `--allow-web-search`

Confidence agregada via `scripts/confidence.mjs` (max() rule per spec §3.4.4):

| Sinal | Confidence | Boost |
|---|---|---|
| Registry tem homepage E repository | 0.85 | +0.05 se mesmo domínio |
| llms.txt 200 OK | 0.95 | +0.03 se versão exata |
| GitHub `docs/` na tag | 0.90 | +0.05 se README.md tem link |
| docs-site sitemap.xml | 0.75 | +0.05 se versão no sitemap |
| Web search | 0.40-0.85 | depende de consistência |
| Convenção (`docs.<lib>.io`) | 0.50 | sem boost |

| Tier | Confidence | Action |
|---|---|---|
| `recommended` (✓) | ≥ 0.80 | Apresentar como sugestão padrão |
| `review` (⚠) | 0.60-0.79 | Apresentar com aviso de revisão manual |
| `uncertain` (✗) | < 0.60 | **Bloquear** — humano deve fornecer fonte via `--from-url` |

### Fase C — CONFIRMAÇÃO HUMANA

Apresentar plano consolidado **sempre antes** de qualquer write action:

```text
═══ Plano de scrape (3 libraries) ═══

[1] next@15.0.0
    Fonte: github://vercel/next.js@v15.0.0/docs
    Confidence: 0.95 ✓ (registry + llms.txt)
    Tempo estimado: ~30s

[2] prisma@5.18.0
    Fonte: docs-site://www.prisma.io/docs/orm
    Confidence: 0.78 ⚠ (registry + sitemap)
    Tempo estimado: ~3 min

[3] vitest@1.6.0
    Fonte: llms-txt://vitest.dev/llms.txt
    Confidence: 0.98 ✓ (llms.txt fonte canônica)
    Tempo estimado: ~10s

Confirma? [y/n/edit/details]
  y       = executar
  n       = cancelar (nenhuma mudança)
  edit    = ajustar fonte de uma lib
  details = ver discovery trace de cada lib
```

### Fase D — EXECUÇÃO (`scripts/pipeline.mjs`)

Pipeline em 2 stages:

1. **RESOLVE** — valida lib contra slug regex npm-spec (sem traversal), version contra version regex; revalida URL (SI-3 defesa-em-profundidade)
2. **SCRAPE** — `recursiveScrape()` (`scripts/lib/scrape-recursive.mjs`) invoca `execFile('npx', ['-y', '@arabold/docs-mcp-server@2.2.1', 'scrape', ...])` (NUNCA shell, SI-2; 10min timeout, 50MB maxBuffer). Crawl recursivo com limites: `--max-pages` (default 50), `--max-depth` (default 3), `--scope hostname`, `--scrape-mode auto` (playwright fallback para SPAs)

O resultado é a lib indexada no **store global** do docs-mcp-server (`~/.local/share/docs-mcp-server/` por default). Não há arquivo de output no projeto — o consumo é via MCP:

```text
mcp__docs-mcp-server__list_libraries   → confere o que está indexado
mcp__docs-mcp-server__find_version     → resolve versão mais próxima
mcp__docs-mcp-server__search_docs      → consulta semântica por lib@version
```

Após o scrape, declare a lib no manifest do projeto (`.context/engineering/stacks/manifest.yaml`):

```yaml
spec: devflow-stack/v0
frameworks:
  next:
    version: "15.0.0"
    mcpIndexed: true        # indexada no store global (declaração moderna)
    applyTo: ["src/**"]
```

`artisanalRef: refs/<lib>@<version>.md` é aceito apenas como **legado** (refs pré-Fase B já existentes em disco). Entradas novas usam `mcpIndexed: true`.

Em falha, prompt humano com opções `retry` / `retry-alt` / `skip` / `abort` / `edit`. Sucesso parcial só é commitado com `skip` explícito; default é `abort`.

---

## Comandos

### `devflow stacks scrape-batch [options]`

```text
devflow stacks scrape-batch [<lib1>@<version1> ...]
  [--from-package]              # detect from package.json/pyproject.toml/Cargo.toml/go.mod
  [--from-manifest]             # read wishlist: section of manifest.yaml
  [--dry-run]                   # show plan without executing
```

A execução real do batch é gated por confirmação humana — o CLI mostra o plano; o fluxo interativo roda via esta skill.

### `devflow stacks scrape <library> <version>` (single-lib)

```text
devflow stacks scrape <library> <version>
  --source=github|docs-site|local|llms-txt
  --from=<url|repo|path>
  [--auto-fallback]             # tenta discoveryHints do manifest se --from falhar
  [--dry-run]
  [--project=<path>]
```

### `devflow stacks validate [<lib>] [--strict]`

Valida o `manifest.yaml`: spec, e que cada framework declara um de `mcpIndexed: true` | `artisanalRef` | `skipDocs: true`. Para refs **legados** (`artisanalRef`), verifica adicionalmente que o arquivo existe, tem fence SI-6 e ≥5 code blocks. Entradas `mcpIndexed` passam declarativamente — confira o conteúdo via `mcp__docs-mcp-server__search_docs`.

### `devflow stacks audit <lib>@<version>`

Auditoria profunda via `scripts/lib/stack-audit.mjs`. Para entradas `mcpIndexed: true`, o check passa com a instrução de verificar o conteúdo via MCP; para refs legados `.md`, roda os checks de integridade do formato artisanal (T1–T5).

### `devflow stacks discover-source <lib>`

Lista URLs candidatas para scrape (hints curados do ADR + fallbacks GitHub raw/registry).

---

## ⚠️ NUNCA fabricar docs de stack manualmente (anti-pattern crítico)

**Regra absoluta:** o conteúdo indexado **DEVE** vir exclusivamente do pipeline de scrape (`docs-mcp-server` contra a fonte oficial). Nunca pedir ao LLM "gere a documentação baseada no que você sabe sobre essa lib", nunca declarar `mcpIndexed: true` sem um scrape real ter populado o store, nunca criar/editar arquivos `refs/*.md` à mão (formato legado ou não).

**Por quê:**

1. **Conteúdo alucinado** — docs geradas de memória do modelo misturam versões de API e inventam métodos; o scrape ancora cada snippet na fonte oficial versionada
2. **`mcpIndexed: true` fantasma** — manifest declara a lib mas `mcp__docs-mcp-server__list_libraries` não a retorna; consumers assumem cobertura que não existe
3. **Refs legados fabricados** — falham nos checks de integridade do `devflow stacks audit` (fence SI-6, headers, markers de geração manual)

**Como detectar:** `devflow stacks audit <lib>@<version>` + conferência cruzada com `mcp__docs-mcp-server__list_libraries`.

Se o pipeline real está bloqueado (URL inacessível, lib sem doc oficial), use `skipDocs: true` no `manifest.yaml` em vez de fabricar conteúdo.

---

## Segurança (SI compliance)

- **SI-2**: TODAS as chamadas de `npx @arabold/docs-mcp-server` via `child_process.execFile` com array de args (`scripts/lib/scrape-recursive.mjs`), **NUNCA** `exec()` ou shell strings
- **SI-3**: URLs validados via `validateUrl()` no `input-resolver` (Fase A) E re-validados no `resolve()` da Fase D — defesa-em-profundidade contra DNS rebinding e race conditions
- **Prompt-injection mitigada por design**: o conteúdo scraped vive no store do docs-mcp-server e só entra no contexto via consultas MCP sob demanda (resultados parciais de busca), nunca colado integralmente no prompt. Nudges de edição listam apenas `lib@version` indexadas, não conteúdo
- **SI-6 (legado)**: refs `.md` pré-Fase B mantêm fence canary + sanitização (`scripts/lib/sanitize-snippet.mjs`), verificados por `validate`/`audit`

---

## Reference

- ADR-003: `.context/engineering/adrs/003-stack-docs-artisanal-pipeline-v1.0.0.md` — decisão arquitetural original (pipeline artisanal); a migração Fase B para o store global está documentada no header de `scripts/pipeline.mjs`
- Spec original: `docs/devflow-context-layer-validation-v2-pt-br.md` §3 (pipeline detalhes), §3.4 (scrape-batch comando), §5.3
- Lib externa: `@arabold/docs-mcp-server@^2.2.1` (NÃO `docs-cli` — correção da spec; md2llm removido na Fase B)
