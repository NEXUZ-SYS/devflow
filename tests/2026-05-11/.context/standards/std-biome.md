---
id: std-biome
description: Biome 2.x como linter e formatter TS/JS na camada Frontend
version: 1.0.0
applyTo: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"]
relatedAdrs: ["adr-biome-frontend"]
enforcement:
  linter: standards/machine/std-biome.js
weakStandardWarning: true
---
# Standard: biome
## Princípios
Adotar **Biome 2.x** como linter e formatter de TS/JS/JSX/JSON/CSS no Frontend. Substitui ESLint + Prettier. Config canônica em `biome.json` na raiz do workspace; overrides por package em `apps/web/biome.json`. `linter.rules.recommended: true` + recommended `style`, `correctness`, `security`, `nursery` (curado), `a11y`. `formatter.indentStyle: space`, `formatter.lineWidth: 100`. Importa via `npx @biomejs/biome migrate eslint`/`prettier` no bootstrap. Sem `.eslintrc`, sem `.prettierrc` em packages do Frontend (limpeza obrigatória).

```
biome.json                              → config canônica (root)
apps/web/biome.json                     → extends + overrides
packages/ui/biome.json                  → extends + overrides
.vscode/settings.json                   → biome como default formatter
```
## Anti-patterns
| Errado | Certo |
|---|---|
| coexistir com `.eslintrc*` ou `.prettierrc*` no Frontend (`migrate` obrigatório) | Aplicar a alternativa explicitada na ADR (Decisão / Enforcement) |
| desabilitar regra `correctness.*` sem justificativa em comentário inline `// biome-ignore lint/correctness/<rule>: <razão>` | Aplicar a alternativa explicitada na ADR (Decisão / Enforcement) |
## Linter
`./machine/std-biome.js` verifica:

1. rejeitar PR com `biome-ignore` sem justificativa textual
2. `biome ci apps/web packages/ui` em workflow `bff-ci.yml` (status check obrigatório)
3. hook pre-commit (`lint-staged` → `biome check --write --no-errors-on-unmatched`)
4. Validation phase exige `pnpm turbo run check` verde (engloba `biome ci`)

Output em formato `VIOLATION: <regra> (<file>:<line>) — <correção sugerida>` per SI-4 contract.
## Referência
ADRs derivadas:
- adr-biome-frontend (`018-adr-biome-frontend-v1.0.0.md`)
Fontes oficiais (consolidadas das ADRs):

**Fontes oficiais:** [Biome — Getting Started](https://biomejs.dev/guides/getting-started/) · [Biome — Linter Rules](https://biomejs.dev/linter/rules/) · [Biome — Migrate from ESLint/Prettier](https://biomejs.dev/guides/migrate-eslint-prettier/)
Authoring guide: `.context/standards/README.md`
