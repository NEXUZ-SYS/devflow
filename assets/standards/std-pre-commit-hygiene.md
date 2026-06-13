---
id: std-pre-commit-hygiene
description: Format + lint + typecheck obrigatórios antes de cada commit, via hook staged-only
version: 1.0.0
source: devflow-default
applyTo: ["**/*"]
activation: on-demand
relatedAdrs: []
enforcement:
  linter: null
  enforcedBy: hook:pre-commit
---
> Enforcement é repo-level (presença de hook + scripts), não um linter de arquivo SI-4. O gate é a existência de `.husky/`, `lefthook.yml` ou `.pre-commit-config.yaml` + scripts `format`/`lint`/`typecheck` no `package.json`. Ver hooks de projeto.

## Princípios

- Todo commit passa por formatter + linter + typechecker antes de aterrissar no working tree
- Hooks rodam em modo staged-only para velocidade; o CI roda a suíte full no PR
- Falha de hook bloqueia o commit; `--no-verify` é exceção justificada e documentada, nunca a regra
- Editor formata e organiza imports no save (settings versionados no repo)
- Os scripts (`format`, `lint`, `typecheck`) são idempotentes e rodáveis isoladamente
- O hook é versionado (`.husky/`, `lefthook.yml` ou `.pre-commit-config.yaml`) — não depende de setup manual por dev

## Anti-patterns

| Errado | Corrija para |
|---|---|
| `--no-verify` como hábito para "ir mais rápido" | Investigar e corrigir a falha; skip só em emergência documentada |
| Lint só roda no CI, não local | Hook pre-commit roda lint nos staged; CI roda full |
| Format-on-save desabilitado | Editor formata + organiza imports (settings versionados) |
| Hook instalado manualmente por cada dev | Hook versionado no repo, instalado no `postinstall` |
