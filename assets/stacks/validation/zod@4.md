---
title: Zod
version: 4.x
last_updated: 2026-05-20
status: current
upstream: https://zod.dev
supersedes: zod@3.23
---

# Zod 4.x

Zod é a biblioteca de schema-first validation adotada pelo projeto. A versão 4, lançada em 2025, é um **major rewrite** com ganhos dramáticos de performance, redução de bundle e mudanças sintáticas em validators de string. Este documento captura o uso correto da versão atual e o que difere de Zod 3.

Convenções transversais de modelagem vivem em `@contracts/schemas`. Imperativos de uso em código vivem em `@rules/validation` e `@rules/data-modeling`.

## O que mudou vs Zod 3

| Aspecto                    | Zod 3                          | Zod 4                                         |
| -------------------------- | ------------------------------ | --------------------------------------------- |
| Parse de string            | baseline                       | ~14x mais rápido                              |
| Parse geral                | baseline                       | ~7x mais rápido                               |
| `discriminatedUnion`       | baseline                       | ~100x mais rápido                             |
| Bundle (tree-shaken)       | baseline                       | ~3x menor                                     |
| `z.string().email()`       | método encadeável              | função top-level `z.email()` (**breaking**)   |
| `z.string().uuid()`        | método encadeável              | `z.uuid()` (**breaking**)                     |
| `z.string().url()`         | método encadeável              | `z.url()` (**breaking**)                      |
| `z.string().datetime()`    | método encadeável              | `z.iso.datetime()` (**breaking**)             |
| ISO 8601                   | espalhado em `z.string()`      | namespace dedicado `z.iso.*`                  |
| Modos de objeto            | `.strict`/`.passthrough`       | `.strict()` / `.loose()` / `.strip()` (default) |
| Recursão                   | `z.lazy` obrigatório           | autodetecção (lazy opcional)                  |
| JSON Schema                | dependência externa            | first-class via `z.toJSONSchema(schema)`      |
| Discriminadores múltiplos  | apenas um                      | suporte a múltiplos discriminadores           |
| Error pretty-print         | manual                         | `z.prettifyError(error)`                      |
| Tree-shaking               | parcial                        | imports granulares por feature                |

Não traga idioms de Zod 3 para código novo. Ver seção de migração ao final.

## Filosofia

Schema como **single source of truth**. O schema Zod define simultaneamente a validação em runtime e o tipo TypeScript inferido. Nunca declarar `interface User` paralelo a `userSchema` — derivar com `z.infer<typeof userSchema>`. Detalhes desta convenção em `@rules/data-modeling`.

## Schemas básicos

```ts
import { z } from "zod";

z.string();
z.number();
z.bigint();
z.boolean();
z.date();
z.symbol();
z.null();
z.undefined();
z.unknown(); // preferir sobre z.any()
z.never();
z.void();
```

Use `z.unknown()` quando o tipo é genuinamente desconhecido na fronteira. `z.any()` é proibido por preguiça (ver `@rules/validation`).

## Composição

```ts
z.object({ name: z.string() });
z.array(z.string());
z.tuple([z.string(), z.number()]);
z.union([z.string(), z.number()]);          // último recurso
z.discriminatedUnion("kind", [a, b, c]);    // preferir sempre que houver discriminator
z.intersection(a, b);
z.literal("admin");
z.enum(["admin", "user", "guest"]);
z.record(z.string(), z.number());
z.map(z.string(), z.number());
z.set(z.string());
z.lazy(() => Node);                          // opcional em Zod 4; necessário apenas em casos exóticos
```

`discriminatedUnion` é dramaticamente mais rápido em Zod 4 (~100x) e produz erros mais úteis. Use-o sempre que houver um campo discriminador estável.

## Refinements e transforms

```ts
schema.refine((v) => v.length > 0, { message: "vazio" });
schema.superRefine((v, ctx) => {
  if (cond) ctx.addIssue({ code: "custom", message: "..." });
}); // multi-issue
schema.transform((v) => v.trim());
schemaA.pipe(schemaB);
```

`superRefine` é o caminho quando uma validação pode produzir múltiplos issues independentes.

## Modifiers

```ts
schema.optional();
schema.nullable();
schema.nullish();
schema.default(value);
schema.catch(fallback);
schema.describe("doc string");
schema.brand<"UserId">();   // branded type — ver @rules/data-modeling
schema.readonly();
```

Branded types são obrigatórios para identificadores sensíveis (`UserId`, `OrgId`, `Email` quando usado como chave). Ver `@rules/data-modeling`.

