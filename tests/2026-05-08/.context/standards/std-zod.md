---
id: std-zod
description: Zod 4.1.x como schema validation runtime TS da camada Frontend (boundary BFF, formulários, storage)
version: 1.0.0
applyTo: ["**/*.ts", "**/*.tsx"]
relatedAdrs: ["adr-zod-frontend"]
enforcement:
  linter: standards/machine/std-zod.js
weakStandardWarning: true
---
# Standard: zod
## Princípios
Adotar **Zod 4.1.x** como biblioteca exclusiva de **validação runtime** e **fonte canônica de tipos** da camada Frontend. Schemas vivem em **`packages/contracts`** (Zod + YAML pareados), tipos derivados via `z.infer<typeof S>` — nunca redeclarados. Validação obrigatória em todo boundary externo (BFF response, URL params, IPC, storage). Integração com `react-hook-form` via `@hookform/resolvers/zod`. Erros formatados via `z.treeifyError` para UI; logs estruturados no servidor.
## Anti-patterns
| Errado | Certo |
|---|---|
| usar `as Type` para contornar parse; cast só é permitido após `safeParse` bem-sucedido. | Aplicar a alternativa explicitada na ADR (Decisão / Enforcement) |
| `z.any()`/`z.unknown()` em schema público sem justificativa documentada no JSDoc. | Aplicar a alternativa explicitada na ADR (Decisão / Enforcement) |
## Linter
`./machine/std-zod.js` verifica:

1. bloqueia tipo manual paralelo a schema, `as` em retorno de fetch, schema inline duplicado.
2. regra custom proibindo `import { z } from "zod"` fora de `packages/contracts/**` e arquivos `*.schema.ts`.
3. Vitest com casos válidos + inválidos por schema crítico; cobertura por boundary.
4. Build CI: `tsc --noEmit` valida coerência dos tipos inferidos consumidos.
5. Gate PREVC: diff de `packages/contracts` revisado; mudança breaking exige bump major do package.

Output em formato `VIOLATION: <regra> (<file>:<line>) — <correção sugerida>` per SI-4 contract.
## Referência
ADRs derivadas:
- adr-zod-frontend (`009-adr-zod-frontend-v1.0.0.md`)
Fontes oficiais (consolidadas das ADRs):

**Fontes oficiais:**
- [Zod Docs](https://zod.dev/)
- [Zod GitHub](https://github.com/colinhacks/zod)
- [Zod v4 Release Notes](https://zod.dev/v4)
- [@hookform/resolvers](https://github.com/react-hook-form/resolvers)
- [TypeScript Inference](https://www.typescriptlang.org/docs/handbook/type-inference.html)
Authoring guide: `.context/standards/README.md`
