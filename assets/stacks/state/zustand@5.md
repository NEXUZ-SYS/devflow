---
title: Zustand
version: 5.x
last_updated: 2026-05-20
status: current
upstream: https://zustand.docs.pmnd.rs
repository: https://github.com/pmndrs/zustand
peer_dependencies:
  react: ">=18"
category: state
---

# Zustand 5

Biblioteca de estado global client-side do projeto. Hooks-first, sem provider obrigatório, sem boilerplate de actions/reducers. Usa `useSyncExternalStore` exclusivamente, o que a alinha nativamente com React 18/19 e modo concurrent. Este documento descreve o uso opinativo de Zustand 5 no stack; princípios universais de state management (server vs client state, source of truth, granularidade) vivem em `@rules/state-management` e não são duplicados aqui.

## Por que Zustand no projeto

Pequeno (~1 kB gzip core), tipado, composável. Inverte a lógica de Redux: muitos stores pequenos e atômicos em vez de um único store gigante. Integra bem com Next.js 15 App Router (`@stacks/frontend/next@16`) e React 19 (`@stacks/frontend/react@19`) desde que respeitada a fronteira client-only.

Escolhido para:

- UI global compartilhada (modal/sidebar/theme/command palette state)
- Preferências client-side persistidas
- Estado cross-route que não cabe em URL nem em form

NÃO usar para:

- Server state (dados de fetch) — use React Query, SWR ou Next fetch cache
- URL state — use `searchParams` / Next router
- Form state — use react-hook-form
- Local UI ephemeral — use `useState` / `useReducer`

Regras imperativas detalhadas em `@rules/state-management`.

## Mudanças relevantes vs Zustand 4

- **`useSyncExternalStore` exclusivo**: shim com `useEffect` foi removido. Integração nativa com React 18/19, sem tearing em modo concurrent, melhor comportamento em SSR.
- **TypeScript-first com double-call signature**: `create<State>()(creator)` é o padrão. Necessário para inferência correta com middleware encadeado.
- **Default selectors**: `useStore()` sem selector ainda funciona mas é fortemente desencorajado. Preferir selector explícito + `useShallow` para objetos.
- **`use-sync-external-store` removido das peer deps**: agora built-in via React. Peer dep mínima é React >=18.
- **`createStore` vs `create`**: separação clara entre store vanilla (uso fora do React) e hook React.
- **Middleware**: bumps em `persist`, `subscribeWithSelector`, `devtools`, `immer`, `combine`, `redux`. Imports a partir de `zustand/middleware/...`.

## API essencial

```ts
import { create } from 'zustand'

type CounterState = {
  count: number
  inc: () => void
  reset: () => void
}

export const useCounterStore = create<CounterState>()((set, get) => ({
  count: 0,
  inc: () => set((s) => ({ count: s.count + 1 })),
  reset: () => set({ count: 0 }),
}))
```

- `set(partial | (state) => partial)` — merge superficial por default. `set(partial, true)` substitui o state inteiro.
- `get()` — leitura síncrona do estado atual. Usar com parcimônia; preferir derivar do state via selector.
- `useStore(selector, equalityFn?)` — em 5, equality default é `Object.is`. Usar `useShallow(selector)` para objetos retornados.
- `subscribe((state, prev) => ...)` — reação fora do React. Combinar com `subscribeWithSelector` para fatia específica.

## Patterns de definição

### Selectors granulares (preferido)

```ts
// Sempre selector explícito
const count = useCounterStore((s) => s.count)
const inc = useCounterStore((s) => s.inc)

// Múltiplos valores: preferir múltiplas chamadas (reatividade ótima)
const count = useCounterStore((s) => s.count)
const inc = useCounterStore((s) => s.inc)

// Quando precisar agrupar objeto, use useShallow
import { useShallow } from 'zustand/react/shallow'
const { a, b } = useCounterStore(useShallow((s) => ({ a: s.a, b: s.b })))
```

### Hooks dedicados (recomendado em stores médios)

```ts
export const useCount = () => useCounterStore((s) => s.count)
export const useCounterActions = () =>
  useCounterStore(useShallow((s) => ({ inc: s.inc, reset: s.reset })))
```

Mantém call sites limpos, centraliza memoization e facilita refactor.

### Slices pattern (stores grandes)

```ts
import { StateCreator, create } from 'zustand'

type UiSlice = { sidebarOpen: boolean; toggleSidebar: () => void }
type AuthSlice = { user: User | null; setUser: (u: User | null) => void }

const createUiSlice: StateCreator<UiSlice & AuthSlice, [], [], UiSlice> = (set) => ({
  sidebarOpen: false,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
})

const createAuthSlice: StateCreator<UiSlice & AuthSlice, [], [], AuthSlice> = (set) => ({
  user: null,
  setUser: (user) => set({ user }),
})

export const useAppStore = create<UiSlice & AuthSlice>()((...a) => ({
  ...createUiSlice(...a),
  ...createAuthSlice(...a),
}))
```

