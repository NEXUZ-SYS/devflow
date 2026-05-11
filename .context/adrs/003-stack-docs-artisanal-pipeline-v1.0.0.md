---
type: adr
name: stack-docs-artisanal-pipeline
description: stacks/manifest.yaml com artisanalRef apontando para .md scraped por docs-mcp-server CLI + md2llm, lido via filesystem no PreToolUse
scope: organizational
source: local
stack: universal
category: arquitetura
status: Aprovado
version: 1.0.0
created: 2026-05-06
supersedes: []
refines: []
protocol_contract: null
decision_kind: firm
summary: "Pipeline artesanal (docs-mcp-server CLI fetch-url + md2llm) gera .context/stacks/refs/<lib>@<version>.md versionado em git, lido via filesystem no PreToolUse com filtragem semântica via context-filter.mjs e sanitização SI-6. Sem SaaS, sem rate limits, replay determinístico via hash do .md."
---

# ADR 003 — Stack docs via pipeline artesanal (`docs-mcp-server` CLI + `md2llm`)

- **Data:** 2026-05-06
- **Status:** Proposto
- **Escopo:** Organizacional
- **Stack:** universal
- **Categoria:** Arquitetura

---

## Contexto

Agentes alucinam APIs entre versões major (React 19 vs 18, Next.js 15 vs 14, Prisma 5 vs 4). Knowledge cutoff do LLM não cobre releases recentes. A v1 do plano context-layer propunha Context7 SaaS como fonte de docs em runtime. Benchmark documental (`benchmark-context7-vs-artesanal-pt-br.md`) mostrou pipeline artesanal vencendo em 4/4 métricas: latency 70x mais rápido (30ms vs 1.000ms), tokens -33% por chamada, recall estimado +11pp, custo $0 vs $28-108/mês. Adicionalmente, Context7 cortou free tier 92% em jan/2026 e teve vulnerabilidade ContextCrush em fev/2026 — sinais de risco arquitetural do modelo SaaS centralizado.

## Drivers

- Determinismo: replay regulatório requer hash estável das docs; SaaS reordena/re-ranqueia entre chamadas
- Latência: 30ms (filesystem) vs 1.000ms (Context7) por chamada de hook
- Custo: $0 vs $28-108/mês para time de 4 devs com uso intenso
- Resiliência: outage SaaS no caminho crítico do PreToolUse hook quebra workflow
- Governance: ContextCrush demonstrou superfície de ataque inerente ao registry centralizado
- Auditoria: cada `.context/stacks/refs/<lib>@<version>.md` versionado em git tem hash estável referenciado pelo `.lock` e pelo reproducibility token

## Decisão

`.context/stacks/manifest.yaml` declara `artisanalRef: refs/<lib>@<version>.md` apontando para arquivo gerado por pipeline em 4 estágios:

1. **RESOLVE** — valida `<lib>@<version>` contra `manifest.yaml`
2. **SCRAPE** — invoca `npx -y @arabold/docs-mcp-server@2.2.1 fetch-url <url>` (sem shell, via execFile per SI-2; URL valida via SI-3)
3. **REFINE** — invoca `npx -y md2llm@1.1.0 <refined-dir> <raw-dir>` para extrair snippets em formato `TITLE/DESCRIPTION/SOURCE/LANGUAGE/CODE`
4. **CONSOLIDATE** — sanitiza via `scripts/lib/sanitize-snippet.mjs` (SI-6 strips role markers + ignore-instructions + canary fence sha256), concatena alfabeticamente, registra hash em `.context/.lock`, commita

PreToolUse hook lê o `.md` direto do filesystem via `context-filter.mjs`, aplica filtragem semântica por `applyTo` glob + task keywords. Sem dependência externa em runtime. Bibliotecas ad-hoc não pinadas requerem `devflow stacks scrape <lib> <version>` explícito antes da primeira task — não há fallback automático.

> **Correção da spec original:** o package é `@arabold/docs-mcp-server@^2.2.1`; o bin é `docs-mcp-server` (NÃO `docs-cli` como apareceu no §3.4 da spec). Comando correto: `npx -y @arabold/docs-mcp-server@2.2.1 fetch-url <url>`.

## Alternativas Consideradas

