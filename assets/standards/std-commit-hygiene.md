---
id: std-commit-hygiene
description: Commits atômicos com mensagem imperativa e intenção clara (Conventional Commits)
version: 1.1.0
source: devflow-default
applyTo: ["**/*"]
activation: on-demand
relatedAdrs: []
enforcement:
  linter: null
weakStandardWarning: true
---
## Princípios

- Formato Conventional Commits: `<type>(<scope>)<!>: <description>` — ex. `feat(orders): add idempotency key`
- Tipos válidos: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`
- Descrição em imperativo presente, minúscula, sem ponto final: "add", não "added" ou "adds"
- `!` no tipo ou `BREAKING CHANGE:` no footer para mudança incompatível com versão anterior
- Um commit = uma mudança lógica; se a mensagem tem "and", provavelmente são dois commits
- Body explica o **porquê** e contexto não-óbvio; linhas do body com máximo 72 caracteres
- Footer: `Refs: #123`, `Closes: #123`, `BREAKING CHANGE: <descrição>`
- Nunca commite secrets, tokens, arquivos `.env` ou binários grandes
- `.gitignore` cobre artifacts (`node_modules`, `dist`, `.env`); `.env.example` versionado, `.env` nunca
- Branches de feature têm vida curta; squash de fixups antes de mergear se houver commits de "wip"

> Enforcement via hook commit-msg (Conventional Commits), não linter de arquivo. Ver hooks/commit-msg-guard.

## Anti-patterns

| Errado | Corrija para |
|---|---|
| `update stuff` | `refactor(orders): extract pricing into module` |
| `fix bug` | `fix(auth): prevent redirect loop on expired session` |
| `wip`, `.` ou mensagem vazia | `feat(scope): descrição imperativa da intenção` |
| Misturar refactor + feature no mesmo commit | Separar em commits atômicos por intenção |
| Force-push em branch compartilhada | `--force-with-lease` apenas na própria branch |
| Commit com `.env` ou credencial | `.gitignore` + rotar imediatamente se já commitado |
