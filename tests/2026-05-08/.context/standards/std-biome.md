---
id: std-biome
description: Biome 2.x como linter e formatter unificado de TS/JS na camada Frontend
version: 1.0.0
applyTo: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"]
relatedAdrs: ["adr-biome-frontend"]
enforcement:
  linter: standards/machine/std-biome.js
weakStandardWarning: true
---
# Standard: biome
## Princípios
Adotar **Biome 2.x** como ferramenta única de lint + format para TS/JS/JSX/JSON/CSS na camada Frontend. Substitui ESLint + Prettier + `eslint-plugin-import` + `eslint-plugin-simple-import-sort`. Configuração via `biome.json` na raiz do workspace, com overrides por package. Regras recomendadas habilitadas + custom para FSD layer enforcement via `noRestrictedImports`. Format on save no IDE, `biome ci` no pipeline. Single-binary, zero deps Node em runtime.
## Anti-patterns
| Errado | Certo |
|---|---|
| coexistir com ESLint ou Prettier no mesmo workspace (remover devDeps + configs legados). | Aplicar a alternativa explicitada na ADR (Decisão / Enforcement) |
| suprimir regras com `// biome-ignore` sem motivo + ticket de débito. | Aplicar a alternativa explicitada na ADR (Decisão / Enforcement) |
## Linter
`./machine/std-biome.js` verifica:

1. bloqueia `// biome-ignore` sem justificativa + reintrodução de ESLint/Prettier.
2. `biome check --error-on-warnings` no CI; falha quebra pipeline.
3. Pre-commit: lint-staged dispara `biome check --write --staged`.
4. snapshot do `biome.json` versionado; mudança requer review explícito.
5. Gate PREVC: `pnpm biome:ci` obrigatório antes do merge.

Output em formato `VIOLATION: <regra> (<file>:<line>) — <correção sugerida>` per SI-4 contract.
## Referência
ADRs derivadas:
- adr-biome-frontend (`018-adr-biome-frontend-v1.0.0.md`)
Fontes oficiais (consolidadas das ADRs):

**Fontes oficiais:**
- [Biome Documentation](https://biomejs.dev/)
- [Biome 2.0 Release Notes](https://biomejs.dev/blog/biome-v2/)
- [Biome Linter Rules](https://biomejs.dev/linter/rules/)
- [Biome Configuration](https://biomejs.dev/reference/configuration/)
  "files": { "ignore": ["**/dist/**", "**/.next/**", "**/coverage/**"] }
Authoring guide: `.context/standards/README.md`
