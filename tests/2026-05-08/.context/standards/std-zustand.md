---
id: std-zustand
description: Zustand 5.x como state management de cliente da camada Frontend (React 19 + Next.js 16 + Tauri 2)
version: 1.0.0
applyTo: []
relatedAdrs: ["adr-zustand-frontend"]
enforcement:
  linter: standards/machine/std-zustand.js
weakStandardWarning: true
---
# Standard: zustand
## Princípios
Adotar **Zustand 5.x** como gerenciador de estado **de cliente** da camada Frontend. Stores criadas via `create` em **módulos por feature** (FSD: `features/<x>/model/store.ts`). Consumo apenas com **seletores** + `useShallow` para objetos. Middleware obrigatório: `devtools` em dev, `persist` quando preciso (com `partialize`) e `subscribeWithSelector` para efeitos cruzados. **Nunca** usado para dados de servidor (RSC, cache do framework e AI SDK cobrem isso).
## Anti-patterns
| Errado | Certo |
|---|---|
| armazenar dados de servidor já cacheados pelo framework (RSC, route handlers, AI SDK). | Aplicar a alternativa explicitada na ADR (Decisão / Enforcement) |
| mutar estado fora do `set`/`setState`; NUNCA expor a store inteira via `useStore()` sem seletor. | Aplicar a alternativa explicitada na ADR (Decisão / Enforcement) |
| persistir tokens, segredos ou PII; `partialize` whitelist explícita. | Aplicar a alternativa explicitada na ADR (Decisão / Enforcement) |
## Linter
`./machine/std-zustand.js` verifica:

1. bloqueia uso sem seletor, persistência de PII, store global compartilhada entre features.
2. regra custom no ESLint impedindo `useStore()` sem argumento; `import/no-internal-modules` para isolar slices.
3. Vitest com `act` + `renderHook`; reset de stores entre testes via `store.setState(initialState, true)`.
4. Build CI: typecheck verifica que `partialize` retorna subconjunto declarado.
5. Gate PREVC: revisão de qualquer slice nova com `persist` ativo.

Output em formato `VIOLATION: <regra> (<file>:<line>) — <correção sugerida>` per SI-4 contract.
## Referência
ADRs derivadas:
- adr-zustand-frontend (`008-adr-zustand-frontend-v1.0.0.md`)
Fontes oficiais (consolidadas das ADRs):

**Fontes oficiais:**
- [Zustand GitHub](https://github.com/pmndrs/zustand)
- [Zustand Docs](https://zustand.docs.pmnd.rs/)
- [Zustand v5 Migration](https://zustand.docs.pmnd.rs/migrations/migrating-to-v5)
- [persist middleware](https://zustand.docs.pmnd.rs/integrations/persisting-store-data)
- [useShallow](https://zustand.docs.pmnd.rs/hooks/use-shallow)
Authoring guide: `.context/standards/README.md`
