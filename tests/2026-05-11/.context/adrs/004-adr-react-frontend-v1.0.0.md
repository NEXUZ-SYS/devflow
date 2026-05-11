---
type: adr
name: adr-react-frontend
description: React 19.2.x como biblioteca de UI na camada Frontend
scope: organizational
source: local
stack: React 19.2.x
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

# ADR — React 19.2.x como Biblioteca de UI

- **Data:** 2026-05-11
- **Status:** Aprovado
- **Escopo:** Organizacional
- **Stack:** React 19.2.x
- **Categoria:** Arquitetura

---

## Contexto

Frontend Next 16 (App Router) + Tauri 2 shell, FSD + Atomic Design, Zustand 5, Tailwind 4, shadcn/ui. Vercel AI SDK v6 streaming UI (AG-UI), Storybook 9, MSW para mocks, Vitest + Testing Library + Playwright. Necessário modelo de componentes com Server Components, transições concorrentes, formularios com Actions, ref como prop e `use()` hook para integração com promises e contexts. Ecossistema shadcn/ui e Vercel AI SDK pressupõem React 19.

## Decisão

Adotar **React 19.2.x** como biblioteca única de UI. Server Components por padrão em `app/`; `'use client'` apenas onde há estado/efeitos/eventos. Actions (`useActionState`, `useFormStatus`) para mutações de formulário; `useOptimistic` para feedback otimista; `use()` para unwrap de promises. `ref` é prop padrão (sem `forwardRef`). Sem Class Components em código novo. Concurrent rendering ativado (`startTransition`).

```
app/(group)/page.tsx        → Server Component (default)
app/(group)/widget.tsx      → 'use client' quando precisa state/effects
features/{slice}/ui/*.tsx   → atoms/molecules/organisms (Atomic + FSD)
```

## Alternativas Consideradas

- **Vue 3** — composition API madura, mas fora do ecossistema shadcn/ui, Vercel AI SDK v6 e Next App Router.
- **Solid** — fine-grained reactivity superior, ecossistema fraco para SSR/RSC e tooling AI-first.
- **Svelte 5** — runes excelentes, mas Tauri + Vercel AI SDK + shadcn pressupõem React.
- **React 19.2.x** ✓ — único caminho coerente com Next 16, Tauri 2, shadcn/ui e Vercel AI SDK v6.

## Consequências

**Positivas**
- Server Components reduzem JS no cliente
- Actions + `useOptimistic` → UX responsiva sem boilerplate
- `ref` como prop → menos wrappers, menos `forwardRef`
- Suspense + `use()` simplifica data fetching streaming
- Asset Loading, Document Metadata, Resource Preloading nativos

**Negativas**
- Server/Client boundary exige disciplina (`'use client'`, `'use server'`)
- Bibliotecas antigas com `findDOMNode`/string refs quebram
- Curva de adoção de Actions e `use()` para times vindos de React 18

**Riscos aceitos**
- Algumas libs sem suporte a RSC → isolar em client boundary

## Guardrails

- SEMPRE Server Component por padrão; `'use client'` apenas com justificativa
- SEMPRE `key` estável em listas; SEMPRE deps explícitas em `useEffect`/`useMemo`
- SEMPRE usar Actions para mutação de formulário (`useActionState`)
- NUNCA Class Components em código novo
- NUNCA `useEffect` para data fetching que pode rodar no servidor
- NUNCA mutação direta de props ou state
- QUANDO state global cross-feature, ENTÃO Zustand store; QUANDO local, ENTÃO `useState`

## Enforcement

- [ ] Code review: rejeitar Class Components, `useEffect` para fetch, `'use client'` injustificado
- [ ] Lint: `eslint-plugin-react` + `eslint-plugin-react-hooks` (regras `rules-of-hooks`, `exhaustive-deps`)
- [ ] Teste: Vitest + Testing Library cobre componentes client; Playwright cobre fluxos RSC
- [ ] Gate CI/PREVC: typecheck + lint + tests bloqueiam merge

## Evidências / Anexos

**Fontes oficiais:** [React — Learn](https://react.dev/learn) · [React GitHub](https://github.com/facebook/react) · [React 19 — Release Notes](https://react.dev/blog/2024/12/05/react-19)

```tsx
// exemplo minimal — Server Component com Action e useOptimistic
'use client';
import { useOptimistic, useActionState } from 'react';

type Item = { id: string; name: string };

async function addItem(_: Item[], formData: FormData): Promise<Item[]> {
  const name = String(formData.get('name'));
  return [{ id: crypto.randomUUID(), name }];
}

export function ItemList({ initial }: { initial: Item[] }) {
  const [items, action] = useActionState(addItem, initial);
  const [optimistic, addOptimistic] = useOptimistic(items, (s, n: string) => [...s, { id: 'tmp', name: n }]);
  return (
    <form action={(fd) => { addOptimistic(String(fd.get('name'))); return action(fd); }}>
      <input name="name" />
      <ul>{optimistic.map((i) => <li key={i.id}>{i.name}</li>)}</ul>
    </form>
  );
}
```
