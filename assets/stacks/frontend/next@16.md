---
title: Next.js
version: 16.x
last_updated: 2026-05-20
status: current
upstream: https://nextjs.org/docs
supersedes: next@15
---

# Next.js 16

Framework full-stack React baseado em App Router, com Server Components, Server Actions, streaming, Partial Prerendering estável e Turbopack como compilador padrão para dev e build. Esta é a versão de referência do projeto. A versão 15 está descontinuada — todo código novo segue Next 16.

Requer **React 19** (peer obrigatório — ver `@stacks/frontend/react@19`) e **Node 22+ ou 24** (ver `@stacks/runtime/node@24`). TypeScript 6 (`@stacks/language/typescript@6`).

---

## O que mudou em relação a Next 15

Mudanças marcantes que afetam decisão diária:

- **Turbopack estável para `next build`**, não apenas `next dev`. O Webpack continua disponível como fallback, mas o caminho default é Turbopack em todos os comandos. Tempos de build caem significativamente — desativar Turbopack só com motivo documentado.
- **Async Request APIs** consolidadas e obrigatórias. `cookies()`, `headers()`, `draftMode()`, e os props `params` e `searchParams` em pages/layouts são `Promise<...>`. Não há mais codemod opcional — quem migra de 14 ou 15 antiga precisa `await` em todos os pontos.
- **Partial Prerendering (PPR) estável**. Configurável por rota via `export const experimental_ppr = true` (ou flag global em `next.config.ts`). Combina shell estático prerenderizado com slots dinâmicos via `<Suspense>`.
- **`after()` estabilizado** (era `unstable_after` em 15). Import de `next/server`. Use para trabalho pós-resposta (telemetria, logs, cache warming) sem bloquear o response.
- **`instrumentation.ts`** com suporte OpenTelemetry first-class. Hook `register()` carregado uma vez por runtime (Node e Edge), e hook `onRequestError` para captura de erros. Ver `@rules/observability`.
- **Server Actions** com enforcement de origin por default, encryption automática dos action IDs, e stack traces melhores em dev. Mantém-se a recomendação de validar input com Zod antes de qualquer side-effect (`@rules/validation`, `@stacks/validation/zod@4`).
- **`next/form`** maduro — primitive de formulário com prefetch e client-side navigation.
- **Cache Components** disponíveis (`use cache` directive e `cacheLife`/`cacheTag` APIs) para granularidade fina de cache em componentes e funções. Validar status estável vs experimental conforme release minor; o projeto adota apenas quando o release notes marcar como estável.
- **Typed Routes** estável. Habilitar `typedRoutes: true` em `next.config.ts` — todo `<Link href>` e `redirect()` passam a ser type-checked contra as rotas reais.
- **Pages Router descontinuado para código novo**. Mantido apenas em rotas legacy que ainda não migraram. Nada novo entra em `pages/`.

---

## Convenções de arquivos do App Router

Estrutura canônica dentro de `app/`:

| Arquivo | Responsabilidade |
|---|---|
| `layout.tsx` | Wrapper persistente entre navegações. Server Component por default. |
| `page.tsx` | Rota navegável. Server Component por default. |
| `loading.tsx` | UI de fallback enquanto o segmento carrega (Suspense automático). |
| `error.tsx` | Error boundary do segmento. **Sempre `"use client"`.** |
| `global-error.tsx` | Error boundary raiz (substitui o root layout em erro fatal). |
| `not-found.tsx` | UI para `notFound()` ou rota inexistente. |
| `route.ts` | Route Handler (HTTP endpoint). Use apenas quando Server Action não resolve. |
| `template.tsx` | Como layout, mas remonta a cada navegação. Evitar sem motivo claro. |
| `default.tsx` | Fallback para parallel routes não resolvidas. |
| `middleware.ts` | Roda no Edge antes do request chegar ao handler. |
| `instrumentation.ts` | Bootstrap de telemetria, OTel, monitoring. |

Roteamento avançado:

- **Dynamic**: `[id]/page.tsx` — `params: Promise<{ id: string }>`.
- **Catch-all**: `[...slug]`.
- **Optional catch-all**: `[[...slug]]`.
- **Route groups**: `(marketing)/`, `(app)/` — agrupam sem afetar URL.
- **Parallel routes**: `@slot/` — renderiza múltiplas páginas no mesmo layout.
- **Intercepting routes**: `(.)foo`, `(..)foo`, `(...)foo` — interceptam navegações (modais, drawers).

A organização interna dentro de cada feature segue `@architecture/fsd`.

