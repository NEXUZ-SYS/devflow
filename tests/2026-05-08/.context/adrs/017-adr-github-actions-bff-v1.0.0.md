---
type: adr
name: adr-github-actions-bff
description: GitHub Actions nativo como CI/CD da camada BFF do monorepo Turborepo
scope: organizational
source: local
stack: GitHub Actions
category: infraestrutura
status: Aprovado
version: 1.0.0
created: 2026-05-08
supersedes: []
refines: []
protocol_contract: null
decision_kind: firm
summary: ""
---

# ADR — GitHub Actions na Camada BFF

- **Data:** 2026-05-08
- **Status:** Aprovado
- **Escopo:** Organizacional
- **Stack:** GitHub Actions
- **Categoria:** Infraestrutura

## Contexto

Monorepo Turborepo com 4 camadas (Frontend/BFF/Backend/Dados). Camada BFF: route handlers Next + Vercel AI SDK + Mastra + MCP, deploy junto com frontend em Firebase App Hosting. Pipeline precisa de affected-build (apenas pacotes alterados via `turbo run --filter`), cache remoto, gate de typecheck/lint/test, deploy gated por branch (`main` → prod, `staging` → preview), OIDC para Google Cloud sem long-lived keys, matrix Node 22.x. CI atrelado ao GitHub é fonte de verdade do repositório.

## Decisão

Adotar **GitHub Actions** como pipeline único de CI/CD do monorepo. Workflows reutilizáveis (`workflow_call`) por camada, com `paths-filter` + `turbo run --filter=...[origin/main]` para affected-only. Cache via `actions/cache` para `~/.pnpm-store` e `node_modules/.cache/turbo`. Deploy ao Firebase App Hosting via `google-github-actions/auth` com OIDC + Workload Identity Federation. Concurrency group por branch para cancelar runs obsoletos. Required checks (typecheck, lint, test, build) bloqueiam merge.

## Alternativas Consideradas

- **CircleCI** — orbs maduros, porém vendor externo, OIDC mais limitado, custo extra de integração.
- **GitLab CI** — exige espelhamento ou migração de host; perde nativo `gh pr`.
- **Cloud Build** — bom para GCP, fraco em PR-feedback e matrix de Node; sem ecossistema de actions reutilizáveis.
- **Jenkins** — overhead operacional (master/agents), sem OIDC nativo para GitHub.
- **GitHub Actions** ✓ — nativo ao SCM, OIDC com GCP, marketplace amplo, `workflow_call` para reuso, custo previsível em repos com Actions minutes.

## Consequências

**Positivas**
- PR feedback acoplado ao SCM (status checks, annotations, required reviews).
- OIDC + Workload Identity Federation elimina service account keys.
- Affected-only via Turbo reduz tempo médio de pipeline em monorepo.
- Workflows reutilizáveis evitam duplicação entre camadas.
- Cache remoto Turbo + pnpm store acelera builds incrementais.

**Negativas**
- Vendor lock-in parcial (sintaxe YAML específica, marketplace de actions).
- Custo por minuto em runners hosted; jobs longos exigem self-hosted runners.
- Debug local limitado (`act` cobre subset).

**Riscos aceitos**
- Supply chain de actions de terceiros — mitigado por pin de SHA, allowlist em `permissions:`, Dependabot para `actions/*`.
- Outage do GitHub Actions trava deploy — aceitável com runbook de deploy manual via gcloud.

## Guardrails

- SEMPRE pinar actions de terceiros por SHA (`uses: foo/bar@<sha>`); NUNCA por tag mutável.
- SEMPRE declarar `permissions:` mínimas no nível de workflow ou job (`contents: read`, `id-token: write`).
- SEMPRE usar OIDC + WIF para GCP/Firebase; NUNCA `GOOGLE_APPLICATION_CREDENTIALS` com chave JSON em secrets.
- SEMPRE `concurrency.group` + `cancel-in-progress: true` em workflows de PR.
- NUNCA expor secrets em `run:` via `echo`; usar `::add-mask::` quando inevitável.
- QUANDO touch em `apps/bff/**`, ENTÃO disparar workflow `bff-ci.yml` via `paths-filter`.
- QUANDO branch = `main`, ENTÃO required checks: `typecheck`, `lint`, `test`, `build`, `e2e-smoke`.

## Enforcement

- [ ] Code review: bloqueia tags mutáveis (`@v1`), `permissions: write-all`, segredos em texto plano.
- [ ] Branch protection: required status checks + signed commits + linear history em `main`.
- [ ] Lint: `actionlint` em pre-commit + CI; `zizmor` para auditoria de segurança de workflows.
- [ ] Teste: workflow de smoke (`workflow_dispatch`) valida deploy em ambiente preview pós-merge.
- [ ] Gate PREVC: pipeline `bff-ci.yml` verde obrigatório antes de merge para `main`.

## Evidências / Anexos

**Fontes oficiais:**
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Reusable Workflows](https://docs.github.com/en/actions/using-workflows/reusing-workflows)
- [OIDC with Google Cloud](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-google-cloud-platform)
- [google-github-actions/auth](https://github.com/google-github-actions/auth)
- [Turborepo Remote Caching](https://turbo.build/repo/docs/core-concepts/remote-caching)

```yaml
# .github/workflows/bff-ci.yml
name: bff-ci
on:
  pull_request:
    paths: ["apps/bff/**", "packages/contracts/**"]
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
      - uses: actions/checkout@<sha>
      - uses: pnpm/action-setup@<sha>
      - uses: actions/setup-node@<sha>
        with: { node-version: "22.x", cache: "pnpm" }
      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo run typecheck lint test build --filter=bff...[origin/main]
```
