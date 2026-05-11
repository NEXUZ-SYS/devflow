---
type: adr
name: adr-vitest-frontend
description: Vitest 3.2.x como test runner unit e component da camada Frontend (TS + Vite + React)
scope: organizational
source: local
stack: Vitest 3.2.0
category: qualidade-testes
status: Aprovado
version: 1.0.0
created: 2026-05-08
supersedes: []
refines: []
protocol_contract: null
decision_kind: firm
summary: ""
---

# ADR — Vitest 3.2.x na Camada Frontend

- **Data:** 2026-05-08
- **Status:** Aprovado
- **Escopo:** Organizacional
- **Stack:** Vitest
- **Categoria:** Qualidade & Testes

## Contexto

Camada Frontend: Next.js 16 + React 19 + TypeScript 5.9 + Tauri 2 + Zustand 5. Suíte de testes precisa cobrir hooks, stores, utilities, schemas Zod e componentes (FSD + Atomic) com Testing Library. Jest exige stack paralela (Babel/SWC, transformers, ESM workarounds) divergente do Vite/SWC usado em dev e Storybook. Necessário runner que compartilhe pipeline de transform com app, suporte ESM nativo, watch incremental rápido, type-test (`expectTypeOf`), browser mode opcional para componentes, integração com MSW e Testing Library, e seja AI-friendly (output estruturado, snapshots inline). Performance e DX em monorepo Turborepo são gates.

## Decisão

Adotar **Vitest 3.2.x** como test runner único de unit e component tests no Frontend. Configuração herda do Vite/Next; `environment: "jsdom"` default; `@vitest/coverage-v8` para coverage; `@testing-library/react` + `@testing-library/jest-dom` para componentes; MSW para fronteira HTTP. Type-tests via `expectTypeOf` colocados em `*.test-d.ts`. Browser Mode (`@vitest/browser` + Playwright) reservado para componentes que dependem de layout/Computed Style. E2E permanece em Playwright separado (não-escopo). Sem Jest no monorepo; coexistência proibida.

## Alternativas Consideradas

- **Jest 30** — ecossistema maduro, mas exige transformer paralelo, ESM frágil, watch lento em monorepo grande, divergência de pipeline com Vite/SWC.
- **Node test runner (`node:test`)** — zero-deps, porém sem snapshots ricos, sem watch UI, sem coverage integrado, sem JSX/TS out-of-the-box.
- **uvu / mocha + chai** — leves, sem first-class TS/JSX, sem environment jsdom integrado.
- **Vitest 3.2.x** ✓ — pipeline compartilhado com Vite/SWC, ESM nativo, watch instantâneo, type-tests, browser mode, snapshots inline, output estruturado para LLM.

## Consequências

**Positivas**
- Pipeline único Vite/Vitest → zero divergência entre dev e test.
- Watch incremental sub-segundo → feedback loop AI-first denso.
- Type-tests (`expectTypeOf`) → contrato Zod ↔ TS validado em CI.
- Browser Mode opcional → componentes com layout testáveis sem stub de DOM.
- Output estruturado (JSON/JUnit) → integração CI/observability trivial.

**Negativas**
- API próxima de Jest, mas não 100% compatível — migrações pontuais exigem revisão.
- Browser Mode exige Playwright como peer (custo de boot em CI).
- Plugins Jest legados (jest-dom matchers) precisam de import explícito em `setup.ts`.

**Riscos aceitos**
- Lock-in ao ecossistema Vite — mitigado pela API Test API estável e `vite-node` portável.
- Versão 3.x ainda jovem — pinning em `~3.2` e regression suite em CI.

## Guardrails

- SEMPRE colocar testes ao lado do módulo (`*.test.ts(x)`); type-tests em `*.test-d.ts`.
- SEMPRE usar Testing Library queries acessíveis (`getByRole`, `getByLabelText`); NUNCA `querySelector`/`getByTestId` quando role existe.
- NUNCA misturar Jest e Vitest no mesmo workspace; NUNCA `import { jest } from "@jest/globals"`.
- NUNCA mock de módulo em arquivo de teste sem `vi.mock` no topo (hoisting); NUNCA mock de tipos de Zod inferidos.
- QUANDO componente depender de fetch, ENTÃO usar MSW handlers em `setup.ts`; NUNCA stub global de `fetch`.
- QUANDO contrato Zod mudar, ENTÃO type-test correspondente atualizado na mesma PR.

## Enforcement

- [ ] Code review: bloqueia uso de Jest, `getByTestId` quando role disponível, mocks ad-hoc de Zod schemas.
- [ ] Lint: ESLint `vitest/*` + `testing-library/*` rules ativas; `no-restricted-imports` para `@jest/globals`.
- [ ] Teste: coverage threshold (lines/branches ≥ 80%) por pacote; type-tests obrigatórios para schemas exportados.
- [ ] Gate PREVC: `pnpm test --run` + `pnpm test:types` rodam em CI; falha quebra merge.

## Evidências / Anexos

**Fontes oficiais:**
- [Vitest Docs](https://vitest.dev/)
- [Vitest Config Reference](https://vitest.dev/config/)
- [Vitest Browser Mode](https://vitest.dev/guide/browser/)
- [Testing Library React](https://testing-library.com/docs/react-testing-library/intro/)
- [Vitest GitHub](https://github.com/vitest-dev/vitest)

```ts
// apps/web/features/resources/ui/resource-card.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ResourceCard } from "./resource-card";

describe("ResourceCard", () => {
  it("renderiza nome do Resource", () => {
    render(<ResourceCard resource={{ id: "r1", name: "Item A" }} />);
    expect(screen.getByRole("heading", { name: "Item A" })).toBeInTheDocument();
  });
});

// apps/web/shared/contracts/resource.test-d.ts
import { expectTypeOf } from "vitest";
import type { Resource } from "@/shared/contracts/resource";
expectTypeOf<Resource>().toHaveProperty("id").toEqualTypeOf<string>();
```
