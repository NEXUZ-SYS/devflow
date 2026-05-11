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
**frontend** (adr-typescript-frontend): Adotar **TypeScript 5.9.x** como única linguagem fonte do Frontend. `strict: true`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`. `.ts`/`.tsx` obrigatório em `apps/web/**` e `packages/ui/**`. Tipos de domínio derivados via `z.infer<typeof Schema>` de `packages/contracts`. Nenhum `.js` em código de produção; declaração `.d.ts` permitida apenas para shims de assets.

```
apps/web/src/
  features/{slice}/{ui,model,api}/*.tsx  → import types from @nxz/contracts
packages/contracts/                       → Zod schemas (source of truth)
tsconfig.base.json                        → strict + bundler moduleResolution
```

**bff** (adr-typescript-bff): Adotar **TypeScript 5.9.x** como única linguagem fonte do BFF. `strict: true`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `moduleResolution: bundler`. Route handlers tipam `NextRequest`/`NextResponse` explicitamente; payload validado por `Schema.safeParse` antes de orquestração. Tipos compartilhados com Frontend via `@nxz/contracts`. Server-only code marcado com `import 'server-only'`.

```
apps/web/src/app/api/{feature}/route.ts → handler tipado
  ↓ validate (Zod)  ↓ orchestrate (Mastra)  ↓ respond (typed)
packages/contracts                          → fonte única de tipos
```
## Anti-patterns
| Errado | Certo |
|---|---|
| `any` implícito; NUNCA `// @ts-ignore` (use `@ts-expect-error` com justificativa) | Aplicar a alternativa explicitada na ADR (Decisão / Enforcement) |
| `as` para coerção entre tipos não-relacionados | Aplicar a alternativa explicitada na ADR (Decisão / Enforcement) |
| `any` em fronteira HTTP; NUNCA `as` em payload bruto | Aplicar a alternativa explicitada na ADR (Decisão / Enforcement) |
| importar `firebase-admin` em código que não tenha `import 'server-only'` | Aplicar a alternativa explicitada na ADR (Decisão / Enforcement) |
## Linter
`./machine/std-typescript.js` verifica:

1. rejeitar PR com `any`, `as unknown as T`, `@ts-ignore`
2. `@typescript-eslint/no-explicit-any`, `@typescript-eslint/no-unsafe-*` (via Biome ou ESLint)
3. `tsc --noEmit` em `pnpm typecheck` por workspace; bloqueia merge
4. Validation phase executa `turbo run typecheck` antes de testes
5. rejeitar `any` em handlers e em adapters de SDK
6. `@typescript-eslint/no-floating-promises`, `no-misused-promises`, `consistent-type-imports`
7. contract tests Vitest validam Zod schemas contra handlers
8. `turbo run typecheck` + `turbo run test:contract` antes de merge

Output em formato `VIOLATION: <regra> (<file>:<line>) — <correção sugerida>` per SI-4 contract.
## Referência
ADRs derivadas:
- adr-typescript-frontend (`001-adr-typescript-frontend-v1.0.0.md`)
- adr-typescript-bff (`002-adr-typescript-bff-v1.0.0.md`)
Fontes oficiais (consolidadas das ADRs):

**Fontes oficiais:** [TypeScript Handbook — Everyday Types](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html) · [TypeScript Handbook — Introduction](https://www.typescriptlang.org/docs/handbook/intro.html) · [TC39 — ECMAScript Proposals](https://github.com/tc39/proposals)
**Fontes oficiais:** [TypeScript Handbook — Everyday Types](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html) · [TypeScript Handbook — Introduction](https://www.typescriptlang.org/docs/handbook/intro.html) · [TC39 — ECMAScript Proposals](https://github.com/tc39/proposals)
Authoring guide: `.context/standards/README.md`
