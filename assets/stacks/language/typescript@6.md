---
title: TypeScript
version: 6.x
last_updated: 2026-05-20
status: current
upstream: https://www.typescriptlang.org/docs/
supersedes: typescript@5.4
category: language
---

# TypeScript 6.x

Linguagem oficial do projeto. TypeScript 6 consolida a série 5.x (5.4 → 5.8) em uma release estabilizadora: remove flags deprecadas há ciclos, endurece defaults de checagem, alinha emissão com a era pós-bundler/strip-types e remove cruft de compatibilidade pré-Node 20. Não é uma reinvenção da linguagem — é uma poda profunda. Toda migração 5.x → 6 deve assumir que código que silenciava warnings agora quebra build.

Documento substitui `@stacks/language/typescript@6` (movido de `runtime/` para `language/`, pois TypeScript é linguagem, não runtime — o runtime é `@stacks/runtime/node@24`).

## Baseline da release

- **Versão alvo do projeto**: TypeScript 6.x.
- **Node mínimo para rodar `tsc`**: Node 20 LTS. Recomendado Node 24 (ver `@stacks/runtime/node@24`).
- **`lib` baseline**: `ES2024` + `DOM` (apps web) ou `ES2024` puro (Node).
- **Browser baseline implícito**: navegadores com suporte a ES2023+ (Chrome 117+, Safari 17.4+, Firefox 121+). Polyfill explícito para qualquer alvo abaixo disso.
- **Pacote**: `typescript@^6` em devDependencies; nunca em dependencies.

## Breaking changes vs 5.x

A migração não é cosmética. Os pontos abaixo costumam quebrar build em projetos vindos de 5.4/5.5:

- **Flags removidas** (não mais reconhecidas no `tsconfig.json`): `--prepend`, `--out` (use `--outFile`), `--charset`, `--keyofStringsOnly`, `--suppressExcessPropertyErrors`, `--suppressImplicitAnyIndexErrors`, `--noStrictGenericChecks`, `--importsNotUsedAsValues` (substituído por `verbatimModuleSyntax`), `--preserveValueImports` (idem), `--ignoreDeprecations` aceita apenas `"6.0"` para silenciar avisos finais antes da próxima major.
- **Defaults endurecidos**: `useDefineForClassFields` agora default `true` em qualquer `target` (antes só ES2022+); `moduleDetection` default `force` em projetos novos; `isolatedModules` recomendado como default.
- **Type checking mais estrito**:
  - Narrowing de `unknown` em catch agora exige checagem antes de `.message` mesmo com `useUnknownInCatchVariables` (era contornável com asserções inline em 5.x).
  - Inferência de `this` em métodos de objeto literal sem `this` parameter explícito tornou-se `unknown` em vez de `any`.
  - `Object.keys`/`for...in` retornam `string` (não mais `keyof T`) — comportamento já documentado, agora sem escape via flag.
- **Emit**: `--module preserve` é o default recomendado quando há bundler downstream. Sem bundler, `--module nodenext` continua canônico.
- **Decoradores legados** (`experimentalDecorators` + `emitDecoratorMetadata`): ainda funcionam, mas emitem warning de deprecação. Código novo usa stage-3.

Codemod oficial: `npx -p typescript@6 tsc --init --migrate` (gera tsconfig novo) e `npx @typescript/migrate-6` (reescreve sintaxe quebrada).

## Features marcantes acumuladas

Resumo do que acumulou entre 5.4 e 6.x e o que vale usar.

### `NoInfer<T>` (5.4)

Bloqueia inferência de um parâmetro de tipo a partir de um argumento específico, deixando a inferência vir de outro:

```ts
function createStreetLight<C extends string>(
  colors: C[],
  defaultColor?: NoInfer<C>,
): void { /* ... */ }

createStreetLight(["red", "yellow", "green"], "red");     // OK
createStreetLight(["red", "yellow", "green"], "blue");    // erro
```

Use em DSLs e factories onde um parâmetro deve restringir o outro sem alargar a união.

### Inferred type predicates (5.5)

`Array.prototype.filter` infere predicados de narrowing automaticamente:

```ts
const items: (string | null)[] = ["a", null, "b"];
const cleaned = items.filter(x => x !== null);
//    ^? string[]   (antes: (string | null)[])
```

Funciona com `=== null`, `!== undefined`, `typeof`, `instanceof` e checagens compostas óbvias. Não precisa mais escrever `(x): x is string => x !== null` na maioria dos casos. Predicates explícitos continuam necessários para narrowing customizado (ver `@rules/validation`).

### Regular expression syntax checking (5.5)

