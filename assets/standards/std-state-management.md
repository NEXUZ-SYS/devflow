---
id: std-state-management
description: Estado classificado, com fonte de verdade única e no menor escopo possível
version: 1.0.0
source: devflow-default
applyTo: ["**/*.{tsx,jsx}"]
activation: on-demand
relatedAdrs: []
enforcement:
  linter: null
weakStandardWarning: true
---
## Princípios

- Classifique o estado em uma das categorias antes de decidir onde armazená-lo: server state, URL state, form state, UI local, client global, derived, ephemeral
- Cada pedaço de estado tem exatamente uma fonte de verdade; se aparece em dois lugares, um é derivado e deve ser computado
- Nunca copie server state para store cliente; use o cache do fetch layer (RSC, Server Components) como fonte oficial
- Se um valor pode ser calculado a partir de outro estado, compute — não armazene; evite `useEffect` que sincroniza um state com outro
- Mantenha o estado no menor escopo possível: `useState` no componente → props → ancestral comum → Context → store global
- URL state para estado compartilhável: filtros, paginação, tabs selecionadas, IDs de recurso em foco — nunca duplicados em store cliente
- Nunca mute estado existente; produza novo objeto/array (`spread`, `filter`, `map` — nunca `push`, `splice` in-place sobre o state)
- Estado relacional normalizado: `{ byId: {...}, allIds: [...] }`; listas filtradas/ordenadas para exibição são derivadas, não armazenadas
- Mutations no servidor invalidam o cache do fetch layer — não atualize manualmente uma store paralela

## Anti-patterns

| Errado | Corrija para |
|---|---|
| Copiar resposta de fetch para Zustand | Usar Server Components ou cache do fetch layer |
| `useEffect` sincronizando um state com outro state | Derivação direta no render ou `useMemo` |
| `isLoaded`, `isEmpty`, `totalPrice` armazenados | Computar inline ou `useMemo` a partir da lista base |
| State promovido para Context "por precaução" | `useState` no componente até precisar elevar |
| Filtros de busca armazenados em store global | Query string: compartilhável e recarregável |
| `state.items.push(newItem)` | `setState(s => ({ ...s, items: [...s.items, newItem] }))` |
