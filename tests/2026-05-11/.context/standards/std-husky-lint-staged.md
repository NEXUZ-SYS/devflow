---
id: std-husky-lint-staged
description: husky 9.x + lint-staged 15.x como git hooks pre-commit na camada Frontend
version: 1.0.0
applyTo: [".husky/**", "package.json"]
relatedAdrs: ["adr-husky-lint-staged-frontend"]
enforcement:
  linter: standards/machine/std-husky-lint-staged.js
weakStandardWarning: true
---
# Standard: husky-lint-staged
## Princípios
Adotar **husky 9.x** como gerenciador de git hooks e **lint-staged 15.x** como runner sobre arquivos staged. Hooks em `.husky/`. `pre-commit` invoca `lint-staged`. Config canônica de lint-staged em `.lintstagedrc.json` na raiz. Hooks `commit-msg` (commitlint via subprocess) e `pre-push` (typecheck) opcionais. Instalação automática via `"prepare": "husky"` em `package.json` (executado por pnpm). `lint-staged` glob por extensão executa `biome check --write --no-errors-on-unmatched` em `.ts/.tsx/.js/.jsx/.json` e `biome format --write` em `.css/.md`.

```
.husky/pre-commit                       → npx lint-staged
.husky/commit-msg                       → npx commitlint --edit "$1"
.lintstagedrc.json                      → globs → comandos
package.json                            → "prepare": "husky"
```
## Anti-patterns
| Errado | Certo |
|---|---|
| usar `husky add` (deprecado em 9.x); criar arquivos `.husky/<hook>` diretamente | Aplicar a alternativa explicitada na ADR (Decisão / Enforcement) |
| permitir `--no-verify` em pipeline ou bot; CI é gate final | Aplicar a alternativa explicitada na ADR (Decisão / Enforcement) |
## Linter
`./machine/std-husky-lint-staged.js` verifica:

1. rejeitar PR alterando `.husky/` sem revisão de owner
2. `husky --version` validado em `prepare` step do CI (garante hook foi instalado em dev)
3. integração que verifica `.husky/pre-commit` existe e tem exec bit após `pnpm install`
4. Validation phase replica todos os checks do pre-commit (não confia no hook)

Output em formato `VIOLATION: <regra> (<file>:<line>) — <correção sugerida>` per SI-4 contract.
## Referência
ADRs derivadas:
- adr-husky-lint-staged-frontend (`020-adr-husky-lint-staged-frontend-v1.0.0.md`)
Fontes oficiais (consolidadas das ADRs):

**Fontes oficiais:** [husky — Documentation](https://typicode.github.io/husky/) · [husky — Repository](https://github.com/typicode/husky) · [lint-staged — Repository](https://github.com/lint-staged/lint-staged)
Authoring guide: `.context/standards/README.md`
