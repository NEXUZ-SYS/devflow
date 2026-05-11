---
type: adr
name: adr-nextjs-frontend
description: Next.js 16.2.x como framework React full-stack na camada Frontend
scope: organizational
source: local
stack: Next.js 16.2.x
category: arquitetura
status: Aprovado
version: 1.0.0
created: 2026-05-11
supersedes: []
refines: []
protocol_contract: null
decision_kind: firm
summary: ""
---

# ADR — Next.js 16.2.x como Framework React Full-Stack

- **Data:** 2026-05-11
- **Status:** Aprovado
- **Escopo:** Organizacional
- **Stack:** Next.js 16.2.x
- **Categoria:** Arquitetura

---

## Contexto

App único Next em Firebase App Hosting (web shell) + Tauri 2 (desktop shell sobre o mesmo bundle), FSD + Atomic Design, Zustand 5, Tailwind 4, shadcn/ui. BFF colocado em route handlers (`app/api/**`) feature-based. Necessário App Router com route groups, RSC, streaming, Server Actions, Turbopack para build e `next/cache` para revalidate. Vercel AI SDK v6 e MCP clients dependem de runtime Node nos handlers. Edge runtime opcional para handlers leves.

## Decisão

Adotar **Next.js 16.2.x** App Router como framework full-stack do Frontend e BFF. Estrutura `app/(group)/...` com route groups por shell (web, desktop). Route handlers em `app/api/{feature}/route.ts` com `runtime = 'nodejs'` por padrão. Server Components por padrão; Server Actions (`'use server'`) para mutações. Turbopack como bundler. Caching explícito via `fetch({ cache, next: { revalidate, tags } })` e `revalidateTag`. Sem Pages Router em código novo.

```
apps/web/src/app/
  (web)/                  → web shell layout
  (desktop)/              → Tauri shell layout
  api/{feature}/route.ts  → BFF (runtime nodejs)
  layout.tsx              → root + providers
next.config.ts            → turbopack, images, headers, redirects
```

## Alternativas Consideradas

- **Remix / React Router v7** — loaders/actions sólidos, mas RSC menos maduro e ecossistema Vercel AI SDK v6 prioriza Next.
- **TanStack Start** — promissor, ainda pré-1.0; sem paridade com Server Actions e cache tags.
- **Vite + SSR custom** — flexível, exige reconstruir caching, streaming, route groups e RSC do zero.
- **Next.js 16.2.x App Router** ✓ — único framework com RSC GA, Server Actions, Turbopack estável e integração nativa Vercel AI SDK v6.

## Consequências

**Positivas**
- RSC + streaming → menor TTFB, menos JS no cliente
- Server Actions → mutações tipadas sem endpoint extra
- Route groups → web + desktop compartilham bundle
- Turbopack → build/HMR mais rápidos
- `cache`/`revalidateTag` → invalidação granular
- Edge runtime opcional para handlers leves

**Negativas**
- Acoplamento ao runtime/hosting da Vercel/Firebase App Hosting
- Server/Client boundary exige disciplina arquitetural
- Quebra entre versões maior → atualizar em janelas controladas

**Riscos aceitos**
- Bibliotecas que tocam DOM em import-time precisam `'use client'` ou dynamic import
- Cache behavior muda entre versões → cobrir com testes de integração

## Guardrails

- SEMPRE App Router; SEMPRE Server Component por padrão
- SEMPRE route handlers em `app/api/{feature}/route.ts` com runtime explícito
- SEMPRE `revalidateTag` ou `revalidatePath` após mutação
- SEMPRE `import 'server-only'` em módulos com segredos/SDK Admin
- NUNCA Pages Router em código novo; NUNCA `getServerSideProps`/`getStaticProps`
- NUNCA importar `firebase-admin` em Client Component
- QUANDO chamada externa, ENTÃO declarar `cache` e `next.tags` explícitos

## Enforcement

- [ ] Code review: rejeitar Pages Router, runtime implícito, mutação sem revalidate
- [ ] Lint: `eslint-config-next` (regras `no-html-link-for-pages`, `no-img-element`)
- [ ] Teste: Vitest cobre route handlers; Playwright cobre fluxos navegação + streaming
- [ ] Gate CI/PREVC: `next build` com Turbopack + typecheck obrigatórios antes de merge

## Evidências / Anexos

**Fontes oficiais:** [Next.js — App Router](https://nextjs.org/docs/app) · [Next.js — Route Handlers](https://nextjs.org/docs/app/building-your-application/routing/route-handlers) · [Next.js — Caching](https://nextjs.org/docs/app/building-your-application/caching)

```ts
// exemplo minimal — route handler Next 16 com cache tag e revalidate
import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { revalidateTag } from 'next/cache';

export const runtime = 'nodejs';

export async function GET(_: NextRequest) {
  const res = await fetch('https://api.internal/resources', {
    next: { revalidate: 60, tags: ['resources'] },
  });
  return NextResponse.json(await res.json());
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  // mutate ...
  revalidateTag('resources');
  return NextResponse.json({ status: 'ok' as const });
}
```
