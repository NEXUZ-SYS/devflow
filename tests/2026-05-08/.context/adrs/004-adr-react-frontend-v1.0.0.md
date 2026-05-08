---
type: adr
name: adr-react-frontend
description: React 19.2.x como biblioteca de UI da camada Frontend (Next.js + Tauri + FSD/Atomic)
scope: organizational
source: local
stack: React 19.2.x
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

# ADR — React 19.2.x na Camada Frontend

- **Data:** 2026-05-08
- **Status:** Aprovado
- **Escopo:** Organizacional
- **Stack:** React
- **Categoria:** Arquitetura

## Contexto

Camada Frontend: shell único Next 16 + Tauri 2 com Feature-Sliced Design + Atomic Design, Zustand 5 para estado, Tailwind 4 + shadcn/ui, Vercel AI SDK v6 (AG-UI), Vitest + Testing Library + Playwright + Storybook + MSW. Necessário modelo de UI declarativo, Server Components compatíveis com Next 16, Actions/Form integrações, suspense para streaming AG-UI, ecossistema de testes maduro.

## Decisão

Adotar **React 19.2.x** como biblioteca de UI única da camada Frontend. Server Components + Client Components com fronteira explícita (`"use client"`). Hooks novos (`useActionState`, `useOptimistic`, `useFormStatus`) preferidos para fluxos de formulário. Suspense para boundaries de streaming. Refs como prop em componentes funcionais (sem `forwardRef`). Strict Mode obrigatório em dev.

## Alternativas Consideradas

- **Vue 3** — DX boa, mas incompatível com Next App Router e Vercel AI SDK.
- **Solid** — performance superior, ecossistema imaturo (sem shadcn/ui, sem Tauri-React patterns).
- **Svelte 5** — bundle menor, porém integração com Next 16 e tooling AI-first inferior.
- **React 19.2.x** ✓ — RSC nativos, Actions, Suspense maduro, ecossistema dominante (shadcn, AI SDK, Storybook), sinal denso para LLMs.

## Consequências

**Positivas**
- RSC reduz JS no cliente; streaming nativo.
- Actions + `useActionState` simplificam mutations.
- Suspense unifica loading boundaries (incl. AG-UI streams).
- Compatibilidade total com shadcn/ui, Vercel AI SDK, Tauri.

**Negativas**
- Modelo mental RSC vs Client requer disciplina.
- Hydration mismatches difíceis de debugar.
- Bundle de runtime maior que Solid/Svelte.

**Riscos aceitos**
- Re-renders em árvores grandes (mitigar com `memo`, Zustand selectors).
- Concurrent features em libs legadas — auditar antes de adotar.

## Guardrails

- SEMPRE Server Components por padrão; `"use client"` apenas no menor escopo necessário.
- SEMPRE `key` estável em listas; nunca `index` para itens reordenáveis.
- SEMPRE Strict Mode no root em dev.
- NUNCA `useEffect` para derivar estado; usar memo/seletor.
- NUNCA mutação direta de props ou state.
- NUNCA passar handlers inline em listas grandes sem memoização.
- QUANDO precisar de estado global, ENTÃO usar Zustand (não Context para writes frequentes).
- QUANDO houver mutation, ENTÃO Server Action + `useActionState`.

## Enforcement

- [ ] Code review: bloqueia `useEffect` para derivar estado, prop drilling profundo, `any` em props.
- [ ] Lint: `eslint-plugin-react` + `react-hooks/exhaustive-deps` + `react/jsx-key`.
- [ ] Teste: Testing Library (interação), Storybook + Chromatic (visual), MSW (network).
- [ ] E2E: Playwright cobre fluxos de Actions/Forms.
- [ ] Gate PREVC: `pnpm test && pnpm test:e2e` obrigatório antes do merge.

## Evidências / Anexos

**Fontes oficiais:**
- [React 19 Release Blog](https://react.dev/blog/2024/12/05/react-19)
- [React Server Components](https://react.dev/reference/rsc/server-components)
- [useActionState](https://react.dev/reference/react/useActionState)
- [Next.js + React 19](https://nextjs.org/docs/app/building-your-application/rendering/server-components)

```tsx
// app/(web)/resources/_components/resource-form.tsx
"use client";
import { useActionState } from "react";
import { createResource } from "../actions";

type State = { error?: string; ok?: boolean };

export function ResourceForm() {
  const [state, action, pending] = useActionState<State, FormData>(
    createResource,
    {}
  );
  return (
    <form action={action}>
      <input name="name" required />
      <button disabled={pending}>Salvar</button>
      {state.error ? <p role="alert">{state.error}</p> : null}
    </form>
  );
}
```
