---
id: std-nextjs
description: Next.js 16.2.x como framework React full-stack da camada Frontend (App Router + route handlers + Firebase App Hosting)
version: 1.0.0
applyTo: ["app/**/*.tsx", "app/**/*.ts", "src/app/**/*.tsx", "src/app/**/*.ts"]
relatedAdrs: ["adr-nextjs-frontend"]
enforcement:
  linter: standards/machine/std-nextjs.js
weakStandardWarning: true
---
# Standard: nextjs
## Princípios
Adotar **Next.js 16.2.x** com **App Router** como framework único da camada Frontend. SWC como compilador. Route handlers compõem a camada BFF. `next.config.ts` tipado. Turbopack como bundler (dev e build). Image/Font/Script APIs nativas. Middleware para auth/edge gating. `output: "standalone"` para Tauri/Firebase App Hosting.
## Anti-patterns
| Errado | Certo |
|---|---|
| `fetch` sem definir política de cache (`{ cache }` ou `{ next: { revalidate } }`). | Aplicar a alternativa explicitada na ADR (Decisão / Enforcement) |
| usar `getServerSideProps`/`getStaticProps`. | Aplicar a alternativa explicitada na ADR (Decisão / Enforcement) |
## Linter
`./machine/std-nextjs.js` verifica:

1. bloqueia Pages Router, `getServerSideProps`, `<img>` cru, `fetch` sem cache policy.
2. `eslint-config-next` + `@next/eslint-plugin-next` (no-img-element, no-html-link-for-pages).
3. Build CI: `pnpm next build` por workspace; falha quebra o pipeline.
4. Playwright cobre rotas críticas; Vitest + MSW cobre route handlers.
5. Gate PREVC: build + e2e obrigatórios antes do merge.

Output em formato `VIOLATION: <regra> (<file>:<line>) — <correção sugerida>` per SI-4 contract.
## Referência
ADRs derivadas:
- adr-nextjs-frontend (`005-adr-nextjs-frontend-v1.0.0.md`)
Fontes oficiais (consolidadas das ADRs):

**Fontes oficiais:**
- [Next.js Documentation](https://nextjs.org/docs)
- [App Router](https://nextjs.org/docs/app)
- [Route Handlers](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)
- [Caching in Next.js](https://nextjs.org/docs/app/building-your-application/caching)
- [Firebase App Hosting](https://firebase.google.com/docs/app-hosting)
// app/(web)/resources/[id]/page.tsx — RSC com cache explícito
    next: { revalidate: 30, tags: [`resource:${params.id}`] },
Authoring guide: `.context/standards/README.md`