- **Context7 SaaS auto-resolve** — rejeitado por custo, latência, accuracy 65%, risco de outage e ContextCrush
- **Context7 como fallback ad-hoc** — rejeitado por manter dependência SaaS no caminho crítico e complexidade de "qual fonte usar"
- **`docs-mcp-server` como MCP runtime completo (Opção 2)** — registrado em §3.7 do benchmark como roadmap futuro; Opção 1 (CLI headless) é mais simples e cobre 100% dos requisitos atuais
- **Sem pinning, sempre `latest` via Context7** — rejeitado por quebrar reproducibility a cada major release
- **Pipeline artesanal com `docs-mcp-server` CLI + `md2llm`** ✓ — escolhido: filesystem read determinístico, custo zero, replay estável, controle total

## Consequências

**Positivas**
- Latency runtime ~30ms vs 1.000ms do Context7
- Custo recorrente $0 (vs $28-108/mês)
- Replay determinístico via hash em `.context/.lock`
- Sem rate limit, sem dependência SaaS no caminho crítico
- Auditoria limpa: cada doc é blob versionado em git com autor humano explícito
- Pipeline integra SI-2 (execFile only), SI-3 (URL allowlist), SI-6 (snippet sanitization) em camada única

**Negativas**
- Manutenção manual: ~2.5h/mês para 5 libs core (vs 0h com SaaS)
- Setup inicial ~2-3h para configurar pipeline (vs 0h com Context7)
- Bibliotecas ad-hoc requerem comando explícito antes da primeira task (vs lookup automático)

**Riscos aceitos**
- Lib nova lançada na semana espera próximo refresh manual (mitigação: `devflow stacks scrape <lib> <version>` em <3 min)
- Doc fica desatualizada até refresh (mitigação: drift detection nightly compara `package.json` vs manifest — ver §2.5 do plano)

## Guardrails

- SEMPRE declarar `artisanalRef: refs/<lib>@<version>.md` para frameworks com `applyTo` cobrindo >5% do código do projeto
- SEMPRE versionar `.context/stacks/refs/*.md` em git (não gitignore)
- SEMPRE invocar pipeline binaries via `child_process.execFile`, NUNCA `exec` ou shell (SI-2)
- SEMPRE validar URLs via `validateUrl()` antes de passar para `fetch-url` (SI-3)
- SEMPRE sanitizar conteúdo scraped via `sanitizeSnippet()` antes de consolidar (SI-6)
- NUNCA chamar Context7 ou outro SaaS de docs em hooks runtime
- QUANDO library tem API estável (Postgres, lodash), ENTÃO marcar `skipDocs: true` e omitir `artisanalRef`
- QUANDO scraping fonte oficial não é possível (lib privada sem doc pública), ENTÃO documentar fonte alternativa em `source.notes` e usar input local

## Enforcement

- [ ] Code review: PR que altera framework version major deve incluir refresh do `artisanalRef` correspondente
- [ ] Lint: `devflow stacks validate` checa que todo `artisanalRef` declarado tem arquivo existente em `stacks/refs/`
- [ ] Teste: smoke test em CI executa `devflow stacks validate` para confirmar que cada `.md` tem ≥5 blocos de código (sanity check md2llm) E começa com fence canary `<<<DEVFLOW_STACK_REF_START_<sha256>>>>` (SI-6)
- [ ] Gate CI/PREVC: `devflow context drift` falha PR se `package.json` tem versão major diferente do manifest sem ADR de upgrade
- [ ] Hash do `.md` registrado em `.context/.lock` e referenciado pelo reproducibility token (Gap 4)

## Evidências / Anexos

- Benchmark detalhado: `docs/benchmark-context7-vs-artesanal-pt-br.md` (não gerado neste workflow; referenciado da spec original)
- Ferramentas: [`@arabold/docs-mcp-server`](https://github.com/arabold/docs-mcp-server) v2.2.1 · [`md2llm`](https://github.com/godaddy/md2llm) v1.1.0
- Plano de implementação: `.context/plans/context-layer-v2.md` Task Groups 2.0 a 2.5
- Spec original: `docs/devflow-context-layer-validation-v2-pt-br.md` §3 (pipeline detalhes) + §5.3 (este ADR)
- Security invariants exercitados: SI-2 (execFile), SI-3 (url-validator.mjs), SI-6 (sanitize-snippet.mjs)
