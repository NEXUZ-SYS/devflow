---
type: adr
name: adr-nextjs-frontend
description: Next.js 16.2.x como framework React full-stack da camada Frontend (App Router + route handlers + Firebase App Hosting)
scope: organizational
source: local
stack: Next.js 16.2.x
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

# ADR — Next.js 16.2.x na Camada Frontend

- **Data:** 2026-05-08
- **Status:** Aprovado
- **Escopo:** Organizacional
- **Stack:** Next.js
- **Categoria:** Arquitetura

## Contexto

Camada Frontend: shell único web + Tauri 2, App Router com route groups, Feature-Sliced Design + Atomic Design, Tailwind 4 + shadcn/ui, Zustand 5, Vercel AI SDK v6 streaming. Hospedagem em Firebase App Hosting. BFF colocado no mesmo app via route handlers (`app/api/**`). Necessário framework com RSC, streaming, edge/runtime configurável, suporte first-class a React 19, build estável em monorepo Turborepo.

## Decisão

Adotar **Next.js 16.2.x** com **App Router** como framework único da camada Frontend. SWC como compilador. Route handlers compõem a camada BFF. `next.config.ts` tipado. Turbopack como bundler (dev e build). Image/Font/Script APIs nativas. Middleware para auth/edge gating. `output: "standalone"` para Tauri/Firebase App Hosting.

## Alternativas Consideradas

- **Remix** — DX boa em data loading, porém ecossistema RSC menor, integração com Vercel AI SDK e shadcn/ui inferior.
- **Vite + React Router** — flexível, mas exige montar SSR/streaming/route handlers manualmente.
- **Astro** — ótimo para conteúdo, mas inadequado para app full-stack com AG-UI streaming.
- **Next.js 16.2.x** ✓ — RSC + Actions + streaming nativos, integração canônica com React 19 + AI SDK + Firebase App Hosting + Turbopack.

## Consequências

**Positivas**
- App Router com RSC streaming reduz TTFB e bundle cliente.
- Route handlers unificam BFF no mesmo deploy.
- Turbopack reduz cold-start em dev e build.
- Middleware permite auth/redirect na borda.

**Negativas**
- App Router introduz convenções fortes (layouts, segments, parallel routes).
- Cache opt-in/opt-out exige disciplina (`fetch` cache, `revalidatePath`).
- Acoplamento ao runtime Next em route handlers.

**Riscos aceitos**
- Breaking changes entre majors — pinning minor + smoke tests cobrem upgrades.
- Vendor lock-in parcial (mitigado por `output: "standalone"` + Firebase App Hosting).

## Guardrails

- SEMPRE App Router; Pages Router proibido em código novo.
- SEMPRE `next.config.ts` (TypeScript), nunca `.js`.
- SEMPRE definir `runtime` (`"nodejs"` ou `"edge"`) explicitamente em route handlers.
- SEMPRE `revalidatePath`/`revalidateTag` após Actions que mutam dados.
- NUNCA `fetch` sem definir política de cache (`{ cache }` ou `{ next: { revalidate } }`).
- NUNCA usar `getServerSideProps`/`getStaticProps`.
- QUANDO o segmento for autenticado, ENTÃO middleware valida sessão antes de RSC render.
- QUANDO renderizar imagens, ENTÃO `next/image` com `sizes` e domínios em `images.remotePatterns`.

## Enforcement

- [ ] Code review: bloqueia Pages Router, `getServerSideProps`, `<img>` cru, `fetch` sem cache policy.
- [ ] Lint: `eslint-config-next` + `@next/eslint-plugin-next` (no-img-element, no-html-link-for-pages).
- [ ] Build CI: `pnpm next build` por workspace; falha quebra o pipeline.
- [ ] Teste: Playwright cobre rotas críticas; Vitest + MSW cobre route handlers.
- [ ] Gate PREVC: build + e2e obrigatórios antes do merge.

## Evidências / Anexos

**Fontes oficiais:**
- [Next.js Documentation](https://nextjs.org/docs)
- [App Router](https://nextjs.org/docs/app)
- [Route Handlers](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)
- [Caching in Next.js](https://nextjs.org/docs/app/building-your-application/caching)
- [Firebase App Hosting](https://firebase.google.com/docs/app-hosting)

```tsx
// app/(web)/resources/[id]/page.tsx — RSC com cache explícito
import { notFound } from "next/navigation";
import { z } from "zod";

const ResourceSchema = z.object({ id: z.string(), name: z.string() });

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: { id: string } }) {
  const res = await fetch(`${process.env.API_URL}/resources/${params.id}`, {
    next: { revalidate: 30, tags: [`resource:${params.id}`] },
  });
  if (!res.ok) notFound();
  const data = ResourceSchema.parse(await res.json());
  return <h1>{data.name}</h1>;
}
```
