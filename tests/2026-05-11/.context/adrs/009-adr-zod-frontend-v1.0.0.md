---
type: adr
name: adr-zod-frontend
description: Zod 4.1.x como schema validation runtime TS na camada Frontend
scope: organizational
source: local
stack: Zod 4.1
category: qualidade-testes
status: Aprovado
version: 1.0.0
created: 2026-05-11
supersedes: []
refines: []
protocol_contract: null
decision_kind: firm
summary: ""
---

# ADR — Zod como schema validation runtime TS no Frontend

- **Data:** 2026-05-11
- **Status:** Aprovado
- **Escopo:** Organizacional
- **Stack:** Zod 4.1.x
- **Categoria:** Qualidade & Testes

---

## Contexto

Tipos TS apagam em runtime. Borda do Frontend (resposta do BFF, payload AG-UI streaming, parâmetros de route handler, localStorage hidratado, deep-link Tauri) recebe `unknown`. Sem parse, qualquer drift de contrato vira erro tardio em render. `packages/contracts` já é Zod + YAML pareado — Zod é a fonte canônica TS.

## Decisão

Adotar **Zod 4.1.x** como única biblioteca de validação runtime do Frontend. Todo schema vive em `packages/contracts/<context>/<schema>.ts` e é importado pelas features. Borda externa (resposta `fetch`, evento SSE, parâmetros URL, payload IPC Tauri) faz `Schema.parse(input)` antes de tocar lógica. Tipos TS derivam via `z.infer<typeof Schema>` — DRY, fonte única. Out: validação de UI form (react-hook-form + `zodResolver`) reusa o mesmo schema.

## Alternativas Consideradas

- **Yup** — tipagem TS inferida fraca, ecossistema menor, sem `discriminatedUnion` ergonômico.
- **Valibot** — ~75% menor em bundle, porém ecossistema imaturo p/ AG-UI/Next; sem paridade YAML em `packages/contracts`.
- **io-ts** — funcional puro, curva alta, DX inferior em codebase mista.
- **ArkType** — performático mas API instável em 2026; risco de migração futura.
- **Zod 4.1.x ✓** — inferência TS perfeita, `discriminatedUnion`, `brand`, integração nativa com react-hook-form e Vercel AI SDK.

## Consequências

**Positivas**
- Fronteira de confiança tipada em todo I/O → erros caem no parse, não em render.
- `z.infer` elimina duplicação `type ↔ schema`.
- `discriminatedUnion` cobre eventos AG-UI (streaming) com narrowing exaustivo.
- Schema reutilizado em form + fetch + IPC → DRY real.

**Negativas**
- Bundle Zod ~13 KB gz (mitigado por tree-shaking e import seletivo).
- Erros padrão verbosos → exigem `z.setErrorMap` custom p/ i18n pt-BR.

**Riscos aceitos**
- Schemas profundos custam parse em hot path → memoizar resposta + parse em borda apenas.

## Guardrails

- SEMPRE declarar schema em `packages/contracts/**` e derivar tipo via `z.infer`; NUNCA definir interface paralela.
- SEMPRE `parse` (não `safeParse`) na borda quando falha for fatal; usar `safeParse` apenas em UI tolerante.
- NUNCA usar `z.any()` ou `z.unknown()` para escapar de contrato — corrige o schema.
- NUNCA validar duas vezes o mesmo dado no mesmo fluxo (parse na borda, propagar tipo estreito).
- QUANDO consumir resposta do BFF, ENTÃO `Schema.parse(await res.json())` antes de qualquer state update.
- QUANDO criar form, ENTÃO `zodResolver(schema)` reusando o mesmo schema do contrato.

## Enforcement

- [ ] Code review: todo `fetch`/handler IPC tem `Schema.parse` na primeira linha após I/O.
- [ ] Lint: ESLint custom proibindo `z.any()`/`z.unknown()` fora de `packages/contracts/internal/**`.
- [ ] Teste: Vitest cobre schemas (válido/inválido/edge); MSW handler usa o mesmo schema para garantir paridade contrato↔mock.
- [ ] Gate CI/PREVC: job `contracts:check` diffa Zod ↔ YAML em `packages/contracts` e falha em drift.

## Evidências / Anexos

**Fontes oficiais:** [Zod — Docs](https://zod.dev/) · [Zod — GitHub](https://github.com/colinhacks/zod) · [Zod — Discriminated unions](https://zod.dev/?id=discriminated-unions)

```ts
// packages/contracts/resource/schema.ts — fonte canônica + parse em borda
import { z } from 'zod';

export const ResourceSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(120),
  kind: z.enum(['a', 'b']),
});

export type Resource = z.infer<typeof ResourceSchema>;

// uso em features/resource/api/get-resource.ts
export async function getResource(id: string): Promise<Resource> {
  const res = await fetch(`/api/resources/${id}`);
  return ResourceSchema.parse(await res.json());
}
```
