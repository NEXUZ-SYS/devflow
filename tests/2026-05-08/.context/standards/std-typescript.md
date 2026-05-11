---
id: std-typescript
description: Convenções consolidadas para typescript (cobre 2 ADRs cross-camada)
version: 1.0.0
applyTo: ["**/*.ts", "**/*.tsx"]
relatedAdrs: ["adr-typescript-frontend", "adr-typescript-bff"]
enforcement:
  linter: standards/machine/std-typescript.js
weakStandardWarning: true
---
# Standard: typescript
## Princípios
**frontend** (adr-typescript-frontend): Adotar **TypeScript 5.9.x** como linguagem única e obrigatória da camada Frontend. `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`. Tipos inferidos a partir dos schemas Zod canônicos — nunca redeclarados manualmente. Build via `tsc --noEmit` no CI; transpile delegado ao Next.js (SWC).

**bff** (adr-typescript-bff): Adotar **TypeScript 5.9.x** como linguagem única da camada BFF. `strict: true`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`. Tipos derivados de Zod (entrada/saída de handlers e tools MCP). Build com `tsc --noEmit` no CI; runtime via Next/SWC.
## Anti-patterns
| Errado | Certo |
|---|---|
| usar `any` em produção; preferir `unknown` + narrowing. | Aplicar a alternativa explicitada na ADR (Decisão / Enforcement) |
| `// @ts-ignore`; usar `// @ts-expect-error` com motivo + ticket. | Aplicar a alternativa explicitada na ADR (Decisão / Enforcement) |
| `enum`; usar `as const` + union literal. | Aplicar a alternativa explicitada na ADR (Decisão / Enforcement) |
| `any`; usar `unknown` + parsing. | Aplicar a alternativa explicitada na ADR (Decisão / Enforcement) |
| `enum`; usar `as const` + literal union. | Aplicar a alternativa explicitada na ADR (Decisão / Enforcement) |
| confiar em retorno de SDK externo sem narrow. | Aplicar a alternativa explicitada na ADR (Decisão / Enforcement) |
## Linter
`./machine/std-typescript.js` verifica:

1. bloqueia `any`, `@ts-ignore`, `enum`, type duplicado de schema Zod.
2. `@typescript-eslint/strict-type-checked` + `no-explicit-any` + `consistent-type-imports`.
3. Build CI: `tsc --noEmit` por workspace; falha quebra o pipeline.
4. Vitest com `@vitest/coverage-v8`, asserts tipados via `expectTypeOf`.
5. Gate PREVC: `pnpm typecheck` obrigatório antes do merge.
6. bloqueia `any`, `@ts-ignore`, payload sem `Schema.parse`.
7. `@typescript-eslint/strict-type-checked` + `consistent-type-imports`.
8. Build CI: `tsc --noEmit` por workspace; pipeline falha em erro de tipo.
9. Vitest + MSW para handlers; asserts tipados (`expectTypeOf`).

Output em formato `VIOLATION: <regra> (<file>:<line>) — <correção sugerida>` per SI-4 contract.
## Referência
ADRs derivadas:
- adr-typescript-frontend (`001-adr-typescript-frontend-v1.0.0.md`)
- adr-typescript-bff (`002-adr-typescript-bff-v1.0.0.md`)
Fontes oficiais (consolidadas das ADRs):

**Fontes oficiais:**
- [TypeScript 5.9 Release Notes](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-9.html)
- [TSConfig Reference](https://www.typescriptlang.org/tsconfig)
- [Zod TypeScript Inference](https://zod.dev/?id=type-inference)
- [Next.js TypeScript](https://nextjs.org/docs/app/building-your-application/configuring/typescript)
**Fontes oficiais:**
- [TypeScript 5.9 Release Notes](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-9.html)
- [Next.js Route Handlers](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)
- [Vercel AI SDK](https://sdk.vercel.ai/docs)
- [Firebase Admin SDK (Node)](https://firebase.google.com/docs/admin/setup)
Authoring guide: `.context/standards/README.md`