## Object utilities

```ts
userSchema.partial();
userSchema.required();
userSchema.pick({ id: true, name: true });
userSchema.omit({ password: true });
userSchema.extend({ role: z.string() });
userSchema.merge(otherSchema);

userSchema.strict();    // rejeita campos extras
userSchema.strip();     // remove campos extras (default)
userSchema.loose();     // preserva campos extras (substitui passthrough de Zod 3)
userSchema.catchall(z.unknown());
```

**Nunca use `.loose()` em wire format público** — preserva campos não modelados e vaza dados. Confine `.loose()` a fronteiras internas onde a expansão de payload é intencional.

## Validators de string em Zod 4

Os validators de formato saíram de `z.string()` e viraram funções top-level:

```ts
z.string().min(1).max(100);
z.string().length(10);
z.string().regex(/^[A-Z]+$/);

z.email();
z.url();
z.uuid();
z.cuid();
z.cuid2();
z.ulid();
z.nanoid();

z.iso.datetime({ offset: true });
z.iso.date();
z.iso.time();
z.iso.duration();

z.ipv4();
z.ipv6();
z.cidrv4();
z.cidrv6();

z.base64();
z.base64url();
z.jwt();
```

Estes retornam schemas de string com a validação aplicada. Para encadear regras adicionais use os métodos normais: `z.email().max(254)`.

## Coerção

```ts
z.coerce.string();
z.coerce.number();
z.coerce.boolean();
z.coerce.date();
z.coerce.bigint();
```

**Sempre encadeie validação adicional após coerção.** `z.coerce.number()` aceita `"abc"` como `NaN`; sem `.refine((n) => !Number.isNaN(n))` ou `.finite()`, o schema vaza lixo. Coerção sem refinement é anti-pattern (ver `@rules/validation`).

## Parsing

```ts
const data = schema.parse(input);            // throw em erro
const result = schema.safeParse(input);      // { success, data, error }
```

Convenção do projeto:

- **`safeParse` em toda boundary externa** — corpos HTTP, Server Actions, payloads de fila, respostas de API de terceiros, leituras de banco, env vars. Ver `@contracts/api` para formato de envelope de erro.
- **`.parse` apenas quando o input já é trusted** — output de outro schema Zod validado upstream, fixtures de teste, dados de construção interna.

Nunca lance um `ZodError` para o client. Mapeie para o envelope de erro definido em `@contracts/api` e siga `@rules/error-handling`.

## Error handling

```ts
const result = schema.safeParse(input);
if (!result.success) {
  console.error(z.prettifyError(result.error));
  const flat = result.error.flatten();          // { formErrors, fieldErrors }
  const tree = result.error.format();           // árvore aninhada
  const issues = result.error.issues;           // raw
}
```

Para i18n de mensagens, configure `errorMap` global no boot da aplicação ou por schema. Ver `@rules/internationalization` para a estratégia de localização do projeto.

## Type inference

```ts
const userSchema = z.object({ id: z.uuid(), name: z.string() });

type User = z.infer<typeof userSchema>;     // output (após transforms)
type UserInput = z.input<typeof userSchema>;  // input bruto
type UserOutput = z.output<typeof userSchema>; // alias de z.infer
```

Quando há `transform`, `input` e `output` divergem. Use `z.input` para tipar payloads de formulário, `z.infer` para o domínio interno.

## Integrações no stack

### Next.js 16 Server Actions (`@stacks/frontend/next@16`)

Toda Server Action começa com `safeParse` do payload. Falha de validação retorna o envelope definido em `@contracts/api`; nunca propagar `ZodError`.

### shadcn/ui Form (`@stacks/frontend/shadcn-ui`)

`react-hook-form` + `@hookform/resolvers/zod`. O schema fica fora do componente (módulo top-level ou arquivo dedicado), nunca inline no JSX — schemas inline são recriados a cada render e quebram memoização do resolver.

### Env vars

Schema central em `src/env.ts`. Parse no boot; se falhar, **rejeitar startup** (`process.exit(1)` em Node, throw em edge). Ver `@contracts/secrets` para naming e `@rules/security` para segregação client/server.

### API contracts

Schemas de request/response são a fonte de verdade contratual. Ver `@contracts/api` e `@contracts/schemas`.

### Persistência (Firestore / Postgres)

Validar na **fronteira de leitura** — todo documento Firestore ou row Postgres atravessa um schema Zod antes de virar objeto de domínio. Convenções de modelagem em `@contracts/firebase-firestore` e `@contracts/postgres`.

