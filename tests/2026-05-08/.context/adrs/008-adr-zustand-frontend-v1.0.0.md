---
type: adr
name: adr-zustand-frontend
description: Zustand 5.x como state management de cliente da camada Frontend (React 19 + Next.js 16 + Tauri 2)
scope: organizational
source: local
stack: Zustand 5.x
category: arquitetura
status: Aprovado
version: 1.0.0
created: 2026-05-08
supersedes: []
refines: []
protocol_contract: null
decision_kind: firm
summary: ""
---

# ADR — Zustand 5.x na Camada Frontend

- **Data:** 2026-05-08
- **Status:** Aprovado
- **Escopo:** Organizacional
- **Stack:** Zustand
- **Categoria:** Arquitetura

## Contexto

Camada Frontend: Next.js 16 + React 19 + TypeScript 5.9 + shadcn/ui + Tauri 2. App único com FSD + Atomic Design e múltiplos shells (web/desktop). Estado **server-side** já é coberto por route handlers + RSC + cache do framework; resta **estado de cliente transverso** (sessão UI, preferências, drafts, conexões realtime, AG-UI streams). Context API sofre re-render fan-out, prop drilling pesa em features compostas e Redux Toolkit traz boilerplate desproporcional ao tamanho do estado. Necessário store leve, seletores granulares, ergonomia React 19 (Server Components seguros), middleware composável e boa testabilidade.

## Decisão

Adotar **Zustand 5.x** como gerenciador de estado **de cliente** da camada Frontend. Stores criadas via `create` em **módulos por feature** (FSD: `features/<x>/model/store.ts`). Consumo apenas com **seletores** + `useShallow` para objetos. Middleware obrigatório: `devtools` em dev, `persist` quando preciso (com `partialize`) e `subscribeWithSelector` para efeitos cruzados. **Nunca** usado para dados de servidor (RSC, cache do framework e AI SDK cobrem isso).

## Alternativas Consideradas

- **Redux Toolkit** — robusto, porém boilerplate alto, atrito com RSC, escopo excede a necessidade.
- **Jotai** — atomic model elegante, mas ergonomia menor para slices grandes e middlewares de persistência/devtools menos maduros.
- **Recoil** — manutenção descontinuada pelo time canônico; risco de stack morta.
- **Context API + useReducer** — re-render coarse, sem seletor nativo, sem middleware.
- **Valtio** — proxy reativo agradável, porém menor sinal de tipo e DX inferior em revisão estática.
- **Zustand 5.x** ✓ — bundle pequeno (<2 KB), seletores nativos, middlewares estáveis, suporte explícito a React 19.

## Consequências

**Positivas**
- Bundle e runtime mínimos → impacto desprezível no shell desktop.
- Seletores granulares → re-renders previsíveis, perf estável.
- Middleware `persist` cobre Tauri (storage do SO) e Web (localStorage) com mesmo contrato.
- Ergonomia AI-first: stores curtas, tipos explícitos, fácil leitura por LLMs.

**Negativas**
- Liberdade alta → exige convenções fortes (slices, naming, partialize).
- Sem sistema de efeitos embutido tipo Sagas → orquestração via `subscribeWithSelector` ou eventos.
- Persistência mal projetada vaza dados sensíveis no storage.

**Riscos aceitos**
- Drift de padrões entre features → mitigado por template de slice e code review.
- Duplicação acidental de estado de servidor no client → mitigado por guardrail explícito.

## Guardrails

- SEMPRE colocar a store em `features/<x>/model/store.ts` (FSD) e exportar tipos via `z.infer` quando hidratada de schema.
- SEMPRE consumir com seletor: `useStore(s => s.value)`; objetos via `useShallow`.
- NUNCA armazenar dados de servidor já cacheados pelo framework (RSC, route handlers, AI SDK).
- NUNCA mutar estado fora do `set`/`setState`; NUNCA expor a store inteira via `useStore()` sem seletor.
- NUNCA persistir tokens, segredos ou PII; `partialize` whitelist explícita.
- QUANDO precisar reagir a mudanças, ENTÃO usar `subscribeWithSelector` + cleanup; NUNCA `useEffect` polling.
- QUANDO compor middlewares, ENTÃO ordem: `devtools(persist(subscribeWithSelector(immer(...))))`.

## Enforcement

- [ ] Code review: bloqueia uso sem seletor, persistência de PII, store global compartilhada entre features.
- [ ] Lint: regra custom no ESLint impedindo `useStore()` sem argumento; `import/no-internal-modules` para isolar slices.
- [ ] Teste: Vitest com `act` + `renderHook`; reset de stores entre testes via `store.setState(initialState, true)`.
- [ ] Build CI: typecheck verifica que `partialize` retorna subconjunto declarado.
- [ ] Gate PREVC: revisão de qualquer slice nova com `persist` ativo.

## Evidências / Anexos

**Fontes oficiais:**
- [Zustand GitHub](https://github.com/pmndrs/zustand)
- [Zustand Docs](https://zustand.docs.pmnd.rs/)
- [Zustand v5 Migration](https://zustand.docs.pmnd.rs/migrations/migrating-to-v5)
- [persist middleware](https://zustand.docs.pmnd.rs/integrations/persisting-store-data)
- [useShallow](https://zustand.docs.pmnd.rs/hooks/use-shallow)

```typescript
// features/resource/model/store.ts — slice tipada, seletor + persist whitelist
import { create } from "zustand";
import { devtools, persist, subscribeWithSelector } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";

type Resource = { id: string; name: string };

type ResourceState = {
  current: Resource | null;
  setCurrent: (r: Resource | null) => void;
};

export const useResourceStore = create<ResourceState>()(
  devtools(
    persist(
      subscribeWithSelector((set) => ({
        current: null,
        setCurrent: (current) => set({ current }, false, "resource/setCurrent"),
      })),
      { name: "resource", partialize: (s) => ({ current: s.current }) },
    ),
  ),
);

export const useCurrentResource = () =>
  useResourceStore(useShallow((s) => s.current));
```
