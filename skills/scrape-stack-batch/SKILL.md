---
name: scrape-stack-batch
description: "Use when the user wants to populate or refresh .context/stacks/refs/ with versioned framework documentation. Trigger words: 'scrape stacks', 'gerar refs', 'atualizar stacks', 'refresh stack docs', 'devflow stacks scrape', 'scrape-batch'. Also trigger when /devflow init detects stacks in package.json/pyproject.toml/Cargo.toml/go.mod and the user wants to bootstrap their docs. Two modes: BATCH (multiple libs from package.json|manifest wishlist|args; per-stack discovery + confirmation + parallel scrape) and SINGLE (one lib with explicit source). Pipeline: docs-mcp-server CLI fetch-url + md2llm + SI-6 sanitization + git commit."
version: 0.1.0
deps:
  external:
    - "@arabold/docs-mcp-server@^2.2.1"
    - "md2llm@^1.1.0"
  internal:
    - "scripts/lib/url-validator.mjs"
    - "scripts/lib/sanitize-snippet.mjs"
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

Discovers official documentation sources for npm/PyPI/crates libraries and generates `artisanalRef` files in `.context/stacks/refs/<lib>@<version>.md` via the artisanal pipeline (docs-mcp-server CLI + md2llm).

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

Pipeline em 4 stages, paralelizado (default `--concurrency=3`):

1. **RESOLVE** — valida lib/version contra slug regex; revalida URL (SI-3 defesa-em-profundidade); cria tmp work dir
2. **SCRAPE** — `execFile('npx', ['-y', '@arabold/docs-mcp-server@2.2.1', 'fetch-url', url])` (NUNCA shell, SI-2; 5min timeout, 50MB maxBuffer)
3. **REFINE** — `execFile('npx', ['-y', 'md2llm@1.1.0', refinedDir, rawDir, '--source-url', url])`
4. **CONSOLIDATE** — concat snippets ordenados; `sanitizeSnippet()` strips role markers + wraps em fence canary `<<<DEVFLOW_STACK_REF_START_<sha256>>>>` (SI-6); escreve em `.context/stacks/refs/`; cleanup tmp

Em falha, prompt humano com 5 opções: `retry` / `retry-alt` / `skip` / `abort` / `edit`. Sucesso parcial só é commitado com `skip` explícito; default é `abort` (rollback transacional).

---

## Comandos

### `devflow stacks scrape-batch [options]`

```text
devflow stacks scrape-batch [<lib1>@<version1> ...]
  [--from-package]              # detect from package.json/pyproject.toml/Cargo.toml/go.mod
  [--from-manifest]             # read wishlist: section of .context/stacks/manifest.yaml
  [--strategy=registry|llms-txt|web-search|all]   # default: all
  [--dry-run]                   # show plan without executing
  [--concurrency=N]             # default: 3
  [--output-format=text|json]   # default: text
```

### `devflow stacks scrape <library> <version>` (single-lib)

```text
devflow stacks scrape <library> <version>
  --source=github|docs-site|local|llms-txt
  --from=<url|repo|path>
  [--mode=create|refresh|validate]
  [--dry-run]
```

`--mode`:
- `create` (default) — fail if `refs/<lib>@<version>.md` exists
- `refresh` — overwrite, regenerate hash, commit as "refresh"
- `validate` — don't regen; just confirm sanity checks (≥5 snippets, headers, hash)

### `devflow stacks validate [<lib>]`

Verifies every `artisanalRef` declared in `manifest.yaml` exists in `refs/`, has SI-6 fence start/end markers, and contains at least 5 code blocks (md2llm sanity).

---

## Segurança (SI compliance)

- **SI-2**: TODAS chamadas de `npx @arabold/docs-mcp-server` e `npx md2llm` via `child_process.execFile` com array de args, **NUNCA** `exec()` ou shell strings
- **SI-3**: URLs validados via `validateUrl()` no `input-resolver` (Fase A) E re-validados no `resolve()` da Fase D — defesa-em-profundidade contra DNS rebinding e race conditions
- **SI-6**: Conteúdo scraped passa por `sanitizeSnippet()` antes de consolidar — strips role markers (`SYSTEM:`/`USER:`/`ASSISTANT:`/`HUMAN:`), strips ignore-instructions phrases, wraps em fence delimitador com sha256 canary
- Prompt-injection mitigada por design: snippets nunca colados diretamente no prompt do agent — hooks PreToolUse os injetam dentro de `<STACK_FOR_TASK>` block que é explicitamente de baixa autoridade

---

## Reference

- ADR-003: `.context/adrs/003-stack-docs-artisanal-pipeline-v1.0.0.md` — decisão arquitetural
- Spec original: `docs/devflow-context-layer-validation-v2-pt-br.md` §3 (pipeline detalhes), §3.4 (scrape-batch comando), §5.3 (este ADR)
- Lib externa: `@arabold/docs-mcp-server@^2.2.1` (NÃO `docs-cli` — correção da spec)
- Lib externa: `md2llm@^1.1.0`
