---
id: std-runtime-validation
description: Toda entrada externa cruza um schema de validação antes de entrar no domínio
version: 1.2.0
source: devflow-default
applyTo: ["**/*.{ts,tsx,js,jsx,py,go}"]
activation: on-demand
relatedAdrs: []
enforcement:
  linter: machine/std-runtime-validation.js
---
## Princípios

- Valide todo dado que cruza a fronteira do código na borda mais externa possível; código interno assume invariantes
- Use `.parse()` ou `.safeParse()` para transformar dado desconhecido em dado tipado — validação booleana sem parse é anti-pattern
- Schema é fonte da verdade: tipo TypeScript é inferido do schema (`z.infer`), nunca declarado paralelamente
- Boundaries obrigatórios: route handlers, Server Actions, functions HTTP, mensagens de fila, webhooks, output de LLM, env vars no boot, respostas de APIs externas
- Use `safeParse` em boundaries onde falha de validação é fluxo esperado (retorna erro estruturado); use `parse` apenas quando falha é bug irrecuperável
- Valide env vars no boot via Zod e exporte um `env` tipado; o resto do código consome `env`, nunca `process.env` direto — processo aborta imediatamente se var obrigatória estiver ausente
- Nunca `process.env.X!` (non-null assertion) nem `process.env.X || 'default'`; use `requireEnv("X")` ou o `env` validado — assertion/default silencioso esconde misconfiguration de produção
- LLM output é input externo: valide mesmo quando o SDK aceita o schema, pois modelos quebram contrato em casos limítrofes
- Use branded types (`z.string().brand<'UserId'>()`) para identificadores; evita misturar `userId` com `orderId`
- Retorne `400 Bad Request` quando validação falha — erro de validação é culpa do cliente, não `500`
- Schemas em arquivos próprios (`*.schema.ts`, `schemas/`) compartilháveis entre client e server

## Anti-patterns

| Errado | Corrija para |
|---|---|
| `type User = {...}` + schema Zod separado | `type User = z.infer<typeof UserSchema>` |
| `as` para validar output de LLM | `.safeParse()` com schema real |
| `JSON.parse(body)` sem schema na sequência | `Schema.safeParse(JSON.parse(body))` |
| `process.env.X!` (non-null assertion) | `requireEnv("X")` ou `env` validado no boot |
| `z.any()` em campo crítico | Declare shape ou use `z.unknown()` + refinement |
| Validar somente no cliente | Servidor sempre valida; cliente é UX redundante |
| Schema inline em handler de 200 linhas | Extrair para arquivo `*.schema.ts` |
