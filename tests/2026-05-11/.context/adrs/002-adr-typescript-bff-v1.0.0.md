---
type: adr
name: adr-typescript-bff
description: TypeScript 5.9.x como linguagem tipada da stack JS na camada BFF
scope: organizational
source: local
stack: TypeScript 5.9.x
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

# ADR — TypeScript 5.9.x como Linguagem Tipada do BFF

- **Data:** 2026-05-11
- **Status:** Aprovado
- **Escopo:** Organizacional
- **Stack:** TypeScript 5.9.x
- **Categoria:** Arquitetura

---

## Contexto

BFF em route handlers Next 16 (`app/api/**`) feature-based, orquestrando FastAPI, LLMs via Mastra Model Router, MCP clients, Firebase Admin SDK, BigQuery client Node v8. Fronteira de confiança entre Frontend e Backend: precisa contrato tipado para request/response, validação de payload e tipos compartilhados com `packages/contracts`. Streaming de tool calls, Workflows e Memory exige tipos discriminados precisos para evitar drift de schema entre módulos.

## Decisão

Adotar **TypeScript 5.9.x** como única linguagem fonte do BFF. `strict: true`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `moduleResolution: bundler`. Route handlers tipam `NextRequest`/`NextResponse` explicitamente; payload validado por `Schema.safeParse` antes de orquestração. Tipos compartilhados com Frontend via `@nxz/contracts`. Server-only code marcado com `import 'server-only'`.

```
apps/web/src/app/api/{feature}/route.ts → handler tipado
  ↓ validate (Zod)  ↓ orchestrate (Mastra)  ↓ respond (typed)
packages/contracts                          → fonte única de tipos
```

## Alternativas Consideradas

- **JavaScript + JSDoc** — inferência fraca em handlers async; perde narrow em discriminated unions de tool calls.
- **Deno + TypeScript** — incompatível com Firebase App Hosting (Node runtime); ecossistema npm fragmentado.
- **Bun + TypeScript** — runtime ainda imaturo para Firebase App Hosting + Vercel AI SDK v6.
- **TypeScript 5.9.x strict** ✓ — alinhado com Frontend; mesmo `@nxz/contracts` cruza a fronteira sem serialização extra.

## Consequências

**Positivas**
- Contrato tipado Frontend↔BFF↔Backend via Zod
- Detecção estática de drift entre `packages/contracts` e handlers
- Inferência de tool calls / structured outputs em Vercel AI SDK v6
- `satisfies`, `const` type parameters, melhor narrow em `Result<T,E>`

**Negativas**
- Tipos de SDKs externos (Mastra, MCP) podem ficar atrás da versão
- Erros de tipo em handlers async exigem leitura cuidadosa

**Riscos aceitos**
- Tipos do MCP SDK em evolução → wrapper interno com tipos estáveis

## Guardrails

- SEMPRE `strict: true` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`
- SEMPRE validar payload com `Schema.safeParse` antes de orquestrar
- SEMPRE tipar retorno do route handler como `Promise<NextResponse<TypedBody>>`
- NUNCA `any` em fronteira HTTP; NUNCA `as` em payload bruto
- NUNCA importar `firebase-admin` em código que não tenha `import 'server-only'`
- QUANDO erro de domínio, ENTÃO retornar `Result<T, DomainError>` discriminado

## Enforcement

- [ ] Code review: rejeitar `any` em handlers e em adapters de SDK
- [ ] Lint: `@typescript-eslint/no-floating-promises`, `no-misused-promises`, `consistent-type-imports`
- [ ] Teste: contract tests Vitest validam Zod schemas contra handlers
- [ ] Gate CI/PREVC: `turbo run typecheck` + `turbo run test:contract` antes de merge

## Evidências / Anexos

**Fontes oficiais:** [TypeScript Handbook — Everyday Types](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html) · [TypeScript Handbook — Introduction](https://www.typescriptlang.org/docs/handbook/intro.html) · [TC39 — ECMAScript Proposals](https://github.com/tc39/proposals)

```ts
// exemplo minimal — route handler tipado com Zod no BFF
import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

const InputSchema = z.object({ id: z.string().uuid() });
type ResourceResponse = { id: string; status: 'ok' | 'pending' };

export async function POST(req: NextRequest): Promise<NextResponse<ResourceResponse | { error: string }>> {
  const parsed = InputSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: 'invalid' }, { status: 400 });
  return NextResponse.json({ id: parsed.data.id, status: 'ok' } satisfies ResourceResponse);
}
```
