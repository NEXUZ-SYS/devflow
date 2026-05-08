---
id: std-husky-lint-staged
description: husky 9.x + lint-staged 15.x como Git hooks pre-commit na camada Frontend
version: 1.0.0
applyTo: [".husky/**", "package.json"]
relatedAdrs: ["adr-husky-lint-staged-frontend"]
enforcement:
  linter: standards/machine/std-husky-lint-staged.js
weakStandardWarning: true
---
# Standard: husky-lint-staged
## Princípios
Adotar **husky 9.x** como Git hooks manager + **lint-staged 15.x** como runner por-arquivo-staged. Hooks instalados via `husky init` no `postinstall`. `pre-commit` roda lint-staged: Biome (`check --write --staged`), `tsc --noEmit` por package afetado, scan de secrets (gitleaks). `commit-msg` valida Conventional Commits via commitlint. `pre-push` roda Vitest changed-only. Hooks **bypassáveis** via `--no-verify` apenas em emergência justificada; CI replica todas as checagens como gate hard.
## Anti-patterns
| Errado | Certo |
|---|---|
| usar `--no-verify` sem motivo + ticket; documentar em commit body. | Aplicar a alternativa explicitada na ADR (Decisão / Enforcement) |
| rodar suite completa de testes no `pre-commit` — apenas changed-only no `pre-push`. | Aplicar a alternativa explicitada na ADR (Decisão / Enforcement) |
## Linter
`./machine/std-husky-lint-staged.js` verifica:

1. bloqueia commits com `--no-verify` sem justificativa em commit body.
2. `biome check --error-on-warnings` no `pre-commit` via lint-staged.
3. Pre-commit: `lint-staged` + `gitleaks protect --staged` + `tsc --noEmit` por package afetado.
4. required checks replicam pre-commit e pre-push (defense in depth).
5. Gate PREVC: scripts `pnpm prepare` + `pnpm verify` documentados em README; falha de hook = falha de gate.

Output em formato `VIOLATION: <regra> (<file>:<line>) — <correção sugerida>` per SI-4 contract.
## Referência
ADRs derivadas:
- adr-husky-lint-staged-frontend (`020-adr-husky-lint-staged-frontend-v1.0.0.md`)
Fontes oficiais (consolidadas das ADRs):

**Fontes oficiais:**
- [husky Documentation](https://typicode.github.io/husky/)
- [husky 9 Migration](https://typicode.github.io/husky/migrate-from-v4.html)
- [lint-staged Repository](https://github.com/lint-staged/lint-staged)
- [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)
- [commitlint](https://commitlint.js.org/)
- [Git Hooks Reference](https://git-scm.com/docs/githooks)
    "*.{ts,tsx,js,jsx,json}": ["biome check --write --no-errors-on-unmatched"],
    "*.{ts,tsx}": ["bash -c 'pnpm turbo run typecheck --filter=...[HEAD^]'"],
    "*": ["gitleaks protect --staged --redact"]
Authoring guide: `.context/standards/README.md`