Erros de regex literal são reportados em build (grupos não fechados, classes inválidas, backreferences ausentes). Não substitui teste, mas pega typos.

### `Object.groupBy` / `Map.groupBy` (5.4+, runtime ES2024)

Tipados em `lib.es2024.collection.d.ts`. Use em vez de `reduce` manual:

```ts
const byStatus = Object.groupBy(orders, (o) => o.status);
//    ^? Partial<Record<string, Order[]>>
```

Note `Partial<Record<...>>` — chaves não são garantidas. Combine com `noUncheckedIndexedAccess`.

### `--module preserve` / `--moduleResolution bundler` (maduros)

`preserve` mantém `import`/`export` exatamente como escrito (sem reescrita de extensões). `bundler` resolve sem exigir `.js` em paths. Use em apps com bundler (Next, Vite). Para libs publicadas em npm, use `nodenext`.

### Stable `using` / `await using` (Explicit Resource Management — 5.2+, maduro em 6)

```ts
{
  using file = openFile(path);          // Symbol.dispose chamado ao sair do escopo
  await using conn = await openDb();    // Symbol.asyncDispose chamado
  // ...
}  // dispose chamado aqui, mesmo em throw
```

Substitui `try/finally` para recursos disponíveis. Em Node 24, suporte nativo. Use para conexões de banco, locks, spans de tracing.

### Iterator helpers tipados (5.6+)

`map`, `filter`, `take`, `drop`, `flatMap`, `reduce`, `toArray` em iterators (não só arrays). Tipos completos. Disponível em runtime ES2025+ (Node 24).

### `--noUncheckedSideEffectImports` (5.6)

Erro quando `import "./side-effect"` aponta para módulo inexistente — antes era silenciosamente preservado.

### Path rewriting em emit (5.7)

`tsc` reescreve paths relativos para incluir `.js` no output quando `--rewriteRelativeImportExtensions`. Útil para libs que escrevem `.ts` no source mas publicam `.js`. Não use em apps com bundler.

### `--erasableSyntaxOnly` (5.8, default-on em 6)

Restringe a sintaxe permitida ao que pode ser apagado sem transformação semântica — proíbe `enum`, `namespace` com conteúdo runtime, `import =`/`export =` legacy, parameter properties em construtores, decoradores legados. Alinha com Node strip-types (ver `@stacks/runtime/node@24`), permitindo executar `.ts` direto sem `tsx`/`ts-node`.

Esta é a feature de maior impacto da 6: código que dependia de `enum` ou parameter properties precisa migrar.

### Conditional types e branded types refinados

Inferência em distributive conditional types ficou mais previsível; recursão profunda tem limites mais altos antes de cair em `any`. Branded types via intersection funcionam sem hacks (ver Idioms).

### Decorators stage-3 estáveis

Sem `experimentalDecorators`. Sintaxe nova:

```ts
function logged<This, Args extends any[], Return>(
  target: (this: This, ...args: Args) => Return,
  ctx: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Return>,
) {
  return function (this: This, ...args: Args): Return {
    console.log(`${String(ctx.name)} called`);
    return target.call(this, ...args);
  };
}
```

Use com parcimônia. Funções de ordem superior resolvem 90% dos casos sem decorator.

## `tsconfig.json` canônico

Base para apps do projeto:

```jsonc
{
  "compilerOptions": {
    "target": "ES2024",
    "lib": ["ES2024", "DOM", "DOM.Iterable"],
    "module": "preserve",
    "moduleResolution": "bundler",
    "jsx": "preserve",

    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": true,
    "noFallthroughCasesInSwitch": true,
    "noImplicitReturns": true,

    "verbatimModuleSyntax": true,
    "erasableSyntaxOnly": true,
    "isolatedModules": true,

    "esModuleInterop": true,
    "resolveJsonModule": true,
    "allowImportingTsExtensions": true,
    "noEmit": true,

    "skipLibCheck": true,
    "incremental": true,
    "tsBuildInfoFile": ".tscache/tsbuildinfo"
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"],
  "exclude": ["node_modules", "dist", ".next"]
}
```

### Variações por contexto

- **Libs publicadas em npm** e **Firebase Functions** (ver `@stacks/backend/firebase-functions`): trocar `"module": "preserve"` → `"nodenext"`, `"moduleResolution": "bundler"` → `"nodenext"`, `"noEmit": false`, adicionar `"outDir": "dist"`, `"declaration": true`, `"declarationMap": true`, `"sourceMap": true`.
- **Apps Next.js 16** (ver `@stacks/frontend/next@16`): manter `"module": "preserve"` + `"moduleResolution": "bundler"`; deixar Next gerar o `tsconfig.json` inicial.
- **Monorepos**: ative `composite: true` + `references` em cada pacote; raiz com `"files": []` e apenas `references`.

