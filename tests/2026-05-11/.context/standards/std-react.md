---
id: std-react
description: React 19.2.x como biblioteca de UI na camada Frontend
version: 1.0.0
applyTo: ["**/*.tsx", "**/*.jsx"]
relatedAdrs: ["adr-react-frontend"]
enforcement:
  linter: standards/machine/std-react.js
weakStandardWarning: true
---
# Standard: react
## Princípios
Adotar **React 19.2.x** como biblioteca única de UI. Server Components por padrão em `app/`; `'use client'` apenas onde há estado/efeitos/eventos. Actions (`useActionState`, `useFormStatus`) para mutações de formulário; `useOptimistic` para feedback otimista; `use()` para unwrap de promises. `ref` é prop padrão (sem `forwardRef`). Sem Class Components em código novo. Concurrent rendering ativado (`startTransition`).

```
app/(group)/page.tsx        → Server Component (default)
app/(group)/widget.tsx      → 'use client' quando precisa state/effects
features/{slice}/ui/*.tsx   → atoms/molecules/organisms (Atomic + FSD)
```
## Anti-patterns
| Errado | Certo |
|---|---|
| Class Components em código novo | Aplicar a alternativa explicitada na ADR (Decisão / Enforcement) |
| `useEffect` para data fetching que pode rodar no servidor | Aplicar a alternativa explicitada na ADR (Decisão / Enforcement) |
| mutação direta de props ou state | Aplicar a alternativa explicitada na ADR (Decisão / Enforcement) |
## Linter
`./machine/std-react.js` verifica:

1. rejeitar Class Components, `useEffect` para fetch, `'use client'` injustificado
2. `eslint-plugin-react` + `eslint-plugin-react-hooks` (regras `rules-of-hooks`, `exhaustive-deps`)
3. Vitest + Testing Library cobre componentes client; Playwright cobre fluxos RSC
4. typecheck + lint + tests bloqueiam merge

Output em formato `VIOLATION: <regra> (<file>:<line>) — <correção sugerida>` per SI-4 contract.
## Referência
ADRs derivadas:
- adr-react-frontend (`004-adr-react-frontend-v1.0.0.md`)
Fontes oficiais (consolidadas das ADRs):

**Fontes oficiais:** [React — Learn](https://react.dev/learn) · [React GitHub](https://github.com/facebook/react) · [React 19 — Release Notes](https://react.dev/blog/2024/12/05/react-19)
async function addItem(_: Item[], formData: FormData): Promise<Item[]> {
  return [{ id: crypto.randomUUID(), name }];
export function ItemList({ initial }: { initial: Item[] }) {
  const [items, action] = useActionState(addItem, initial);
  const [optimistic, addOptimistic] = useOptimistic(items, (s, n: string) => [...s, { id: 'tmp', name: n }]);
Authoring guide: `.context/standards/README.md`
