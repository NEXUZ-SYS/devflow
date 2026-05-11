---
type: adr
name: adr-zustand-frontend
description: Zustand 5.x como state management de cliente na camada Frontend
scope: organizational
source: local
stack: Zustand 5
category: arquitetura
status: Aprovado
version: 1.0.0
created: 2026-05-11
supersedes: []
refines: []
protocol_contract: null
decision_kind: firm
summary: ""
---

# ADR — Zustand como state management de cliente no Frontend

- **Data:** 2026-05-11
- **Status:** Aprovado
- **Escopo:** Organizacional
- **Stack:** Zustand 5.x
- **Categoria:** Arquitetura

---

## Contexto

App Next.js 16 + React 19 com FSD + Atomic precisa de estado de cliente desacoplado de server state. Estado de server (fetch BFF, cache) vai para React Query/RSC. Estado de UI/sessão/preferências (sidebar, modal, theme, draft form, AG-UI streaming) precisa de store leve, sem Context boilerplate, sem re-render em cascata. Redux/Toolkit é overhead; Context dispara re-render global.

## Decisão

Adotar **Zustand 5.x** como única solução de estado de cliente. Stores ficam em `src/shared/state/**` ou `src/features/<feat>/model/store.ts` (FSD-compliant). Selector hooks tipados (`useStore(s => s.x)`) garantem re-render granular. Middlewares oficiais: `persist` (storage seletivo), `subscribeWithSelector` (efeitos derivados), `devtools` (dev only). Out: server state (React Query) e form state (react-hook-form).

## Alternativas Consideradas

- **Redux Toolkit** — boilerplate (slice/action/reducer), bundle ~2-3x maior, overkill p/ UI state.
- **Jotai** — modelo atômico interessante, mas multiplica fontes de verdade em FSD; menos enxuto p/ store coesa.
- **React Context + useReducer** — re-render global, sem selectors, sem persist nativo.
- **Valtio** — proxy mutável diverge do modelo imutável esperado por React DevTools/strict mode.
- **Zustand 5.x ✓** — ~1.5 KB gz, selector-based, sem provider, middlewares oficiais.

## Consequências

**Positivas**
- Re-render granular por selector → menos jank em listas/streaming AG-UI.
- Sem `<Provider>` aninhado → composição FSD limpa.
- `persist` resolve preferências sem código custom.
- API trivial → testável com Vitest sem mocks de Context.

**Negativas**
- Sem time-travel debugging nativo (mitigado por middleware `devtools`).
- Disciplina manual de slicing — sem convenção forçada como Redux.

**Riscos aceitos**
- Stores monstro emergem sem revisão → guardrail abaixo + ESLint custom.

## Guardrails

- SEMPRE consumir store via selector (`useStore(s => s.x)`); NUNCA `useStore()` sem selector em componente.
- SEMPRE separar slices por feature em `features/<feat>/model/store.ts`; nada de store global gigante.
- NUNCA armazenar server state (resposta do BFF) em Zustand — vai para React Query.
- NUNCA mutar estado fora de `set(...)`; manter imutabilidade para React DevTools.
- QUANDO precisar persistir, ENTÃO usar middleware `persist` com `partialize` explícito (allowlist de campos).
- QUANDO derivar valores, ENTÃO usar selector + `shallow` ou memo; nunca recomputar em render.

## Enforcement

- [ ] Code review: stores em `model/store.ts` por feature; selectors em todo consumidor.
- [ ] Lint: ESLint custom rule bloqueando `useStore()` sem argumento; biome cobrindo imports cross-feature.
- [ ] Teste: Vitest cobre actions + selectors; Testing Library valida re-render granular.
- [ ] Gate CI/PREVC: bundle-analyzer falha PR se store ultrapassar 5 KB gz por feature.

## Evidências / Anexos

**Fontes oficiais:** [Zustand — GitHub](https://github.com/pmndrs/zustand) · [Zustand — Middleware](https://github.com/pmndrs/zustand/blob/main/docs/integrations/persisting-store-data.md) · [Zustand — TypeScript guide](https://github.com/pmndrs/zustand/blob/main/docs/guides/typescript.md)

```ts
// src/features/resource/model/store.ts — slice por feature, selector-based, persist seletivo
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type Resource = { id: string; name: string };
type State = { items: Resource[]; add: (r: Resource) => void };

export const useResourceStore = create<State>()(
  persist(
    (set) => ({
      items: [],
      add: (r) => set((s) => ({ items: [...s.items, r] })),
    }),
    { name: 'resource-store', partialize: (s) => ({ items: s.items }) },
  ),
);
```
