---
type: adr
name: adr-husky-lint-staged-frontend
description: husky 9.x + lint-staged 15.x como git hooks pre-commit na camada Frontend
scope: organizational
source: local
stack: husky 9.x + lint-staged 15.x
category: principios-codigo
status: Aprovado
version: 1.0.0
created: 2026-05-11
supersedes: []
refines: []
protocol_contract: null
decision_kind: firm
summary: ""
---

# ADR — husky 9.x + lint-staged 15.x como Git Hooks Pre-Commit do Frontend

- **Data:** 2026-05-11
- **Status:** Aprovado
- **Escopo:** Organizacional
- **Stack:** husky 9.x + lint-staged 15.x

- **Categoria:** Princípios de Código

---

## Contexto

Frontend Next 16 + React 19 + TypeScript 5.9 com Biome como linter/formatter unificado. Sem hook pre-commit, código não-formatado e código que falha em lint chega ao CI; ciclo de feedback longo (push → CI red → fix → push). AI-first gera volume alto de commits e arquivos editados; rodar lint no repo inteiro a cada commit é proibitivo no monorepo Turborepo. Hook precisa: rodar apenas em arquivos staged, autofix determinístico, falhar fast em violações não-corrigíveis, instalação automática pós `pnpm install`, suporte cross-platform (Linux, macOS, Windows via Git Bash) e shell Tauri.

## Decisão

Adotar **husky 9.x** como gerenciador de git hooks e **lint-staged 15.x** como runner sobre arquivos staged. Hooks em `.husky/`. `pre-commit` invoca `lint-staged`. Config canônica de lint-staged em `.lintstagedrc.json` na raiz. Hooks `commit-msg` (commitlint via subprocess) e `pre-push` (typecheck) opcionais. Instalação automática via `"prepare": "husky"` em `package.json` (executado por pnpm). `lint-staged` glob por extensão executa `biome check --write --no-errors-on-unmatched` em `.ts/.tsx/.js/.jsx/.json` e `biome format --write` em `.css/.md`.

```
.husky/pre-commit                       → npx lint-staged
.husky/commit-msg                       → npx commitlint --edit "$1"
.lintstagedrc.json                      → globs → comandos
package.json                            → "prepare": "husky"
```

## Alternativas Consideradas

- **simple-git-hooks** — leve; sem matriz de comandos por glob, sem stash automático em parcial-staged.
- **pre-commit (Python framework)** — multi-linguagem maduro; introduz dependência Python no Frontend, fora do stack Node.
- **lefthook** — Go nativo, paralelo; binário extra a gerenciar no CI/Tauri, menor ecossistema npm.
- **husky 4.x + lint-staged** — versão legada usava `package.json` config; husky 9.x simplificou para `.husky/` files puros.
- **husky 9.x + lint-staged 15.x** ✓ — padrão de mercado, husky 9.x com `prepare` script de uma linha, lint-staged com stash automático de unstaged hunks.

## Consequências

**Positivas**
- Feedback loop < 5s no commit (autofix antes do CI)
- Arquivos sempre formatados → diffs de PR limpos
- Stash automático de unstaged hunks evita corrupção em commits parciais
- Install automático via `prepare` → onboarding zero-config
- `husky 9.x` é shell puro, fácil de auditar e portar

**Negativas**
- Hook pode ser pulado com `--no-verify` (gate real fica no CI)
- Commits parciais (arquivos staged + unstaged misturados) exigem stash, podem confundir contributors
- Performance degrada com >100 arquivos staged simultâneos

**Riscos aceitos**
- `--no-verify` em commits → CI duplica verificação como gate obrigatório

## Guardrails

- SEMPRE instalar via `prepare` script; NUNCA `husky install` manual em README
- SEMPRE rodar `lint-staged` no `pre-commit` (não `biome check` direto, para preservar escopo aos arquivos staged)
- SEMPRE manter `.husky/_` no `.gitignore` (helper interno do husky 9.x)
- NUNCA usar `husky add` (deprecado em 9.x); criar arquivos `.husky/<hook>` diretamente
- NUNCA permitir `--no-verify` em pipeline ou bot; CI é gate final
- QUANDO hook falhar em ambiente Tauri build, ENTÃO desabilitar via `HUSKY=0` no script de release
- QUANDO commit-msg lint for adicionado, ENTÃO usar commitlint com config `@commitlint/config-conventional`

## Enforcement

- [ ] Code review: rejeitar PR alterando `.husky/` sem revisão de owner
- [ ] Lint: `husky --version` validado em `prepare` step do CI (garante hook foi instalado em dev)
- [ ] Teste: integração que verifica `.husky/pre-commit` existe e tem exec bit após `pnpm install`
- [ ] Gate CI/PREVC: Validation phase replica todos os checks do pre-commit (não confia no hook)

## Evidências / Anexos

**Fontes oficiais:** [husky — Documentation](https://typicode.github.io/husky/) · [husky — Repository](https://github.com/typicode/husky) · [lint-staged — Repository](https://github.com/lint-staged/lint-staged)

```json
// exemplo minimal — .lintstagedrc.json + .husky/pre-commit
// .lintstagedrc.json
{
  "*.{ts,tsx,js,jsx,json,jsonc}": "biome check --write --no-errors-on-unmatched",
  "*.{css,md}": "biome format --write --no-errors-on-unmatched"
}
// .husky/pre-commit (arquivo shell, exec bit setado)
// #!/usr/bin/env sh
// npx lint-staged
```
