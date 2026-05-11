---
id: std-zustand
description: Zustand 5.x como state management de cliente na camada Frontend
version: 1.0.0
applyTo: []
relatedAdrs: ["adr-zustand-frontend"]
enforcement:
  linter: standards/machine/std-zustand.js
weakStandardWarning: true
---
# Standard: zustand
## Princípios
Adotar **Zustand 5.x** como única solução de estado de cliente. Stores ficam em `src/shared/state/**` ou `src/features/<feat>/model/store.ts` (FSD-compliant). Selector hooks tipados (`useStore(s => s.x)`) garantem re-render granular. Middlewares oficiais: `persist` (storage seletivo), `subscribeWithSelector` (efeitos derivados), `devtools` (dev only). Out: server state (React Query) e form state (react-hook-form).
## Anti-patterns
| Errado | Certo |
|---|---|
| armazenar server state (resposta do BFF) em Zustand — vai para React Query. | Aplicar a alternativa explicitada na ADR (Decisão / Enforcement) |
| mutar estado fora de `set(...)`; manter imutabilidade para React DevTools. | Aplicar a alternativa explicitada na ADR (Decisão / Enforcement) |
## Linter
`./machine/std-zustand.js` verifica:

1. stores em `model/store.ts` por feature; selectors em todo consumidor.
2. ESLint custom rule bloqueando `useStore()` sem argumento; biome cobrindo imports cross-feature.
3. Vitest cobre actions + selectors; Testing Library valida re-render granular.
4. bundle-analyzer falha PR se store ultrapassar 5 KB gz por feature.

Output em formato `VIOLATION: <regra> (<file>:<line>) — <correção sugerida>` per SI-4 contract.
## Referência
ADRs derivadas:
- adr-zustand-frontend (`008-adr-zustand-frontend-v1.0.0.md`)
Fontes oficiais (consolidadas das ADRs):

**Fontes oficiais:** [Zustand — GitHub](https://github.com/pmndrs/zustand) · [Zustand — Middleware](https://github.com/pmndrs/zustand/blob/main/docs/integrations/persisting-store-data.md) · [Zustand — TypeScript guide](https://github.com/pmndrs/zustand/blob/main/docs/guides/typescript.md)
type State = { items: Resource[]; add: (r: Resource) => void };
      items: [],
      add: (r) => set((s) => ({ items: [...s.items, r] })),
Authoring guide: `.context/standards/README.md`