Slices escalam quando um store cresce; antes disso, preferir múltiplos stores atômicos pequenos.

### Vanilla store

```ts
import { createStore } from 'zustand/vanilla'

export const counterStore = createStore<CounterState>()((set) => ({
  count: 0,
  inc: () => set((s) => ({ count: s.count + 1 })),
  reset: () => set({ count: 0 }),
}))

// Em React, criar hook a partir do vanilla store
import { useStore } from 'zustand'
export const useCounterStore = <T>(selector: (s: CounterState) => T) =>
  useStore(counterStore, selector)
```

Útil para compartilhar lógica entre React, Workers e bibliotecas.

## Middleware

Todos importados de `zustand/middleware`. Encadear via composição funcional; preservar tipagem com double-call de `create`.

### `persist`

```ts
import { persist, createJSONStorage } from 'zustand/middleware'

export const usePrefsStore = create<PrefsState>()(
  persist(
    (set) => ({
      theme: 'system',
      setTheme: (theme) => set({ theme }),
      authToken: null, // NÃO persistir
    }),
    {
      name: 'app-prefs',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ theme: state.theme }), // exclui authToken
      version: 2,
      migrate: (persisted, version) => {
        if (version < 2) {
          // transformação do schema legado
        }
        return persisted as PrefsState
      },
      skipHydration: true, // hidratação manual no Next.js
    }
  )
)
```

Cuidados com Next.js 15: SSR não tem `localStorage`, então `skipHydration: true` + chamada manual de `usePrefsStore.persist.rehydrate()` dentro de `useEffect` evita mismatches. Alternativa: gate de leitura com `useHydrated()` hook customizado.

Regras de segurança sobre o que persistir em `@rules/security`. Resumo: nunca tokens, PII ou credenciais em `localStorage`. Sempre `partialize` explícito.

### `devtools`

```ts
import { devtools } from 'zustand/middleware'

export const useCounterStore = create<CounterState>()(
  devtools(
    (set) => ({
      count: 0,
      inc: () => set((s) => ({ count: s.count + 1 }), false, 'counter/inc'),
      reset: () => set({ count: 0 }, false, 'counter/reset'),
    }),
    { name: 'counter', enabled: process.env.NODE_ENV !== 'production' }
  )
)
```

Nomear actions via terceiro arg de `set` (segundo arg é o replace flag). Desabilitar em produção.

### `immer`

```ts
import { immer } from 'zustand/middleware/immer'

export const useNestedStore = create<State>()(
  immer((set) => ({
    nested: { deeply: { value: 0 } },
    bump: () =>
      set((s) => {
        s.nested.deeply.value += 1
      }),
  }))
)
```

Útil quando o estado é profundamente aninhado. Trade-off: bundle maior; só adotar quando o ganho de legibilidade compensa.

### `subscribeWithSelector`

```ts
import { subscribeWithSelector } from 'zustand/middleware'

const useStore = create<State>()(
  subscribeWithSelector((set) => ({
    /* ... */
  }))
)

useStore.subscribe(
  (s) => s.user?.id,
  (id, prev) => {
    if (id !== prev) analytics.identify(id)
  }
)
```

Para reagir a uma fatia específica fora do React.

### `combine`

```ts
import { combine } from 'zustand/middleware'

export const useCounterStore = create(
  combine({ count: 0 }, (set) => ({
    inc: () => set((s) => ({ count: s.count + 1 })),
  }))
)
```

Inferência automática a partir do initial state. Bom para stores triviais; em stores com actions complexas, preferir `create<State>()(...)` explícito.

### `redux`

Padrão action/reducer. Raramente justificável em stack novo; ignorar a menos que migre de Redux.

## Integração com Next.js 15 App Router

Ver `@stacks/frontend/next@16`.

- Stores Zustand são **client-only**. Módulo que chama `create` deve ter `"use client"` no topo, ou ser importado apenas em Client Components.
- Server Components NÃO leem do store. Server data flui via fetch/cookies/searchParams e é passada por props para Client Components.
- Hidratação inicial: server renderiza dados → passa props para Client Component → Client Component inicializa o store via `useState(() => createStore(initialFromProps))` (per-request) ou seta o singleton via `useEffect` (global).
- Estado por-request (multi-tenant): usar pattern Context + per-request store factory:

```tsx
'use client'
import { createContext, useContext, useRef } from 'react'
import { createStore, useStore } from 'zustand'

type Store = ReturnType<typeof createAppStore>
const StoreContext = createContext<Store | null>(null)

export function AppStoreProvider({ initial, children }: Props) {
  const ref = useRef<Store>()
  if (!ref.current) ref.current = createAppStore(initial)
  return <StoreContext.Provider value={ref.current}>{children}</StoreContext.Provider>
}

export function useAppStore<T>(selector: (s: AppState) => T) {
  const store = useContext(StoreContext)
  if (!store) throw new Error('AppStoreProvider missing')
  return useStore(store, selector)
}
```

