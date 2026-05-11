---
id: std-vitest
description: Vitest 3.2.x como test runner unit + component na camada Frontend
version: 1.0.0
applyTo: ["**/*.test.ts", "**/*.test.tsx", "**/*.spec.ts"]
relatedAdrs: ["adr-vitest-frontend"]
enforcement:
  linter: standards/machine/std-vitest.js
weakStandardWarning: true
---
# Standard: vitest
## Princípios
Adotar **Vitest 3.2.x** como runner único de unit + component + integration do Frontend. Reuso do `vite.config.ts` (resolvers, alias `@/*`, plugins React/SVG). `environment: 'jsdom'` para componentes; `environment: 'node'` para utilitários puros. Cobertura via `@vitest/coverage-v8`. Component tests com Testing Library; MSW intercepta network. Snapshot apenas para output determinístico (estruturas, não DOM).

```
apps/web/vitest.config.ts                 → workspace + environments por glob
apps/web/src/**/*.test.{ts,tsx}           → co-localizado com source
apps/web/src/test/setup.ts                → @testing-library/jest-dom + MSW server
apps/web/src/test/mocks/handlers.ts       → MSW handlers tipados via Zod
```
## Anti-patterns
| Errado | Certo |
|---|---|
| testar implementação interna (state, hooks privados) — testar comportamento observável | Aplicar a alternativa explicitada na ADR (Decisão / Enforcement) |
| snapshot de DOM completo; snapshot apenas de output determinístico | Aplicar a alternativa explicitada na ADR (Decisão / Enforcement) |
## Linter
`./machine/std-vitest.js` verifica:

1. rejeitar PR com `screen.getByTestId` quando role/label disponível
2. `eslint-plugin-testing-library` + `eslint-plugin-vitest` (ou regras Biome equivalentes)
3. threshold de cobertura mínimo (lines 80%, branches 70%) em `vitest.config.ts`
4. Validation phase roda `turbo run test` (Vitest) antes de build

Output em formato `VIOLATION: <regra> (<file>:<line>) — <correção sugerida>` per SI-4 contract.
## Referência
ADRs derivadas:
- adr-vitest-frontend (`014-adr-vitest-frontend-v1.0.0.md`)
Fontes oficiais (consolidadas das ADRs):

**Fontes oficiais:** [Vitest — Guide](https://vitest.dev/guide/) · [Vitest — GitHub](https://github.com/vitest-dev/vitest) · [Testing Library — Queries](https://testing-library.com/docs/queries/about)
    render(<ResourceList items={[{ id: '1', name: 'Item' }]} onSelect={onSelect} />);
Authoring guide: `.context/standards/README.md`
