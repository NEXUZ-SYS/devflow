---
type: adr
name: adr-typescript-frontend
description: TypeScript 5.9.x como linguagem tipada da stack JS na camada Frontend
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

# ADR — TypeScript 5.9.x como Linguagem Tipada do Frontend

- **Data:** 2026-05-11
- **Status:** Aprovado
- **Escopo:** Organizacional
- **Stack:** TypeScript 5.9.x
- **Categoria:** Arquitetura

---

## Contexto

Frontend Next 16 + React 19 + Tauri 2 com FSD + Atomic Design, Zustand 5, Tailwind 4, shadcn/ui. Consumo do BFF via route handlers; contratos compartilhados em `packages/contracts` (Zod + YAML). Build no Turborepo exige inferência rápida, tree-shaking previsível e zero ambiguidade no shape de props/stores. JS puro deixa erros estruturais para runtime; o ciclo AI-first (Claude Code + Team Agents) precisa de tipos como contrato semântico legível por LLM.

## Decisão

Adotar **TypeScript 5.9.x** como única linguagem fonte do Frontend. `strict: true`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`. `.ts`/`.tsx` obrigatório em `apps/web/**` e `packages/ui/**`. Tipos de domínio derivados via `z.infer<typeof Schema>` de `packages/contracts`. Nenhum `.js` em código de produção; declaração `.d.ts` permitida apenas para shims de assets.

```
apps/web/src/
  features/{slice}/{ui,model,api}/*.tsx  → import types from @nxz/contracts
packages/contracts/                       → Zod schemas (source of truth)
tsconfig.base.json                        → strict + bundler moduleResolution
```

## Alternativas Consideradas

- **JavaScript + JSDoc** — type-check parcial; perde inferência genérica, narrow de discriminated unions e refactors seguros.
- **Flow** — ecossistema marginal pós-2020; sem suporte de shadcn/ui, Vitest, Storybook 9.
- **ReScript / Elm** — interop custoso com React 19 e Tauri; curva inviável para AI-first.
- **TypeScript 5.9.x strict** ✓ — único caminho com integração nativa em Next 16, Vitest, Vercel AI SDK v6, MSW e Storybook.

## Consequências

**Positivas**
- Type safety end-to-end → menos defeitos em runtime
- Inferência via Zod → contrato único frontend/BFF
- Refactor seguro, autocomplete denso, melhor sinal para LLM
- `satisfies` operator, `const` type parameters, decorators TC39

**Negativas**
- Build/typecheck adiciona ~CPU no CI (mitigado por `tsc --noEmit` paralelo no Turborepo)
- Generics complexos elevam barreira de entrada
- `any`/`as` mascaram bugs se não auditados

**Riscos aceitos**
- Versões de libs sem types → `@types/*` ou `.d.ts` local

## Guardrails

- SEMPRE `strict: true` e flags `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`
- SEMPRE derivar tipos de domínio de `z.infer` em `@nxz/contracts`
- NUNCA `any` implícito; NUNCA `// @ts-ignore` (use `@ts-expect-error` com justificativa)
- NUNCA `as` para coerção entre tipos não-relacionados
- QUANDO interop com lib sem types, ENTÃO criar `.d.ts` em `types/` com nome explícito
- QUANDO erro envolve discriminated union, ENTÃO exaustividade via `assertNever`

## Enforcement

- [ ] Code review: rejeitar PR com `any`, `as unknown as T`, `@ts-ignore`
- [ ] Lint: `@typescript-eslint/no-explicit-any`, `@typescript-eslint/no-unsafe-*` (via Biome ou ESLint)
- [ ] Teste: `tsc --noEmit` em `pnpm typecheck` por workspace; bloqueia merge
- [ ] Gate CI/PREVC: Validation phase executa `turbo run typecheck` antes de testes

## Evidências / Anexos

**Fontes oficiais:** [TypeScript Handbook — Everyday Types](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html) · [TypeScript Handbook — Introduction](https://www.typescriptlang.org/docs/handbook/intro.html) · [TC39 — ECMAScript Proposals](https://github.com/tc39/proposals)

```ts
// exemplo minimal — tipo derivado de Zod no Frontend
import { z } from 'zod';
import type { Resource } from '@nxz/contracts';

const ResourceSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  active: z.boolean(),
});

type ResourceInput = z.infer<typeof ResourceSchema>;

export function normalize(r: ResourceInput): Resource {
  return { ...r, name: r.name.trim() } satisfies Resource;
}
```