---

## Server Components vs Client Components

Server Components são o **default**. Adicione `"use client"` apenas quando o componente precisar de:

- State local (`useState`, `useReducer`).
- Effects (`useEffect`, `useLayoutEffect`).
- Browser APIs (`window`, `localStorage`, `IntersectionObserver`).
- Event handlers (`onClick`, `onChange`) — exceto Server Actions em forms.
- Hooks de libs client-only (Zustand store consumer, etc — ver `@stacks/state/zustand@5` e `@rules/state-management`).

Regras operacionais:

- Marque o componente **folha** que precisa de interatividade, não o layout/page inteiro.
- Server Components podem importar Client Components. Client Components **não** podem importar Server Components, mas podem **receber** Server Components como `children`.
- Nunca passe dados sensíveis (secrets, tokens, dados internos) para Client Components — eles cruzam a network boundary. Ver `@rules/security` e `@contracts/secrets`.
- Não faça `fetch` em Client Component quando o mesmo dado pode ser carregado em Server Component pai.
- Não use `useEffect` para derivar dados que vêm de Server Components — passe via props.

---

## Server Actions

Funções server-side invocáveis do client, marcadas com `"use server"`.

```tsx
"use server";

import { z } from "zod";
import { revalidateTag } from "next/cache";

const Input = z.object({ title: z.string().min(1).max(120) });

export async function createPost(formData: FormData) {
  const parsed = Input.safeParse({ title: formData.get("title") });
  if (!parsed.success) return { error: "invalid" };

  await db.posts.insert(parsed.data);
  revalidateTag("posts");
  return { ok: true };
}
```

Disciplina:

- **Validar todo input com Zod** antes de qualquer side-effect (ver `@rules/validation`, `@stacks/validation/zod@4`).
- **Idempotência** sempre que possível — actions podem ser disparadas duas vezes em retries.
- **Revalidation explícita** via `revalidateTag(tag)` ou `revalidatePath(path)` ao final da action.
- **Origin enforcement** já é default em 16, mas valide `allowedOrigins` em `next.config.ts` se houver proxies/CDN customizados.
- Prefira Server Actions a Route Handlers quando o consumidor é o próprio app. Reserve `route.ts` para webhooks, APIs públicas, ou integrações externas.

---

## Caching

Caching em Next 16 é **opt-in explícito**. Não confie em comportamento implícito. Detalhes operacionais em `@rules/caching`.

Mecanismos disponíveis:

- **`fetch` options**: `fetch(url, { cache: "force-cache" | "no-store", next: { revalidate: 60, tags: ["posts"] } })`.
- **`unstable_cache` / `cache`** (React): memoização de funções server.
- **`revalidateTag(tag)`** e **`revalidatePath(path)`**: invalidação targeted.
- **`staleTimes`** em `next.config.ts`: tuning do Router Cache do client.
- **`use cache` directive** (Cache Components): cache de componentes/funções com `cacheLife`/`cacheTag`.

Padrão do projeto: nenhuma rota é cacheada por inferência. Toda decisão de cache aparece explicitamente em `fetch`, em `unstable_cache`, ou em `export const revalidate = N` da rota.

---

## Streaming, Suspense e UX assíncrono

Ver `@rules/performance`.

- `loading.tsx` por segmento para fallback automático via Suspense.
- `<Suspense fallback={...}>` para granularidade fina dentro de uma page.
- `useTransition` em Client Components para pending states em mutations.
- `useOptimistic` para optimistic UI em Server Actions.

PPR (estável em 16) combina shell prerenderizado com slots dinâmicos:

```tsx
export const experimental_ppr = true;

export default function Page() {
  return (
    <>
      <StaticHeader />
      <Suspense fallback={<Skeleton />}>
        <DynamicUser />
      </Suspense>
    </>
  );
}
```

---

## Metadata, imagens, fontes

- **Metadata**: `export const metadata` estático ou `generateMetadata()` async. Inclui `openGraph`, `twitter`, `robots`, `alternates`.
- **`sitemap.ts`** e **`robots.ts`** em `app/` para geração nativa.
- **`next/image`**: configure `remotePatterns` em `next.config.ts`. Nada de `domains` (descontinuado em 15).
- **`next/font`**: prefira `next/font/google` (self-hosted automático) e `next/font/local`. Não carregue fontes via `<link>` no head.

---

## Internacionalização

Sem i18n routing nativo. Use `middleware.ts` para detecção/redirect de locale, e libs como `next-intl` para mensagens e formatters. Ver `@rules/internationalization`.