### Flags não-negociáveis

- `strict: true` — sem exceção.
- `noUncheckedIndexedAccess: true` — `arr[i]` é `T | undefined`. Reflete a realidade do JavaScript.
- `exactOptionalPropertyTypes: true` — `{ x?: string }` não aceita `{ x: undefined }`. Força clareza sobre "ausente" vs "presente e undefined".
- `verbatimModuleSyntax: true` — proíbe `import` de tipo sem `import type`. Necessário para `erasableSyntaxOnly` e strip-types.
- `erasableSyntaxOnly: true` — alinha com Node strip-types, força idiomas modernos.

## Idioms

### `import type`

Obrigatório com `verbatimModuleSyntax`:

```ts
import type { User } from "./types";
import { fetchUser } from "./api";
```

Para imports mistos:

```ts
import { fetchUser, type User } from "./api";
```

### Branded types

Tipos nominais para evitar trocar `UserId` por `OrderId`:

```ts
type Brand<T, B extends string> = T & { readonly __brand: B };

type UserId = Brand<string, "UserId">;
type OrderId = Brand<string, "OrderId">;

const asUserId = (s: string): UserId => s as UserId;
```

Combine com validação Zod runtime (ver `@stacks/validation/zod@4` e `@rules/data-modeling`). A asserção `as UserId` deve viver apenas dentro do parser; nunca espalhe `as` por código de domínio.

### `as const`

Congela literais para usar em discriminated unions ou contratos:

```ts
const ROLES = ["admin", "viewer", "editor"] as const;
type Role = (typeof ROLES)[number];  // "admin" | "viewer" | "editor"
```

### Discriminated unions sobre enums

```ts
type Event =
  | { type: "click"; x: number; y: number }
  | { type: "key"; key: string }
  | { type: "scroll"; delta: number };
```

Use `switch` com `never` exhaustiveness:

```ts
function handle(e: Event): void {
  switch (e.type) {
    case "click": return;
    case "key": return;
    case "scroll": return;
    default: {
      const _exhaustive: never = e;
      throw new Error(`unhandled: ${JSON.stringify(_exhaustive)}`);
    }
  }
}
```

### `satisfies`

Valida que um objeto bate com um tipo sem perder a inferência literal:

```ts
const config = {
  api: "https://api.example.com",
  timeout: 5000,
} satisfies AppConfig;

config.api;  // string literal, não string
```

### Type predicates seguros

Quando `filter` não infere automaticamente, escreva o predicate alinhado com runtime check:

```ts
const isOrder = (x: unknown): x is Order =>
  typeof x === "object" && x !== null && "id" in x && typeof x.id === "string";
```

Para schemas complexos, delegue a Zod (ver `@stacks/validation/zod@4`) e use `z.infer` para o tipo (ver `@rules/validation`).

### Generics constrained

Restrinja parâmetros de tipo. Genéricos abertos viram `unknown` no uso e geram bugs sutis:

```ts
function pick<T extends object, K extends keyof T>(obj: T, keys: K[]): Pick<T, K>;
```

### `using` para resource management

```ts
async function withTransaction(db: Db) {
  await using tx = await db.begin();
  await tx.exec("...");
  await tx.commit();
  // se throw entre begin e commit, dispose roda rollback
}
```

Disponível em Node 24 nativo.

## Execução local e build

### Rodar `.ts` direto

Com Node 24 strip-types (ver `@stacks/runtime/node@24`):

```bash
node script.ts                    # strip-types automático
node --experimental-strip-types script.ts   # versões mais antigas
```

`tsx` deixa de ser obrigatório para scripts simples. Continua útil quando precisa de transformação além de apagar tipos (decorators, JSX em CLI, etc).

### Typecheck (CI)

```bash
tsc --noEmit
```

Esta é a verificação de build do projeto. Roda em CI; nunca confie no editor sozinho.

### Build de produção

- **Apps Next/Vite**: bundler cuida do emit; `tsc --noEmit` apenas para typecheck.
- **Libs**: `tsc -b` (com project references) ou `tsup`/`unbuild` para bundles dual ESM+CJS.
- **Firebase Functions** (ver `@stacks/backend/firebase-functions`): `tsc` emite para `lib/`; entrada do package aponta para `lib/index.js`.

## Integração com o stack

