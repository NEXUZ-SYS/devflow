---
type: adr
name: adr-typescript-bff
description: TypeScript 5.9.x como linguagem tipada da camada BFF (Next route handlers + Mastra + MCP)
scope: organizational
source: local
stack: TypeScript 5.9.x
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

# ADR — TypeScript 5.9.x na Camada BFF

- **Data:** 2026-05-08
- **Status:** Aprovado
- **Escopo:** Organizacional
- **Stack:** TypeScript
- **Categoria:** Arquitetura

## Contexto

Camada BFF: route handlers Next (`app/api/**`), Vercel AI SDK v6, Mastra Model Router, Mastra Workflows/Memory, MCP clients, Firestore Admin SDK, BigQuery Node v8. Orquestra LLMs heterogêneos e serviços FastAPI; ponto de fronteira de confiança (auth, rate-limit, validação). JS puro produz fronteiras frágeis entre handlers, SDKs assíncronos e contratos Zod. Necessário type safety nas bordas, inferência sobre streams (AI SDK), tipos discriminados em workflows.

## Decisão

Adotar **TypeScript 5.9.x** como linguagem única da camada BFF. `strict: true`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`. Tipos derivados de Zod (entrada/saída de handlers e tools MCP). Build com `tsc --noEmit` no CI; runtime via Next/SWC.

## Alternativas Consideradas

- **JavaScript + JSDoc** — frágil em discriminated unions e generics de SDK; pobre para tools MCP tipadas.
- **Deno + TS nativo** — ferramental incompatível com Next/Mastra/Vercel AI SDK no monorepo.
- **TypeScript 5.9.x** ✓ — inferência forte sobre streams/AI SDK, type guards em handlers, integração Zod ↔ MCP.

## Consequências

**Positivas**
- Fronteira de confiança tipada (input → handler → SDK → output).
- Tools MCP descritas por schema com tipos inferidos.
- Discriminated unions cobrem branches de model router e workflows.
- Refactor seguro entre handlers, NXZ Harness e clients.

**Negativas**
- Tipos de SDKs externos (Google/OpenAI/Anthropic) variam em qualidade.
- Build-time adicional (mitigado por Turbo cache).
- Complexidade em generics de streams/transforms.

**Riscos aceitos**
- Erasure em runtime — Zod no boundary obrigatório.
- Drift entre versões dos SDKs LLM (mitigado por pinning + smoke tests).

## Guardrails

- SEMPRE `strict: true`; tipos públicos exportados via `export type`.
- SEMPRE validar payload de entrada com Zod em todo route handler.
- NUNCA `any`; usar `unknown` + parsing.
- NUNCA `enum`; usar `as const` + literal union.
- NUNCA confiar em retorno de SDK externo sem narrow.
- QUANDO definir tool MCP, ENTÃO derivar tipo de schema Zod canônico.
- QUANDO cruzar fronteira (Firestore/BigQuery/LLM), ENTÃO validar saída com Zod.

## Enforcement

- [ ] Code review: bloqueia `any`, `@ts-ignore`, payload sem `Schema.parse`.
- [ ] Lint: `@typescript-eslint/strict-type-checked` + `consistent-type-imports`.
- [ ] Build CI: `tsc --noEmit` por workspace; pipeline falha em erro de tipo.
- [ ] Teste: Vitest + MSW para handlers; asserts tipados (`expectTypeOf`).
- [ ] Gate PREVC: `pnpm typecheck` obrigatório antes do merge.

## Evidências / Anexos

**Fontes oficiais:**
- [TypeScript 5.9 Release Notes](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-9.html)
- [Next.js Route Handlers](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)
- [Vercel AI SDK](https://sdk.vercel.ai/docs)
- [Firebase Admin SDK (Node)](https://firebase.google.com/docs/admin/setup)

```typescript
// app/api/resources/route.ts — fronteira tipada via Zod
import { z } from "zod";
import { NextResponse } from "next/server";
import { getFirestore } from "firebase-admin/firestore";

const InputSchema = z.object({ id: z.string().uuid() });
type Input = z.infer<typeof InputSchema>;

export async function POST(req: Request) {
  const parsed = InputSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const input: Input = parsed.data;
  const snap = await getFirestore().collection("resources").doc(input.id).get();
  return NextResponse.json(snap.data() ?? null);
}
```
