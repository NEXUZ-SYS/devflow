---
type: adr
name: adr-zod-frontend
description: Zod 4.1.x como schema validation runtime TS da camada Frontend (boundary BFF, formulários, storage)
scope: organizational
source: local
stack: Zod 4.1.x
category: qualidade-testes
status: Aprovado
version: 1.0.0
created: 2026-05-08
supersedes: []
refines: []
protocol_contract: null
decision_kind: firm
summary: ""
---

# ADR — Zod 4.1.x na Camada Frontend

- **Data:** 2026-05-08
- **Status:** Aprovado
- **Escopo:** Organizacional
- **Stack:** Zod
- **Categoria:** Qualidade & Testes

## Contexto

Camada Frontend: TypeScript 5.9 strict + Next.js 16 + React 19 + Tauri 2 + Zustand 5. Type erasure em runtime exige validação em **toda fronteira de confiança**: response do BFF, dados de URL/query/params, formulários, mensagens IPC do Tauri, leitura de `localStorage`/`sessionStorage`/storage do SO. Tipos manuais espelhando JSON divergem rapidamente; `as` e cast silencioso geram bugs latentes; libs pareadas (Yup, Joi) têm inferência fraca em TS strict. Necessário schema único, inferência forte (`z.infer`), reuso entre client/server (RSC, route handlers) e ferramental para formulários (`react-hook-form`).

## Decisão

Adotar **Zod 4.1.x** como biblioteca exclusiva de **validação runtime** e **fonte canônica de tipos** da camada Frontend. Schemas vivem em **`packages/contracts`** (Zod + YAML pareados), tipos derivados via `z.infer<typeof S>` — nunca redeclarados. Validação obrigatória em todo boundary externo (BFF response, URL params, IPC, storage). Integração com `react-hook-form` via `@hookform/resolvers/zod`. Erros formatados via `z.treeifyError` para UI; logs estruturados no servidor.

## Alternativas Consideradas

- **Yup** — sintaxe agradável, mas inferência TS limitada e tipo-narrowing frágil em strict mode.
- **Joi** — runtime sólido, porém tipagem TS é cidadão de segunda classe.
- **io-ts** — funcional rigoroso, ergonomia baixa para o time, ferramental escasso.
- **Valibot** — tree-shakable e leve, ecossistema/integrações ainda menores que Zod.
- **ArkType** — performance excelente, projeto jovem, menos integrações com `react-hook-form`/Next.
- **Zod 4.1.x** ✓ — DX consolidada, inferência canônica, plugins maduros (`@hookform/resolvers`, `zod-to-openapi`), v4 com perf melhorada e API estabilizada.

## Consequências

**Positivas**
- Schema único como **fonte de verdade**; tipos TS gerados sempre alinhados.
- Boundary safety: parse explícito barra dados malformados em produção.
- Reuso 1:1 entre RSC, route handlers e client components.
- Mensagens de erro estruturadas (`treeifyError`) ligam direto ao field-level UI.

**Negativas**
- Custo de runtime em hot-path → schemas grandes precisam `.strip()`/`.passthrough()` conscientes.
- Bundle size cresce com schemas inline → impôr `packages/contracts` reduz duplicação.
- Migração de v3→v4 exigiu revisão de APIs (`errorMap` → `error`, etc.).

**Riscos aceitos**
- Acoplamento ao Zod como spec interna → mitigado por fronteira em `packages/contracts`.
- Performance em parsers hot → benchmark via Vitest e troca tática por schema mais simples se necessário.

## Guardrails

- SEMPRE definir schemas em `packages/contracts`; NUNCA inline em componentes ou route handlers.
- SEMPRE derivar tipos com `z.infer<typeof S>`; NUNCA declarar `interface`/`type` paralelo.
- SEMPRE `parse`/`safeParse` em **todo** boundary externo (fetch BFF, URL, storage, IPC Tauri).
- NUNCA usar `as Type` para contornar parse; cast só é permitido após `safeParse` bem-sucedido.
- NUNCA `z.any()`/`z.unknown()` em schema público sem justificativa documentada no JSDoc.
- QUANDO compor schemas, ENTÃO preferir `.extend`, `.merge`, `.pick`, `.omit` no schema canônico.
- QUANDO usar em formulário, ENTÃO via `zodResolver` do `@hookform/resolvers`.

## Enforcement

- [ ] Code review: bloqueia tipo manual paralelo a schema, `as` em retorno de fetch, schema inline duplicado.
- [ ] Lint: regra custom proibindo `import { z } from "zod"` fora de `packages/contracts/**` e arquivos `*.schema.ts`.
- [ ] Teste: Vitest com casos válidos + inválidos por schema crítico; cobertura por boundary.
- [ ] Build CI: `tsc --noEmit` valida coerência dos tipos inferidos consumidos.
- [ ] Gate PREVC: diff de `packages/contracts` revisado; mudança breaking exige bump major do package.

## Evidências / Anexos

**Fontes oficiais:**
- [Zod Docs](https://zod.dev/)
- [Zod GitHub](https://github.com/colinhacks/zod)
- [Zod v4 Release Notes](https://zod.dev/v4)
- [@hookform/resolvers](https://github.com/react-hook-form/resolvers)
- [TypeScript Inference](https://www.typescriptlang.org/docs/handbook/type-inference.html)

```typescript
// packages/contracts/resource.ts — schema canônico + tipo inferido
import { z } from "zod";

export const ResourceSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(120),
  createdAt: z.coerce.date(),
});

export type Resource = z.infer<typeof ResourceSchema>;

// app/(web)/resources/page.tsx — boundary validado
export async function loadResource(input: unknown): Promise<Resource> {
  const result = ResourceSchema.safeParse(input);
  if (!result.success) {
    throw new Error(`invalid resource: ${JSON.stringify(z.treeifyError(result.error))}`);
  }
  return result.data;
}
```
