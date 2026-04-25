---
type: adr
name: react-server-components-adoption
description: Adoção de React Server Components em rotas de SSR
scope: project
source: local
stack: TypeScript
category: arquitetura
status: Proposto
version: 0.1.0
created: 2026-04-24
supersedes: []
refines: []
protocol_contract: null
decision_kind: gated
---

# ADR — React Server Components

- **Data:** 2026-04-24
- **Status:** Proposto
- **Escopo:** Projeto
- **Stack:** TypeScript
- **Categoria:** Arquitetura

---

## Contexto

Bundle size em rotas de marketing cresceu 40% em 6 meses. Time-to-interactive degradou em mobile 3G. Next.js 15 oferece RSC estável.

## Decisão

Adotar React Server Components em `/marketing/*` e `/blog/*`. Rotas autenticadas ficam em Client Components. Reavaliar em 3 meses.

## Alternativas Consideradas

- **Manter Client Components** — familiar, bundle continua crescendo
- **Migrar para Astro** — melhor para conteúdo estático, mas disruptivo
- **React Server Components** ✓ — reduz bundle, mantém React mental model

## Consequências

**Positivas**
- Bundle size reduzido em rotas estáticas
- Streaming SSR nativo

**Negativas**
- Mental model híbrido (server vs client)
- Debug exige tooling novo

**Riscos aceitos**
- RSC ainda em evolução → gate de 3 meses

## Guardrails

- SEMPRE marcar Client Components explicitamente com `'use client'`
- NUNCA importar módulos client-only em Server Components
- QUANDO precisar state, ENTÃO mover para Client Component isolado

## Enforcement

- [ ] Code review: imports cross-boundary marcados em PR
- [ ] Lint: plugin eslint-plugin-react-server-components
- [ ] Teste: build detecta erros de boundary
- [ ] Gate CI: bundle size regression check

## Evidências / Anexos

**Fontes oficiais:** [React docs - Server Components](https://react.dev/reference/rsc/server-components) · [Dan Abramov's guide on Medium](https://medium.com/@dan_abramov/why-rsc-are-great-12345)

```tsx
// server-component.tsx
export default async function Page() {
  const data = await fetch('...').then(r => r.json());
  return <article>{data.content}</article>;
}
```