---

## Middleware e runtimes

- `middleware.ts` roda no **Edge runtime** por default. Mantenha leve — auth check, redirect, rewrites, geo lookup. Não faça queries pesadas.
- Cada Route Handler ou page pode declarar `export const runtime = "edge" | "nodejs"`. Default é `nodejs`. Use `edge` quando o handler não depende de libs Node-only e ganha latência com edge deploy.
- Server Actions sempre rodam em Node runtime do segmento que as importou.

---

## Variáveis de ambiente

- `NEXT_PUBLIC_*`: expostas ao client em build time. **Nunca** coloque secret aqui.
- Todo o resto: server-only, lido via `process.env.X` em Server Components, Actions, Route Handlers, ou `instrumentation.ts`.
- Convenções de naming e armazenamento em `@contracts/secrets`. Regras de exposição em `@rules/security`.

---

## Error handling

Ver `@rules/error-handling`.

- `error.tsx` por segmento (sempre Client Component) com `reset()`.
- `global-error.tsx` na raiz para erros que escapam o root layout.
- `notFound()` para 404 controlados; `not-found.tsx` para UI.
- `instrumentation.ts` exporta `onRequestError(err, request, context)` para envio a Sentry/OTel.

---

## Build e deploy

- **Turbopack** é o compilador default em `next dev` e `next build`. Verifique compatibilidade de plugins Webpack antes de migrar configurações legacy.
- **Vercel**: deploy ideal (PPR, streaming, edge nativos).
- **Firebase App Hosting**: rodando sobre Cloud Run, suporta SSR/RSC. Configurar `apphosting.yaml` com runtime Node 22/24.
- **Cloud Run direto**: viável via output `standalone` (`output: "standalone"` em `next.config.ts`).
- Para SPA estática, `output: "export"` continua disponível mas perde Server Actions, ISR, middleware, image optimization padrão.

---

## Stack relacionada

- Estilização: `@stacks/frontend/tailwind@4`.
- Componentes: `@stacks/frontend/shadcn-ui`, `@stacks/frontend/radix-ui`.
- Validação: `@stacks/validation/zod@4`.
- Estado client: `@stacks/state/zustand@5` (regras em `@rules/state-management`).
- IA / streaming UI: `@stacks/ai/vercel-ai-sdk`.

---

## Migração 15 → 16

1. Atualizar Node para 22+ (preferencialmente 24 — `@stacks/runtime/node@24`).
2. Atualizar React: `npm i react@19 react-dom@19`.
3. Rodar codemod oficial: `npx @next/codemod@canary upgrade latest`.
4. Revisar `next.config.ts`: remover flags que viraram default (`ppr`, `after`, `typedRoutes`), confirmar `remotePatterns` para imagens.
5. Auditar uso de `unstable_after` → `after`.
6. Auditar Server Actions: confirmar `allowedOrigins` se houver proxies.
7. Rodar `next build` com Turbopack e validar; se algum plugin Webpack quebrar, isolar e decidir entre migrar ou usar `--webpack` temporário.
8. Verificar `instrumentation.ts` e ativar OTel — ver `@rules/observability`.
9. Remover qualquer código novo de `pages/`. Migrar rotas legacy conforme prioridade.

---

## Anti-patterns

Evite ativamente:

- Criar código novo no **Pages Router** (`pages/`). App Router é o único caminho para features novas.
- Marcar `"use client"` em `layout.tsx` ou `page.tsx` inteiros sem necessidade — empurra árvore inteira para o client e perde RSC.
- Passar **dados sensíveis** (tokens, secrets, dados internos) como props para Client Components.
- Fazer `fetch` em Client Component quando Server Component pai pode buscar e passar via props.
- Usar `useEffect` para **derivar dados** que vêm de Server Components — passe via props.
- Assumir **cache implícito**. Em 16, cache é opt-in — toda decisão é explícita.
- Criar Route Handler (`route.ts`) quando Server Action resolve. Route Handlers existem para APIs públicas, webhooks e integrações externas.
- Colocar **lógica pesada em `middleware.ts`** (queries, parsing complexo). Middleware roda em todo request — mantenha-o trivial.
- Desativar Turbopack em build sem motivo documentado.
- Não habilitar `instrumentation.ts` — perde observability nativa.
- Usar `domains` em `next/image` (descontinuado) em vez de `remotePatterns`.
- Esquecer de validar input de Server Actions com Zod antes de side-effects.
- Bloquear o response em trabalho pós-resposta — use `after()` em vez disso.