### AI SDKs (`@stacks/ai/vercel-ai-sdk`)

`generateObject({ schema })` recebe o schema Zod diretamente. Tool definitions usam Zod para `parameters`. O modelo é forçado a respeitar a forma; ainda assim, trate output como untrusted e re-valide se vier por canal indireto.

### OpenAPI / JSON Schema

Zod 4 expõe `z.toJSONSchema(schema)` nativamente. Use-o para gerar specs OpenAPI a partir dos schemas de contrato. Para metadata adicional (descriptions, examples, security schemes) o ecosystem `@asteasolutions/zod-to-openapi` continua útil. Ver `@practices/sdd`.

## Performance

- Declare schemas como **singletons em escopo de módulo**. Nunca dentro de componentes React, handlers ou loops.
- `discriminatedUnion` >> `union` sempre que houver discriminator estável (diferença de ordem de magnitude em Zod 4).
- Em hot paths, prefira `safeParse` a `parse` (evita o custo de construção/unwind do throw).
- Schemas grandes tree-shake bem em Zod 4; importe granularmente quando o bundler suporta.

## Migração 3 → 4

Codemod oficial:

```bash
npx zod-codemod@latest
```

Principais breaks a revisar manualmente:

| Zod 3                            | Zod 4                          |
| -------------------------------- | ------------------------------ |
| `z.string().email()`             | `z.email()`                    |
| `z.string().uuid()`              | `z.uuid()`                     |
| `z.string().url()`               | `z.url()`                      |
| `z.string().datetime()`          | `z.iso.datetime()`             |
| `z.string().date()`              | `z.iso.date()`                 |
| `z.string().ip()`                | `z.ipv4()` ou `z.ipv6()`       |
| `.passthrough()`                 | `.loose()`                     |
| `ZodError.format()` shape antigo | nova estrutura — re-verificar consumers |

Após codemod, rode a suíte completa e revise:

1. Locais que faziam introspecção em `error.format()` ou `error.issues`.
2. `errorMap` customizados — a assinatura mudou em alguns casos.
3. Recursão com `z.lazy` — pode ser simplificada.
4. Imports — alguns paths foram reorganizados.

Não deixe Zod 3 e Zod 4 coexistirem no runtime do mesmo bundle. Migre a árvore inteira em um único PR.

## Anti-patterns

- `interface User` paralelo a `userSchema` — use `z.infer<typeof userSchema>`. Ver `@rules/data-modeling`.
- `.parse` em boundary externa sem `try/catch` — use `safeParse`.
- `z.any()` por preguiça — use `z.unknown()` e refine. Ver `@rules/validation`.
- `.loose()` em wire format público — vaza dados não modelados.
- IDs sensíveis tipados como `string` cru — use `.brand<"UserId">()`. Ver `@rules/data-modeling`.
- Lançar `ZodError` para o client — sempre encapsule no envelope de `@contracts/api`. Ver `@rules/error-handling`.
- Coerção sem refinement subsequente — `z.coerce.number()` aceita `NaN`.
- Schema inline em componente React — recriação a cada render, quebra memoização.
- Misturar idioms Zod 3 (`.email()`, `.uuid()` encadeados em `z.string()`) em código Zod 4 — inconsistente e pode falhar conforme o codemod avança.
- Schema declarado dentro de loop ou handler — overhead desnecessário, sempre top-level.

## Referências cruzadas

- `@rules/validation` — imperativos de uso de Zod em código
- `@rules/data-modeling` — branded types, schema-first, `z.infer`
- `@rules/security` — segregação client/server de env vars
- `@rules/error-handling` — mapeamento de `ZodError` para envelope público
- `@rules/internationalization` — `errorMap` e mensagens localizadas
- `@contracts/api` — envelope de erro, request/response shape
- `@contracts/schemas` — convenções de modelagem de schemas
- `@contracts/firebase-firestore` — validação na fronteira de leitura Firestore
- `@contracts/postgres` — validação na fronteira de leitura Postgres
- `@contracts/secrets` — naming e parsing de env vars
- `@stacks/language/typescript@6` — interação com inference
- `@stacks/frontend/next@16` — Server Actions
- `@stacks/frontend/shadcn-ui` — form resolver
- `@stacks/ai/vercel-ai-sdk` — `generateObject`, tool params
- `@practices/sdd` — geração de OpenAPI a partir dos schemas
