# Spec — Bugfix: mensagem `OK:` quebrada do scrape + testes auto-fallback obsoletos

> **DevFlow workflow:** scrape-auto-fallback-ok-message · **Scale:** SMALL · **Phase:** P
> **Status:** aprovado · **Data:** 2026-06-05
> **Branch:** `fix/scrape-auto-fallback-ok-message`

## Problema

Dois testes em `tests/validation/test-scrape-auto-fallback.mjs` falham na suíte
(`node --test`), historicamente rotulados como "falhas de rede pré-existentes".
A investigação mostrou que **não são de rede** (há conectividade) — são bugs reais:

1. **Bug de produção** — `scripts/devflow-stacks.mjs:143` imprime
   `OK: undefined (hash undefined, undefined snippets, undefined sanitizations)`.
   O `runPipeline()` (em `skills/scrape-stack-batch/scripts/pipeline.mjs`) foi
   refatorado e hoje retorna `{ library, version, url, indexed }` — não mais
   `{ refPath, hash, snippetCount, sanitizationHits }`. O consumidor `cmdScrape`
   ainda lê o **contrato antigo** → todos os campos vêm `undefined`. A chamada
   também passa um `projectRoot` extra (linha 134) que `runPipeline(input)` ignora.

2. **Testes com premissa obsoleta** — os 2 testes "real network" assumem que
   `https://raw.githubusercontent.com/colinhacks/zod/main/README.md` é uma "URL
   ruim que falha no md2llm". Hoje ela **indexa com sucesso** (exit 0). Por isso:
   - O teste de recuperação-via-fallback (#1) não tem fallback (a 1ª URL já
     funciona) e bate no `OK: undefined`.
   - O teste de falha-sem-fallback (#2) espera exit 1, mas obtém exit 0.

   O guard `SKIP_NETWORK_TESTS` existe mas **nunca é setado** na suíte, então os
   testes sempre rodam e são flaky/frágeis.

## Decisão (escopo aprovado)

Corrigir o bug de produção da mensagem `OK:` (refletir o novo contrato) e tornar
os testes **determinísticos por padrão**, com a cobertura que exige rede real
virando **opt-in** (`RUN_NETWORK_TESTS=1`).

## Design

### D1 — Fix de produção + testabilidade (`scripts/devflow-stacks.mjs`)
- **Main-guard:** `main().catch(...)` passa a rodar só quando o arquivo é o
  entrypoint (`import.meta.url === \`file://${process.argv[1]}\``), permitindo
  importar funções puras sem disparar o CLI.
- **Função pura exportada** `formatScrapeOk(result)` →
  `OK: indexed ${result.library}@${result.version} from ${result.url}`.
- `cmdScrape` usa `formatScrapeOk(result)` (linha ~143) e remove o `projectRoot`
  extra da chamada `runPipeline` (linha ~134): `runPipeline({ library, version, url, type: opts.source })`.

### D2 — Testes determinísticos + opt-in (`tests/validation/test-scrape-auto-fallback.mjs`)
- **Guard invertido:** `RUN_NETWORK = process.env.RUN_NETWORK_TESTS === "1"`; os
  testes que precisam de rede real usam `{ skip: !RUN_NETWORK }` (skip por padrão).
- **Unit test (sempre roda):** importa `formatScrapeOk`; assere o formato do novo
  contrato (`{library, version, url, indexed}`). É o teste-âncora do bug de produção.
- **Teste #2 (sempre roda):** sem `--auto-fallback` contra
  `https://nonexistent-host.invalid/` → exit 1 + `SCRAPE FAILED:` (DNS fail local,
  determinístico, ~3s).
- **Teste all-failed (sempre roda):** `--auto-fallback` com `--from` + 1 hint
  ambos `.invalid` → exit 1 + `tried 2 URL(s)`.
- **Teste #1 (opt-in):** `{ skip: !RUN_NETWORK }`; `--from=.invalid` (falha) →
  hint `https://zod.dev/` (sucesso) → exit 0 + `OK: indexed zod...` +
  `Auto-fallback: tried 2 URL(s)`.

## Restrições (ADR-003 — pipeline artesanal de stack docs)
- O pipeline de scrape continua via docs-mcp-server CLI; este fix **não** muda o
  pipeline nem o contrato de `runPipeline` — apenas alinha o **consumidor** ao
  contrato atual e ajusta os testes.

## Critérios de aceitação
1. `cmdScrape` no caminho de sucesso imprime `OK: indexed <lib>@<ver> from <url>`
   (sem `undefined`); `formatScrapeOk` coberto por unit test determinístico (RED→GREEN).
2. Teste #2 (host `.invalid`, sem fallback) → exit 1 + `SCRAPE FAILED:`,
   determinístico, sem depender de premissa volátil.
3. Teste all-failed (`--auto-fallback`, 2 hosts `.invalid`) → exit 1 + `tried 2 URL(s)`.
4. Teste #1 (sucesso via fallback) marcado opt-in (`RUN_NETWORK_TESTS=1`) e
   corrigido para o novo contrato.
5. Suíte `node --test tests/validation/*.mjs` 100% verde **sem** `RUN_NETWORK_TESTS`
   (zero falhas; as 2 falhas antigas eliminadas).

## Escopo
- **IN:** fix da mensagem `OK:` + main-guard + `formatScrapeOk` exportada;
  alinhamento da chamada `runPipeline`; reescrita determinística + opt-in dos testes.
- **OUT:** mudar `runPipeline`/pipeline.mjs; mockar a rede via DI; alterar o
  comportamento de fallback em si (a ordenação de URLs e dedupe já têm testes verdes).

## TDD
- `formatScrapeOk`: unit test RED (função inexistente / formato antigo) → GREEN.
- Testes E2E (spawnSync do CLI real) determinísticos para os caminhos de falha;
  o caminho de sucesso real fica opt-in (rede).
