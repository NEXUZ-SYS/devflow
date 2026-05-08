---
type: adr
name: adr-typescript-frontend
description: TypeScript 5.9.x como linguagem tipada da camada Frontend (Next.js + React + Tauri)
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

# ADR — TypeScript 5.9.x na Camada Frontend

- **Data:** 2026-05-08
- **Status:** Aprovado
- **Escopo:** Organizacional
- **Stack:** TypeScript
- **Categoria:** Arquitetura

## Contexto

Camada Frontend: Next.js 16 + React 19 + Tauri 2 + Zustand 5. Múltiplos shells (web/desktop) consumindo BFF via route handlers. Contratos compartilhados em `packages/contracts` (Zod + YAML pareados). JS puro produz drift de tipos entre fronteiras (UI ↔ store ↔ BFF ↔ schemas Zod) e degrada feedback loop AI-first. Necessário type safety end-to-end, inferência forte (Zod → TS) e suporte a tooling (Vitest, Storybook, ESLint typed-rules).

## Decisão

Adotar **TypeScript 5.9.x** como linguagem única e obrigatória da camada Frontend. `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`. Tipos inferidos a partir dos schemas Zod canônicos — nunca redeclarados manualmente. Build via `tsc --noEmit` no CI; transpile delegado ao Next.js (SWC).

## Alternativas Consideradas

- **JavaScript + JSDoc** — baixa fricção, porém inferência limitada com generics, sem `satisfies`, sem const-assert robusto, ferramental incompleto para FSD/Atomic.
- **Flow** — tipagem nominal viável, mas ecossistema estagnado, sem suporte first-class de Next 16/React 19/Vitest.
- **TypeScript 5.9.x** ✓ — inferência avançada, `satisfies`, control-flow analysis, integração nativa com Zod/Next/Vitest/Storybook, melhor sinal para agentes AI.

## Consequências

**Positivas**
- Type safety end-to-end (UI → store → BFF boundary).
- Inferência automática de DTOs via Zod (`z.infer<>`).
- Refactor seguro em monorepo grande (rename, move, extract).
- Sinal denso para LLMs em geração e revisão de código.

**Negativas**
- Curva inicial (generics, conditional types, variance).
- Custo de manutenção do `tsconfig` e paths em monorepo Turborepo.
- Build-time maior que JS puro (mitigado por SWC + cache Turbo).

**Riscos aceitos**
- Type erasure em runtime — validação de fronteira sempre via Zod.
- Acoplamento à evolução do compilador (mitigado por pinning minor).

## Guardrails

- SEMPRE `strict: true` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`.
- SEMPRE inferir tipos de schemas Zod (`z.infer<typeof S>`); NUNCA duplicar manualmente.
- NUNCA usar `any` em produção; preferir `unknown` + narrowing.
- NUNCA `// @ts-ignore`; usar `// @ts-expect-error` com motivo + ticket.
- NUNCA `enum`; usar `as const` + union literal.
- QUANDO cruzar fronteira (BFF, storage, URL), ENTÃO validar com Zod no boundary.
- QUANDO criar tipo público de package, ENTÃO exportar via `export type` explícito.

## Enforcement

- [ ] Code review: bloqueia `any`, `@ts-ignore`, `enum`, type duplicado de schema Zod.
- [ ] Lint: `@typescript-eslint/strict-type-checked` + `no-explicit-any` + `consistent-type-imports`.
- [ ] Build CI: `tsc --noEmit` por workspace; falha quebra o pipeline.
- [ ] Teste: Vitest com `@vitest/coverage-v8`, asserts tipados via `expectTypeOf`.
- [ ] Gate PREVC: `pnpm typecheck` obrigatório antes do merge.

## Evidências / Anexos

**Fontes oficiais:**
- [TypeScript 5.9 Release Notes](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-9.html)
- [TSConfig Reference](https://www.typescriptlang.org/tsconfig)
- [Zod TypeScript Inference](https://zod.dev/?id=type-inference)
- [Next.js TypeScript](https://nextjs.org/docs/app/building-your-application/configuring/typescript)

```typescript
// packages/contracts/resource.ts
import { z } from "zod";

export const ResourceSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  createdAt: z.coerce.date(),
});

export type Resource = z.infer<typeof ResourceSchema>;

// app/(web)/resources/page.tsx — boundary validado
export async function loadResource(input: unknown): Promise<Resource> {
  return ResourceSchema.parse(input);
}
```