Singleton global serve para estado verdadeiramente compartilhado entre todas as sessões (ex: theme). Per-request factory serve para estado vinculado ao usuário/tenant da request.

## Integração com React 19

Ver `@stacks/frontend/react@19`.

- `useSyncExternalStore` interno garante zero tearing em modo concurrent e Suspense.
- Sem hydration mismatches quando hidratação manual (via `skipHydration` ou pattern de provider per-request) é respeitada.
- Compatível com Server Components apenas como consumo client-side. Não há "Zustand server-side"; usar o fetch cache do Next para dados.

## TypeScript idioms

Ver `@stacks/language/typescript@6`.

- **Double-call signature obrigatória com middleware**:

  ```ts
  create<State>()((set) => ({ ... })) // certo
  create((set) => ({ ... }))            // errado — quebra inferência com middleware
  ```

- **`StateCreator<T, Mps, Mcs>`** para tipar slices reutilizáveis. `Mps` (middleware passed in) e `Mcs` (middleware called set) são tuplas; deixar `[]` para slices que não trazem middleware próprio.

- **Action types discriminados** quando o store representa uma máquina de estados:

  ```ts
  type AuthState =
    | { status: 'idle' }
    | { status: 'loading' }
    | { status: 'authed'; user: User }
    | { status: 'error'; error: Error }
  ```

- **Nunca `any`** para escapar de problema de tipagem. Quase sempre é double-call signature faltando ou middleware na ordem errada.

## Performance

Ver `@rules/performance`.

- Selectors granulares: `useStore((s) => s.foo)`, não `useStore((s) => s)`.
- `useShallow` para selectors que retornam objetos com múltiplos campos.
- Nunca criar funções/objetos novos dentro de selector sem `useShallow` — gera re-render infinito.
- Não fazer fetch dentro do creator. Side effects vão para actions explícitas ou para fora do store.
- Para listas grandes derivadas, memoizar a derivação fora do selector (ex: `useMemo` no consumidor) em vez de recalcular a cada render.

## Testing

Ver `@rules/testing`.

- Preferir **factory `createStore` por teste** em vez de singleton global. Isola estado entre testes naturalmente.
- Se for inevitável usar singleton, expor `_reset()` em ambiente de teste:

  ```ts
  export const useStore = create<State>()((set) => ({
    ...initial,
    _reset: () => set(initial, true),
  }))

  // beforeEach
  useStore.getState()._reset()
  ```

- Mock minimal: testar stores reais e seu comportamento. Mockar middleware (ex: storage) só quando o teste especifica integração com browser API.

## Migração 4 → 5

1. Confirmar React >=18 no projeto (já é o caso).
2. Trocar `import { create } from 'zustand'` se vinha de v3 legado.
3. Aplicar double-call signature em todas as chamadas `create<State>()(...)`.
4. Substituir `useStore((s) => ({ a, b }))` por `useStore(useShallow((s) => ({ a, b })))` onde objetos são retornados — sem isso, re-renders extras silenciosos.
5. Revisar imports de middleware: `zustand/middleware/immer`, `zustand/middleware`, `zustand/vanilla`.
6. Re-verificar tipagem dos slices com `StateCreator<T, Mps, Mcs>`.
7. Para `persist`, validar que `createJSONStorage` está em uso e que `skipHydration`/rehydrate manual está aplicado em SSR.

## Anti-patterns

- Single mega-store global com todo o app dentro.
- Armazenar server state em Zustand. Server state pertence ao cache do data layer (React Query, SWR, Next fetch cache).
- Armazenar form state em Zustand. Forms são react-hook-form.
- Chamar `get()` dentro de render. Use selectors.
- Selector que retorna objeto novo sem `useShallow` → re-render loop.
- Persistir tudo sem `partialize` → vaza dados sensíveis e prende o schema.
- Acessar store dentro de Server Components.
- Setar state em `useEffect` para sincronizar com props (use derivação ou setar no handler que originou a prop).
- Usar `any` para silenciar TS — sintoma de double-call signature faltando.
- Misturar singleton global com per-request provider para o mesmo dado.

## Referências cruzadas

- Princípios universais de state management: `@rules/state-management`
- Segurança de persistência: `@rules/security`
- Performance e re-renders: `@rules/performance`
- Disciplinas de teste: `@rules/testing`
- Integração com framework: `@stacks/frontend/next@16`, `@stacks/frontend/react@19`
- Tipagem: `@stacks/language/typescript@6`

## Referências externas

- Documentação oficial: https://zustand.docs.pmnd.rs
- Repositório: https://github.com/pmndrs/zustand
- Demo: https://zustand-demo.pmnd.rs