- **Zod 4** (ver `@stacks/validation/zod@4`): use `z.infer<typeof Schema>` como única fonte de tipo para fronteiras (API, formulários, DB). Não duplique types manualmente.
- **Next.js 16** (ver `@stacks/frontend/next@16`): `tsconfig.json` gerado pelo Next; mantenha `verbatimModuleSyntax` e `erasableSyntaxOnly`.
- **React 19** (ver `@stacks/frontend/react@19`): `@types/react@19` + `@types/react-dom@19`; sem `FC` — anote props diretamente.
- **Postgres / Drizzle** (ver `@stacks/database/postgres`): tipos derivados do schema Drizzle; nunca escreva interface paralela à tabela.
- **Firebase Functions** (ver `@stacks/backend/firebase-functions`): `module: "nodenext"`, emit habilitado, target ES2024.

## Performance

- `incremental: true` + `tsBuildInfoFile` — cache de build entre runs.
- `project references` em monorepos — `tsc -b` reconstrói apenas o que mudou.
- `skipLibCheck: true` — aceitável e recomendado; checagem completa de `.d.ts` de dependências é cara e raramente útil.
- `assumeChangesOnlyAffectDirectDependencies` em watch mode quando o grafo é grande.

## Diagnostics

Quando o build está lento ou um tipo se comporta de forma estranha:

```bash
tsc --diagnostics              # tempo total por fase
tsc --extendedDiagnostics      # detalhe de memória, checks, símbolos
tsc --listFiles                # arquivos no programa
tsc --traceResolution          # como cada import foi resolvido
tsc --generateTrace ./trace    # trace consumível em chrome://tracing
```

Use `--generateTrace` para diagnosticar "type olympics" — funções genéricas que explodem o checker.

## Lint complementar

TypeScript não substitui linter. Use ESLint type-aware (`@typescript-eslint/parser` com `projectService: true`) ou Biome. Regras mínimas: `no-floating-promises`, `no-misused-promises`, `consistent-type-imports`, `no-explicit-any`, `prefer-as-const`, `switch-exhaustiveness-check`. Veja `@rules/development`.

## Migração 5.x → 6

1. Atualize Node para 20 LTS mínimo (24 recomendado).
2. Rode `npx @typescript/migrate-6` no repo.
3. Substitua `enum` por `as const` + union literal.
4. Substitua parameter properties (`constructor(private x: number)`) por field declarations explícitas.
5. Remova `experimentalDecorators` — porte para stage-3 ou remova decorators.
6. Remova flags deprecadas do `tsconfig.json` (lista em "Breaking changes").
7. Ative `erasableSyntaxOnly` e corrija erros restantes.
8. Rode `tsc --noEmit` até zerar.
9. Atualize CI para Node 20+.

## Anti-patterns

- **`any` para sair de problema**. Use `unknown` e estreite, ou modele o tipo. `any` desativa o checker no ponto de uso e contamina o resto.
- **`as` para coerção sem validação runtime**. `JSON.parse(s) as User` é mentira para o compilador. Valide com Zod (`@stacks/validation/zod@4`, `@rules/validation`).
- **Types espelhando objetos quando `z.infer` resolve**. Manter `interface User` paralela ao `UserSchema` é dois locais para errar.
- **Enums numéricos**. Bloqueados por `erasableSyntaxOnly`. Use `as const` + union de strings.
- **`namespace` ou `module` legacy**. Bloqueados em código novo. Use ES modules.
- **`noUncheckedIndexedAccess` desligado**. Index access em runtime pode retornar `undefined`; o tipo deve refletir isso.
- **Over-generics ("type olympics")**. Se um tipo tem mais de três parâmetros condicionais aninhados, repense. Tipos devem ser legíveis em 30 segundos.
- **Decoradores legados em código novo**. Stage-3 ou função de ordem superior.
- **Classes onde funções resolvem**. TypeScript não é Java. State management em hooks/stores, lógica em funções puras, classes apenas quando há ciclo de vida real (resource handles, etc).
- **`!` (non-null assertion) espalhado**. Cada `!` é um bug em potencial. Use narrowing, predicates ou erro explícito.
- **`@ts-ignore` / `@ts-expect-error` sem comentário**. Sempre justifique. Prefira `@ts-expect-error` (falha quando o erro some).

## Referências cruzadas

- `@stacks/runtime/node@24` — runtime, strip-types, `using` nativo.
- `@stacks/validation/zod@4` — schema runtime + `z.infer`.
- `@stacks/frontend/next@16` — config de TS em apps Next.
- `@stacks/frontend/react@19` — types de React 19.
- `@stacks/database/postgres` — tipos derivados de schema.
- `@stacks/backend/firebase-functions` — config TS para Functions.
- `@rules/development` — lint, formatação, regras de código.
- `@rules/validation` — onde valida runtime e como deriva tipos.
- `@rules/data-modeling` — branded types, modelagem de IDs e VOs.
