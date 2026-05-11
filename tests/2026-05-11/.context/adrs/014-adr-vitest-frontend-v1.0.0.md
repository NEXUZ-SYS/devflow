---
type: adr
name: adr-vitest-frontend
description: Vitest 3.2.x como test runner unit + component na camada Frontend
scope: organizational
source: local
stack: Vitest 3.2.x
category: qualidade-testes
status: Aprovado
version: 1.0.0
created: 2026-05-11
supersedes: []
refines: []
protocol_contract: null
decision_kind: firm
summary: ""
---

# ADR — Vitest 3.2.x como Test Runner Unit + Component no Frontend

- **Data:** 2026-05-11
- **Status:** Aprovado
- **Escopo:** Organizacional
- **Stack:** Vitest 3.2.x
- **Categoria:** Qualidade & Testes

---

## Contexto

Frontend Next 16 + React 19 + TypeScript 5.9 + Vercel AI SDK v6 + Zustand 5 + Tailwind 4 demanda runner com suporte ESM nativo, HMR de testes (watch sub-segundo), compatibilidade direta com `vite.config` (mesmo transformer do build), tipos TS sem stage extra e mocks declarativos. Jest exige config de transformer + jest-environment-jsdom + ts-jest, sem reuso do pipeline Vite, com cold-start lento e ESM frágil. Playwright cobre E2E; necessário runner para unit + component + integration leve.

## Decisão

Adotar **Vitest 3.2.x** como runner único de unit + component + integration do Frontend. Reuso do `vite.config.ts` (resolvers, alias `@/*`, plugins React/SVG). `environment: 'jsdom'` para componentes; `environment: 'node'` para utilitários puros. Cobertura via `@vitest/coverage-v8`. Component tests com Testing Library; MSW intercepta network. Snapshot apenas para output determinístico (estruturas, não DOM).

```
apps/web/vitest.config.ts                 → workspace + environments por glob
apps/web/src/**/*.test.{ts,tsx}           → co-localizado com source
apps/web/src/test/setup.ts                → @testing-library/jest-dom + MSW server
apps/web/src/test/mocks/handlers.ts       → MSW handlers tipados via Zod
```

## Alternativas Consideradas

- **Jest 30** — config de transformer duplicada; ESM frágil; cold-start 2-3x mais lento.
- **Bun test** — runner rápido, mas integração com Vite/jsdom imatura para React 19.
- **Node `--test`** — sem jsdom; sem watch HMR; falta ecossistema de matchers.
- **Vitest 3.2.x** ✓ — mesmo pipeline do build, HMR, ESM nativo, tipos TS first-class.

## Consequências

**Positivas**
- Watch mode HMR (<1s) → feedback loop AI-first
- Reuso de `vite.config` → zero divergência build/test
- ESM nativo + TS sem transpiler extra
- API compatível com Jest → migração trivial de matchers

**Negativas**
- jsdom não cobre layout/paint → visual tests via Playwright
- Coverage v8 menos preciso que istanbul em branch coverage (mitigado por threshold realista)
- Plugins Jest-only (snapshot custom serializers) exigem porte

**Riscos aceitos**
- Diferenças sutis de timing async entre jsdom e browser real → integração crítica vai para Playwright

## Guardrails

- SEMPRE co-localizar `*.test.ts` ao lado do módulo
- SEMPRE usar Testing Library queries por role/label; nunca seletor por classe
- SEMPRE mockar rede via MSW; NUNCA `vi.mock('fetch')`
- NUNCA testar implementação interna (state, hooks privados) — testar comportamento observável
- NUNCA snapshot de DOM completo; snapshot apenas de output determinístico
- QUANDO componente usar Zustand store, ENTÃO resetar store em `beforeEach`
- QUANDO timer/async, ENTÃO `vi.useFakeTimers()` ou `findBy*` (não `setTimeout`)

## Enforcement

- [ ] Code review: rejeitar PR com `screen.getByTestId` quando role/label disponível
- [ ] Lint: `eslint-plugin-testing-library` + `eslint-plugin-vitest` (ou regras Biome equivalentes)
- [ ] Teste: threshold de cobertura mínimo (lines 80%, branches 70%) em `vitest.config.ts`
- [ ] Gate CI/PREVC: Validation phase roda `turbo run test` (Vitest) antes de build

## Evidências / Anexos

**Fontes oficiais:** [Vitest — Guide](https://vitest.dev/guide/) · [Vitest — GitHub](https://github.com/vitest-dev/vitest) · [Testing Library — Queries](https://testing-library.com/docs/queries/about)

```ts
// exemplo minimal — component test com Testing Library + MSW
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { ResourceList } from './ResourceList';

describe('ResourceList', () => {
  it('renders items and triggers onSelect by role', async () => {
    const onSelect = vi.fn();
    render(<ResourceList items={[{ id: '1', name: 'Item' }]} onSelect={onSelect} />);

    await userEvent.click(screen.getByRole('button', { name: /item/i }));

    expect(onSelect).toHaveBeenCalledWith('1');
  });
});
```
