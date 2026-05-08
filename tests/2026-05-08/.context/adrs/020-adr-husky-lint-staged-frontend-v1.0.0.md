---
type: adr
name: adr-husky-lint-staged-frontend
description: husky 9.x + lint-staged 15.x como Git hooks pre-commit na camada Frontend
scope: organizational
source: local
stack: husky + lint-staged
category: principios-codigo
status: Aprovado
version: 1.0.0
created: 2026-05-08
supersedes: []
refines: []
protocol_contract: null
decision_kind: firm
summary: ""
---

# ADR — husky + lint-staged na Camada Frontend

- **Data:** 2026-05-08
- **Status:** Aprovado
- **Escopo:** Organizacional
- **Stack:** husky + lint-staged
- **Categoria:** Princípios de Código

## Contexto

Camada Frontend: Next.js 16 + React 19 + TS 5.9 + Vitest + Storybook + Playwright + MSW. Sem hooks pre-commit, código com erros de lint, format inconsistente, secrets vazados e tipos quebrados chega ao CI, queimando minutos de pipeline e bloqueando merges. Feedback loop AI-first exige verificação local instantânea (sub-2s no caminho feliz) sobre apenas arquivos staged. Necessário hook manager portável via npm install + runner que rode ferramentas (Biome, tsc, scan de secrets) somente em arquivos staged.

## Decisão

Adotar **husky 9.x** como Git hooks manager + **lint-staged 15.x** como runner por-arquivo-staged. Hooks instalados via `husky init` no `postinstall`. `pre-commit` roda lint-staged: Biome (`check --write --staged`), `tsc --noEmit` por package afetado, scan de secrets (gitleaks). `commit-msg` valida Conventional Commits via commitlint. `pre-push` roda Vitest changed-only. Hooks **bypassáveis** via `--no-verify` apenas em emergência justificada; CI replica todas as checagens como gate hard.

## Alternativas Consideradas

- **Lefthook** — Go binary, paralelismo nativo, config YAML; menor adoção e ecossistema npm fora.
- **pre-commit (Python)** — multi-language, exige Python instalado; fricção em monorepo Node-first.
- **simple-git-hooks** — leve, sem runner por-arquivo; lint-staged seria ainda necessário.
- **Sem hooks (CI-only)** — feedback loop lento, queima de minutos em CI.
- **husky 9.x + lint-staged 15.x** ✓ — padrão npm, zero config Python/Go, integração nativa com Biome/Vitest/tsc, instalação reproducível via `pnpm install`.

## Consequências

**Positivas**
- Feedback < 2s para lint+format em arquivos staged (caminho feliz).
- Bloqueio local de erros antes de queimar minutos em CI.
- Conventional Commits aplicado por commit-msg hook.
- Reproducível em qualquer máquina via `pnpm install` (script `prepare`).
- Reforça contratos em pre-push (testes changed-only) sem travar commits.

**Negativas**
- Hooks adicionam latência ao commit (~500ms-2s típico).
- `--no-verify` permite bypass — exige cultura + CI hard gate.
- Cross-platform: Windows requer Git Bash ou WSL; pode causar fricção.
- Manutenção de scripts em `.husky/` versionados.

**Riscos aceitos**
- Bypass via `--no-verify` — mitigado por CI replicando todas as verificações como required checks.
- Hooks inflam commits durante refactor massivo — mitigado por `lint-staged --no-stash` + flag de skip emergencial documentada.

## Guardrails

- SEMPRE instalar hooks via `prepare` script em `package.json` (`"prepare": "husky"`).
- SEMPRE versionar `.husky/` no repositório; NUNCA `.husky/_/` (gerado).
- SEMPRE rodar lint-staged com `biome check --write --staged` + `tsc --noEmit` afetado + scan de secrets.
- SEMPRE replicar todos os checks no CI como required checks (defense in depth).
- NUNCA usar `--no-verify` sem motivo + ticket; documentar em commit body.
- NUNCA rodar suite completa de testes no `pre-commit` — apenas changed-only no `pre-push`.
- QUANDO commit-msg violar Conventional Commits, ENTÃO commitlint bloqueia.
- QUANDO arquivo staged for binário ou gerado, ENTÃO lint-staged ignora via glob.

## Enforcement

- [ ] Code review: bloqueia commits com `--no-verify` sem justificativa em commit body.
- [ ] Lint: `biome check --error-on-warnings` no `pre-commit` via lint-staged.
- [ ] Pre-commit: `lint-staged` + `gitleaks protect --staged` + `tsc --noEmit` por package afetado.
- [ ] CI: required checks replicam pre-commit e pre-push (defense in depth).
- [ ] Gate PREVC: scripts `pnpm prepare` + `pnpm verify` documentados em README; falha de hook = falha de gate.

## Evidências / Anexos

**Fontes oficiais:**
- [husky Documentation](https://typicode.github.io/husky/)
- [husky 9 Migration](https://typicode.github.io/husky/migrate-from-v4.html)
- [lint-staged Repository](https://github.com/lint-staged/lint-staged)
- [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)
- [commitlint](https://commitlint.js.org/)
- [Git Hooks Reference](https://git-scm.com/docs/githooks)

```json
// package.json (raiz)
{
  "scripts": {
    "prepare": "husky"
  },
  "lint-staged": {
    "*.{ts,tsx,js,jsx,json}": ["biome check --write --no-errors-on-unmatched"],
    "*.{ts,tsx}": ["bash -c 'pnpm turbo run typecheck --filter=...[HEAD^]'"],
    "*": ["gitleaks protect --staged --redact"]
  }
}
```

```bash
# .husky/pre-commit
pnpm exec lint-staged

# .husky/commit-msg
pnpm exec commitlint --edit "$1"

# .husky/pre-push
pnpm exec vitest related --run --changed origin/main
```
