---
type: adr
name: adr-biome-frontend
description: Biome 2.x como linter e formatter unificado de TS/JS na camada Frontend
scope: organizational
source: local
stack: Biome 2.x
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

# ADR — Biome 2.x na Camada Frontend

- **Data:** 2026-05-08
- **Status:** Aprovado
- **Escopo:** Organizacional
- **Stack:** Biome
- **Categoria:** Princípios de Código

## Contexto

Camada Frontend: Next.js 16 + React 19 + TypeScript 5.9 + Tauri 2 + FSD/Atomic. Stack legada com ESLint + Prettier exige duas ferramentas, dois ASTs, conflitos de regras (`prettier-eslint-config`), tempo lento em monorepo grande, plugin maintenance burden. Cache fraco em CI. Necessário pipeline único, rápido (Rust nativo), TS-first, com import sorting determinístico, sem conflito format/lint, e bom feedback loop AI-first em pre-commit.

## Decisão

Adotar **Biome 2.x** como ferramenta única de lint + format para TS/JS/JSX/JSON/CSS na camada Frontend. Substitui ESLint + Prettier + `eslint-plugin-import` + `eslint-plugin-simple-import-sort`. Configuração via `biome.json` na raiz do workspace, com overrides por package. Regras recomendadas habilitadas + custom para FSD layer enforcement via `noRestrictedImports`. Format on save no IDE, `biome ci` no pipeline. Single-binary, zero deps Node em runtime.

## Alternativas Consideradas

- **ESLint + Prettier (status quo)** — ecossistema maduro, mas dual-tool, lento, conflitos de regra, plugin sprawl.
- **dprint** — formatter rápido em Rust, mas sem linting; precisa combinar com ESLint.
- **Oxc / Oxlint** — promissor, ainda não estável para format + cobertura de regras React/TS suficiente.
- **Rome (descontinuado)** — antecessor do Biome, fork ativo é o Biome.
- **Biome 2.x** ✓ — unifica lint+format, Rust-native, AST único, suporte TS/JSX/CSS/JSON, import sorting nativo.

## Consequências

**Positivas**
- Single-tool: instala 1 binário, lê 1 config, gera 1 AST.
- Performance ~10-25x ESLint+Prettier em monorepo grande.
- Sem conflito format vs. lint (mesma fonte de verdade).
- Cache nativo + `--changed` para affected-only em pre-commit.
- Output denso e acionável para LLMs em revisão de código.

**Negativas**
- Cobertura de regras menor que ESLint (sem alguns plugins de domínio: a11y custom, testing-library, jest-dom).
- Migração: requer remover ESLint/Prettier configs e revisar regras equivalentes.
- Plugin ecosystem incipiente (extensibilidade limitada vs. ESLint).

**Riscos aceitos**
- Regras a11y específicas (`jsx-a11y`) parcialmente cobertas — complementar via Storybook a11y addon + Playwright axe.
- Lock-in moderado em config proprietária — JSON declarativo facilita migração reversa.

## Guardrails

- SEMPRE rodar `biome check --write` em pre-commit via lint-staged.
- SEMPRE declarar `biome.json` na raiz com `extends` em packages quando overrides forem necessários.
- SEMPRE habilitar `recommended: true` + regras custom de boundary FSD (`noRestrictedImports`).
- NUNCA coexistir com ESLint ou Prettier no mesmo workspace (remover devDeps + configs legados).
- NUNCA suprimir regras com `// biome-ignore` sem motivo + ticket de débito.
- QUANDO regra ausente em Biome cobre caso crítico, ENTÃO documentar exceção em ADR de refinamento, não reintroduzir ESLint.

## Enforcement

- [ ] Code review: bloqueia `// biome-ignore` sem justificativa + reintrodução de ESLint/Prettier.
- [ ] Lint: `biome check --error-on-warnings` no CI; falha quebra pipeline.
- [ ] Pre-commit: lint-staged dispara `biome check --write --staged`.
- [ ] Teste: snapshot do `biome.json` versionado; mudança requer review explícito.
- [ ] Gate PREVC: `pnpm biome:ci` obrigatório antes do merge.

## Evidências / Anexos

**Fontes oficiais:**
- [Biome Documentation](https://biomejs.dev/)
- [Biome 2.0 Release Notes](https://biomejs.dev/blog/biome-v2/)
- [Biome Linter Rules](https://biomejs.dev/linter/rules/)
- [Biome Configuration](https://biomejs.dev/reference/configuration/)

```json
// biome.json
{
  "$schema": "https://biomejs.dev/schemas/2.0.0/schema.json",
  "formatter": { "enabled": true, "indentStyle": "space", "indentWidth": 2, "lineWidth": 100 },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "correctness": { "noUnusedImports": "error", "useExhaustiveDependencies": "error" },
      "style": { "useImportType": "error", "noNonNullAssertion": "error" },
      "suspicious": { "noExplicitAny": "error" }
    }
  },
  "javascript": { "formatter": { "quoteStyle": "double", "semicolons": "always" } },
  "files": { "ignore": ["**/dist/**", "**/.next/**", "**/coverage/**"] }
}
```
