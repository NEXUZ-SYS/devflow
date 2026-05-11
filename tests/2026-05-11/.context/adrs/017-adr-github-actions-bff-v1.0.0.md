---
type: adr
name: adr-github-actions-bff
description: GitHub Actions nativo como CI/CD da camada BFF
scope: organizational
source: local
stack: GitHub Actions
category: infraestrutura
status: Aprovado
version: 1.0.0
created: 2026-05-11
supersedes: []
refines: []
protocol_contract: null
decision_kind: firm
summary: ""
---

# ADR — GitHub Actions como CI/CD do BFF

- **Data:** 2026-05-11
- **Status:** Aprovado
- **Escopo:** Organizacional
- **Stack:** GitHub Actions
- **Categoria:** Infraestrutura

---

## Contexto

Monorepo Turborepo com camadas independentes (Frontend, BFF, Backend, Dados). BFF combina route handlers Next + Mastra + MCP + NXZ Harness. Build precisa de pnpm install, typecheck, lint Biome, Vitest, Playwright, deploy Firebase App Hosting. Pull requests exigem feedback < 10min e gates obrigatórios antes do merge. Sem CI/CD nativo no GitHub, ciclo PREVC trava em Validation phase. Workflows precisam reuso entre camadas (composite actions) e secrets centralizados.

## Decisão

Adotar **GitHub Actions nativo** como CI/CD da camada BFF. Workflows em `.github/workflows/`. Triggers `pull_request`, `push` (main), `workflow_dispatch`. Concurrency group por ref para cancelar runs obsoletos. Cache `actions/cache` para `~/.pnpm-store` e `.next/cache`. Matrix strategy para Node 22 LTS. Reusable workflows (`workflow_call`) para etapas compartilhadas (`setup-node-pnpm`, `turbo-affected`). OIDC federation para autenticação no GCP (Workload Identity Federation) sem long-lived keys. Composite actions internas em `.github/actions/`. Secrets via Environments com required reviewers em `production`.

```
.github/workflows/bff-ci.yml            → pr + push main
.github/workflows/bff-deploy.yml        → workflow_dispatch + tag v*
.github/workflows/_setup.yml            → workflow_call (pnpm + node + cache)
.github/actions/turbo-affected/         → composite (filter por path)
```

## Alternativas Consideradas

- **GitLab CI / Bitbucket Pipelines** — exige espelhamento de repo; perde integração nativa com PR reviews, status checks e Dependabot.
- **CircleCI / Buildkite** — vendor extra; sem ganho técnico vs Actions para este stack.
- **Cloud Build (GCP)** — bom para deploy Cloud Run; fraco em PR feedback loop e matrix strategy; usado apenas em pipelines de Backend específicos.
- **Self-hosted Jenkins** — custo operacional alto; sem ergonomia de marketplace.
- **GitHub Actions nativo** ✓ — integração com PR checks, marketplace, OIDC GCP, reusable workflows, Environments com required reviewers.

## Consequências

**Positivas**
- Status check no PR sem integração externa
- OIDC federation elimina service account keys long-lived
- Marketplace acelera bootstrap (setup-node, cache, etc)
- Reusable workflows + composite actions reduzem duplicação cross-layer
- Concurrency group cancela runs obsoletos → economia de minutos

**Negativas**
- Vendor lock-in (sintaxe YAML proprietária)
- Custo por minuto em runs longos ou matrix amplo
- Debug de workflow lento (sem replay local fidedigno)

**Riscos aceitos**
- Marketplace actions de terceiros → pinning por SHA, dependabot vigia atualizações

## Guardrails

- SEMPRE pinar marketplace actions por SHA completo, não por tag (`uses: org/action@<40-char-sha>`)
- SEMPRE declarar `permissions:` mínimo no topo do workflow (least privilege)
- SEMPRE usar `concurrency: { group, cancel-in-progress: true }` em workflows de PR
- SEMPRE OIDC federation para cloud auth; NUNCA armazenar service account keys em secrets
- NUNCA secrets em `env:` de step que executa código de terceiros
- QUANDO workflow precisar de aprovação humana, ENTÃO usar Environment com required reviewers
- QUANDO etapa repete em 2+ workflows, ENTÃO extrair para reusable workflow ou composite action

## Enforcement

- [ ] Code review: rejeitar PR com action não pinada por SHA ou `permissions:` ausente
- [ ] Lint: `actionlint` em pre-commit e em workflow `meta-ci.yml`
- [ ] Teste: workflow `_setup.yml` exercitado por workflow_call dummy em PR de mudança
- [ ] Gate CI/PREVC: Validation phase exige status check `bff-ci / required` verde antes do merge

## Evidências / Anexos

**Fontes oficiais:** [GitHub Actions Documentation](https://docs.github.com/en/actions) · [Workflow syntax for GitHub Actions](https://docs.github.com/en/actions/writing-workflows/workflow-syntax-for-github-actions) · [OIDC with cloud providers](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/about-security-hardening-with-openid-connect)

```yaml
# exemplo minimal — workflow de PR com OIDC + concurrency
name: bff-ci
on:
  pull_request:
    paths: ['apps/bff/**', 'packages/contracts/**']
concurrency:
  group: bff-ci-${{ github.ref }}
  cancel-in-progress: true
permissions:
  contents: read
  id-token: write
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11  # v4.1.1
      - uses: ./.github/actions/setup-node-pnpm
      - run: pnpm turbo run typecheck lint test --filter=...[origin/main]
```
