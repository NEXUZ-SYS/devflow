---
id: std-vitest
description: Vitest 3.2.x como test runner unit e component da camada Frontend (TS + Vite + React)
version: 1.0.0
applyTo: ["**/*.test.ts", "**/*.test.tsx", "**/*.spec.ts"]
relatedAdrs: ["adr-vitest-frontend"]
enforcement:
  linter: standards/machine/std-vitest.js
weakStandardWarning: true
---
# Standard: vitest
## Princípios
Adotar **Vitest 3.2.x** como test runner único de unit e component tests no Frontend. Configuração herda do Vite/Next; `environment: "jsdom"` default; `@vitest/coverage-v8` para coverage; `@testing-library/react` + `@testing-library/jest-dom` para componentes; MSW para fronteira HTTP. Type-tests via `expectTypeOf` colocados em `*.test-d.ts`. Browser Mode (`@vitest/browser` + Playwright) reservado para componentes que dependem de layout/Computed Style. E2E permanece em Playwright separado (não-escopo). Sem Jest no monorepo; coexistência proibida.
## Anti-patterns
| Errado | Certo |
|---|---|
| misturar Jest e Vitest no mesmo workspace; NUNCA `import { jest } from "@jest/globals"`. | Aplicar a alternativa explicitada na ADR (Decisão / Enforcement) |
| mock de módulo em arquivo de teste sem `vi.mock` no topo (hoisting); NUNCA mock de tipos de Zod inferidos. | Aplicar a alternativa explicitada na ADR (Decisão / Enforcement) |
## Linter
`./machine/std-vitest.js` verifica:

1. bloqueia uso de Jest, `getByTestId` quando role disponível, mocks ad-hoc de Zod schemas.
2. ESLint `vitest/*` + `testing-library/*` rules ativas; `no-restricted-imports` para `@jest/globals`.
3. coverage threshold (lines/branches ≥ 80%) por pacote; type-tests obrigatórios para schemas exportados.
4. Gate PREVC: `pnpm test --run` + `pnpm test:types` rodam em CI; falha quebra merge.

Output em formato `VIOLATION: <regra> (<file>:<line>) — <correção sugerida>` per SI-4 contract.
## Referência
ADRs derivadas:
- adr-vitest-frontend (`014-adr-vitest-frontend-v1.0.0.md`)
Fontes oficiais (consolidadas das ADRs):

**Fontes oficiais:**
- [Vitest Docs](https://vitest.dev/)
- [Vitest Config Reference](https://vitest.dev/config/)
- [Vitest Browser Mode](https://vitest.dev/guide/browser/)
- [Testing Library React](https://testing-library.com/docs/react-testing-library/intro/)
- [Vitest GitHub](https://github.com/vitest-dev/vitest)
Authoring guide: `.context/standards/README.md`
