---
id: std-schemas
description: Schema é fonte da verdade do shape dos dados; tipos são sempre derivados
version: 1.2.0
source: devflow-default
applyTo: ["**/*.{ts,tsx,js,jsx,py,go}"]
activation: on-demand
relatedAdrs: []
enforcement:
  linter: machine/std-schemas.js
---
## Princípios

- Schema-first: defina o shape com schema; gere/infira tipos a partir dele via `z.infer<typeof Schema>`
- Nunca declare `interface` ou `type` paralela a um schema Zod para a mesma entidade — os dois divergem em silêncio
- Schemas em arquivos próprios (`*.schema.ts` ou `src/contracts/<context>/`) compartilháveis entre client e server
- Naming: PascalCase com sufixo `Schema` (`UserSchema`); tipo inferido tem o mesmo nome sem sufixo (`type User`)
- Branded types para identificadores semânticos (`UserId`, `OrderId`) — previne mistura acidental
- Evolução compatível: adicionar campo opcional é ok; tornar obrigatório é breaking change; renomear exige fase de coexistência
- Refinements (regex, range, regra de negócio) no schema, não no handler
- Use `.strict()` em input externo de cliente (campo extra = sinal de exploit); `.strip()` (default) em input interno entre serviços
- Nunca `.passthrough()` em wire público — aceita campos arbitrários não validados; declare o shape explícito de tudo que cruza a borda
- Nunca `z.any()` em payload — desliga a validação; use `z.unknown()` + `.refine()` quando o shape é genuinamente desconhecido
- Naming inválido: `userSchema` (camelCase), `IUser` (húngara), `OrderType` (sem sufixo `Schema`) — sempre `PascalCase` + sufixo `Schema`
- Schemas exportados são API pública — quebrar o schema quebra consumidores

## Anti-patterns

| Errado | Corrija para |
|---|---|
| `z.any()` em payload | `z.unknown()` + `.refine()` ou shape declarado |
| `.passthrough()` em wire público | Shape explícito de todos os campos |
| `const userSchema` (lowercase) | `const UserSchema` (PascalCase + sufixo) |
| `interface Foo` + `z.object({...})` em paralelo | `type Foo = z.infer<typeof FooSchema>` |
| Adicionar campo obrigatório a schema existente | Adicionar como opcional + migração gradual |
| Renomear `customer_id` → `customerId` no wire sem versionar | Aceitar ambos por uma janela, depois deprecar |
| Schema inline no handler | Extrair para `*.schema.ts` reutilizável |
| `as` para criar branded type fora da factory | O brand só existe legitimamente após parse |
