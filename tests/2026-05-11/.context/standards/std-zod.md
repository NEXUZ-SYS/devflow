---
id: std-zod
description: Zod 4.1.x como schema validation runtime TS na camada Frontend
version: 1.0.0
applyTo: ["**/*.ts", "**/*.tsx"]
relatedAdrs: ["adr-zod-frontend"]
enforcement:
  linter: standards/machine/std-zod.js
weakStandardWarning: true
---
# Standard: zod
## Princípios
Adotar **Zod 4.1.x** como única biblioteca de validação runtime do Frontend. Todo schema vive em `packages/contracts/<context>/<schema>.ts` e é importado pelas features. Borda externa (resposta `fetch`, evento SSE, parâmetros URL, payload IPC Tauri) faz `Schema.parse(input)` antes de tocar lógica. Tipos TS derivam via `z.infer<typeof Schema>` — DRY, fonte única. Out: validação de UI form (react-hook-form + `zodResolver`) reusa o mesmo schema.
## Anti-patterns
| Errado | Certo |
|---|---|
| usar `z.any()` ou `z.unknown()` para escapar de contrato — corrige o schema. | Aplicar a alternativa explicitada na ADR (Decisão / Enforcement) |
| validar duas vezes o mesmo dado no mesmo fluxo (parse na borda, propagar tipo estreito). | Aplicar a alternativa explicitada na ADR (Decisão / Enforcement) |
## Linter
`./machine/std-zod.js` verifica:

1. todo `fetch`/handler IPC tem `Schema.parse` na primeira linha após I/O.
2. ESLint custom proibindo `z.any()`/`z.unknown()` fora de `packages/contracts/internal/**`.
3. Vitest cobre schemas (válido/inválido/edge); MSW handler usa o mesmo schema para garantir paridade contrato↔mock.
4. job `contracts:check` diffa Zod ↔ YAML em `packages/contracts` e falha em drift.

Output em formato `VIOLATION: <regra> (<file>:<line>) — <correção sugerida>` per SI-4 contract.
## Referência
ADRs derivadas:
- adr-zod-frontend (`009-adr-zod-frontend-v1.0.0.md`)
Fontes oficiais (consolidadas das ADRs):

**Fontes oficiais:** [Zod — Docs](https://zod.dev/) · [Zod — GitHub](https://github.com/colinhacks/zod) · [Zod — Discriminated unions](https://zod.dev/?id=discriminated-unions)
  kind: z.enum(['a', 'b']),
Authoring guide: `.context/standards/README.md`
