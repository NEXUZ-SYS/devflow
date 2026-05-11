---
id: std-github-actions
description: GitHub Actions nativo como CI/CD da camada BFF do monorepo Turborepo
version: 1.0.0
applyTo: []
relatedAdrs: ["adr-github-actions-bff"]
enforcement:
  linter: standards/machine/std-github-actions.js
weakStandardWarning: true
---
# Standard: github-actions
## Princípios
Adotar **GitHub Actions** como pipeline único de CI/CD do monorepo. Workflows reutilizáveis (`workflow_call`) por camada, com `paths-filter` + `turbo run --filter=...[origin/main]` para affected-only. Cache via `actions/cache` para `~/.pnpm-store` e `node_modules/.cache/turbo`. Deploy ao Firebase App Hosting via `google-github-actions/auth` com OIDC + Workload Identity Federation. Concurrency group por branch para cancelar runs obsoletos. Required checks (typecheck, lint, test, build) bloqueiam merge.
## Anti-patterns
| Errado | Certo |
|---|---|
| expor secrets em `run:` via `echo`; usar `::add-mask::` quando inevitável. | Aplicar a alternativa explicitada na ADR (Decisão / Enforcement) |
## Linter
`./machine/std-github-actions.js` verifica:

1. bloqueia tags mutáveis (`@v1`), `permissions: write-all`, segredos em texto plano.
2. Branch protection: required status checks + signed commits + linear history em `main`.
3. `actionlint` em pre-commit + CI; `zizmor` para auditoria de segurança de workflows.
4. workflow de smoke (`workflow_dispatch`) valida deploy em ambiente preview pós-merge.
5. Gate PREVC: pipeline `bff-ci.yml` verde obrigatório antes de merge para `main`.

Output em formato `VIOLATION: <regra> (<file>:<line>) — <correção sugerida>` per SI-4 contract.
## Referência
ADRs derivadas:
- adr-github-actions-bff (`017-adr-github-actions-bff-v1.0.0.md`)
Fontes oficiais (consolidadas das ADRs):

**Fontes oficiais:**
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Reusable Workflows](https://docs.github.com/en/actions/using-workflows/reusing-workflows)
- [OIDC with Google Cloud](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-google-cloud-platform)
- [google-github-actions/auth](https://github.com/google-github-actions/auth)
- [Turborepo Remote Caching](https://turbo.build/repo/docs/core-concepts/remote-caching)
Authoring guide: `.context/standards/README.md`
