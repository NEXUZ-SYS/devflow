---
id: std-github-actions
description: GitHub Actions nativo como CI/CD da camada BFF
version: 1.0.0
applyTo: []
relatedAdrs: ["adr-github-actions-bff"]
enforcement:
  linter: standards/machine/std-github-actions.js
weakStandardWarning: true
---
# Standard: github-actions
## Princípios
Adotar **GitHub Actions nativo** como CI/CD da camada BFF. Workflows em `.github/workflows/`. Triggers `pull_request`, `push` (main), `workflow_dispatch`. Concurrency group por ref para cancelar runs obsoletos. Cache `actions/cache` para `~/.pnpm-store` e `.next/cache`. Matrix strategy para Node 22 LTS. Reusable workflows (`workflow_call`) para etapas compartilhadas (`setup-node-pnpm`, `turbo-affected`). OIDC federation para autenticação no GCP (Workload Identity Federation) sem long-lived keys. Composite actions internas em `.github/actions/`. Secrets via Environments com required reviewers em `production`.

```
.github/workflows/bff-ci.yml            → pr + push main
.github/workflows/bff-deploy.yml        → workflow_dispatch + tag v*
.github/workflows/_setup.yml            → workflow_call (pnpm + node + cache)
.github/actions/turbo-affected/         → composite (filter por path)
```
## Anti-patterns
| Errado | Certo |
|---|---|
| secrets em `env:` de step que executa código de terceiros | Aplicar a alternativa explicitada na ADR (Decisão / Enforcement) |
## Linter
`./machine/std-github-actions.js` verifica:

1. rejeitar PR com action não pinada por SHA ou `permissions:` ausente
2. `actionlint` em pre-commit e em workflow `meta-ci.yml`
3. workflow `_setup.yml` exercitado por workflow_call dummy em PR de mudança
4. Validation phase exige status check `bff-ci / required` verde antes do merge

Output em formato `VIOLATION: <regra> (<file>:<line>) — <correção sugerida>` per SI-4 contract.
## Referência
ADRs derivadas:
- adr-github-actions-bff (`017-adr-github-actions-bff-v1.0.0.md`)
Fontes oficiais (consolidadas das ADRs):

**Fontes oficiais:** [GitHub Actions Documentation](https://docs.github.com/en/actions) · [Workflow syntax for GitHub Actions](https://docs.github.com/en/actions/writing-workflows/workflow-syntax-for-github-actions) · [OIDC with cloud providers](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/about-security-hardening-with-openid-connect)
Authoring guide: `.context/standards/README.md`
