---
id: std-nextjs
description: Next.js 16.2.x como framework React full-stack na camada Frontend
version: 1.0.0
applyTo: ["app/**/*.tsx", "app/**/*.ts", "src/app/**/*.tsx", "src/app/**/*.ts"]
relatedAdrs: ["adr-nextjs-frontend"]
enforcement:
  linter: standards/machine/std-nextjs.js
weakStandardWarning: true
---
# Standard: nextjs
## Princípios
Adotar **Next.js 16.2.x** App Router como framework full-stack do Frontend e BFF. Estrutura `app/(group)/...` com route groups por shell (web, desktop). Route handlers em `app/api/{feature}/route.ts` com `runtime = 'nodejs'` por padrão. Server Components por padrão; Server Actions (`'use server'`) para mutações. Turbopack como bundler. Caching explícito via `fetch({ cache, next: { revalidate, tags } })` e `revalidateTag`. Sem Pages Router em código novo.

```
apps/web/src/app/
  (web)/                  → web shell layout
  (desktop)/              → Tauri shell layout
  api/{feature}/route.ts  → BFF (runtime nodejs)
  layout.tsx              → root + providers
next.config.ts            → turbopack, images, headers, redirects
```
## Anti-patterns
| Errado | Certo |
|---|---|
| Pages Router em código novo; NUNCA `getServerSideProps`/`getStaticProps` | Aplicar a alternativa explicitada na ADR (Decisão / Enforcement) |
| importar `firebase-admin` em Client Component | Aplicar a alternativa explicitada na ADR (Decisão / Enforcement) |
## Linter
`./machine/std-nextjs.js` verifica:

1. rejeitar Pages Router, runtime implícito, mutação sem revalidate
2. `eslint-config-next` (regras `no-html-link-for-pages`, `no-img-element`)
3. Vitest cobre route handlers; Playwright cobre fluxos navegação + streaming
4. `next build` com Turbopack + typecheck obrigatórios antes de merge

Output em formato `VIOLATION: <regra> (<file>:<line>) — <correção sugerida>` per SI-4 contract.
## Referência
ADRs derivadas:
- adr-nextjs-frontend (`005-adr-nextjs-frontend-v1.0.0.md`)
Fontes oficiais (consolidadas das ADRs):

**Fontes oficiais:** [Next.js — App Router](https://nextjs.org/docs/app) · [Next.js — Route Handlers](https://nextjs.org/docs/app/building-your-application/routing/route-handlers) · [Next.js — Caching](https://nextjs.org/docs/app/building-your-application/caching)
    next: { revalidate: 60, tags: ['resources'] },
Authoring guide: `.context/standards/README.md`
