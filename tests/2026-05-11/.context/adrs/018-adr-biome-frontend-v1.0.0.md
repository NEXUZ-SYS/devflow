---
type: adr
name: adr-biome-frontend
description: Biome 2.x como linter e formatter TS/JS na camada Frontend
scope: organizational
source: local
stack: Biome 2.x
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

# ADR — Biome 2.x como Lint + Format do Frontend

- **Data:** 2026-05-11
- **Status:** Aprovado
- **Escopo:** Organizacional
- **Stack:** Biome 2.x
- **Categoria:** Princípios de Código

---

## Contexto

Frontend Next 16 + React 19 + TypeScript 5.9 com FSD + Atomic. Stack legada ESLint + Prettier exige ~6 plugins (`@typescript-eslint`, `react`, `react-hooks`, `jsx-a11y`, `import`, `prettier`), gera conflitos de regra, parser duplicado e tempo de cold-start lento no monorepo Turborepo. Pre-commit em arquivos grandes ultrapassa segundos; CI lint passa de 30s. AI-first multiplica volume de edits; ferramenta lenta vira fricção. Necessário: linter + formatter unificados, parser único, performance proporcional a arquivos alterados, suporte TS/JSX nativo, autofix determinístico.

## Decisão

Adotar **Biome 2.x** como linter e formatter de TS/JS/JSX/JSON/CSS no Frontend. Substitui ESLint + Prettier. Config canônica em `biome.json` na raiz do workspace; overrides por package em `apps/web/biome.json`. `linter.rules.recommended: true` + recommended `style`, `correctness`, `security`, `nursery` (curado), `a11y`. `formatter.indentStyle: space`, `formatter.lineWidth: 100`. Importa via `npx @biomejs/biome migrate eslint`/`prettier` no bootstrap. Sem `.eslintrc`, sem `.prettierrc` em packages do Frontend (limpeza obrigatória).

```
biome.json                              → config canônica (root)
apps/web/biome.json                     → extends + overrides
packages/ui/biome.json                  → extends + overrides
.vscode/settings.json                   → biome como default formatter
```

## Alternativas Consideradas

- **ESLint + Prettier** — ecossistema maior; lento, config dual, conflitos de regra (`eslint-config-prettier` exigido).
- **dprint** — formatter rápido; não cobre lint, exige par com outro linter.
- **Rome (legacy)** — projeto descontinuado em 2023, fork virou Biome.
- **oxc (oxlint)** — performance superior; em alpha para regras críticas, sem formatter estável.
- **Biome 2.x** ✓ — linter + formatter unificados em Rust, parser único, autofix determinístico, suporte a domains (Next, React) e import sorting.

## Consequências

**Positivas**
- Lint + format em uma ferramenta → menos config, zero conflito de regra
- Parser Rust único → 10-25× mais rápido que ESLint+Prettier
- Autofix determinístico (`biome check --write`)
- Domains (`react`, `next`) ativam regras específicas sem plugins
- Import sorting nativo

**Negativas**
- Cobertura de regras menor que ecossistema ESLint (plugins maduros como `eslint-plugin-testing-library`)
- Lock-in maior em config proprietária
- Custom rules exigem nursery + estabilização

**Riscos aceitos**
- Regra ausente para caso específico → suplementar com type-check estrito do TS ou regra custom JS via Biome plugin quando GA

## Guardrails

- SEMPRE `biome check --write` no pre-commit via lint-staged
- SEMPRE `biome ci` no pipeline (modo non-interactive, fail em diff)
- SEMPRE habilitar domains `react` e `next` em `apps/web/biome.json`
- NUNCA coexistir com `.eslintrc*` ou `.prettierrc*` no Frontend (`migrate` obrigatório)
- NUNCA desabilitar regra `correctness.*` sem justificativa em comentário inline `// biome-ignore lint/correctness/<rule>: <razão>`
- QUANDO regra recommended quebrar build, ENTÃO autofix primeiro; só desabilitar após análise

## Enforcement

- [ ] Code review: rejeitar PR com `biome-ignore` sem justificativa textual
- [ ] Lint: `biome ci apps/web packages/ui` em workflow `bff-ci.yml` (status check obrigatório)
- [ ] Teste: hook pre-commit (`lint-staged` → `biome check --write --no-errors-on-unmatched`)
- [ ] Gate CI/PREVC: Validation phase exige `pnpm turbo run check` verde (engloba `biome ci`)

## Evidências / Anexos

**Fontes oficiais:** [Biome — Getting Started](https://biomejs.dev/guides/getting-started/) · [Biome — Linter Rules](https://biomejs.dev/linter/rules/) · [Biome — Migrate from ESLint/Prettier](https://biomejs.dev/guides/migrate-eslint-prettier/)

```json
// exemplo minimal — biome.json com domains habilitados
{
  "$schema": "https://biomejs.dev/schemas/2.0.0/schema.json",
  "linter": {
    "enabled": true,
    "rules": { "recommended": true, "a11y": { "recommended": true } },
    "domains": { "react": "recommended", "next": "recommended" }
  },
  "formatter": { "enabled": true, "indentStyle": "space", "lineWidth": 100 },
  "javascript": { "formatter": { "quoteStyle": "single", "semicolons": "always" } },
  "files": { "ignoreUnknown": true }
}
```
