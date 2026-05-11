---
id: std-react
description: React 19.2.x como biblioteca de UI da camada Frontend (Next.js + Tauri + FSD/Atomic)
version: 1.0.0
applyTo: ["**/*.tsx", "**/*.jsx"]
relatedAdrs: ["adr-react-frontend"]
enforcement:
  linter: standards/machine/std-react.js
weakStandardWarning: true
---
# Standard: react
## Princípios
Adotar **React 19.2.x** como biblioteca de UI única da camada Frontend. Server Components + Client Components com fronteira explícita (`"use client"`). Hooks novos (`useActionState`, `useOptimistic`, `useFormStatus`) preferidos para fluxos de formulário. Suspense para boundaries de streaming. Refs como prop em componentes funcionais (sem `forwardRef`). Strict Mode obrigatório em dev.
## Anti-patterns
| Errado | Certo |
|---|---|
| `useEffect` para derivar estado; usar memo/seletor. | Aplicar a alternativa explicitada na ADR (Decisão / Enforcement) |
| mutação direta de props ou state. | Aplicar a alternativa explicitada na ADR (Decisão / Enforcement) |
| passar handlers inline em listas grandes sem memoização. | Aplicar a alternativa explicitada na ADR (Decisão / Enforcement) |
## Linter
`./machine/std-react.js` verifica:

1. bloqueia `useEffect` para derivar estado, prop drilling profundo, `any` em props.
2. `eslint-plugin-react` + `react-hooks/exhaustive-deps` + `react/jsx-key`.
3. Testing Library (interação), Storybook + Chromatic (visual), MSW (network).
4. E2E: Playwright cobre fluxos de Actions/Forms.
5. Gate PREVC: `pnpm test && pnpm test:e2e` obrigatório antes do merge.

Output em formato `VIOLATION: <regra> (<file>:<line>) — <correção sugerida>` per SI-4 contract.
## Referência
ADRs derivadas:
- adr-react-frontend (`004-adr-react-frontend-v1.0.0.md`)
Fontes oficiais (consolidadas das ADRs):

**Fontes oficiais:**
- [React 19 Release Blog](https://react.dev/blog/2024/12/05/react-19)
- [React Server Components](https://react.dev/reference/rsc/server-components)
- [useActionState](https://react.dev/reference/react/useActionState)
- [Next.js + React 19](https://nextjs.org/docs/app/building-your-application/rendering/server-components)
  const [state, action, pending] = useActionState<State, FormData>(
Authoring guide: `.context/standards/README.md`
