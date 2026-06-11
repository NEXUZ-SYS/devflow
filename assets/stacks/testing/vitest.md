---
title: Vitest
version: 2.x (3.x quando estável)
last_updated: 2026-05-20
status: current
upstream: https://vitest.dev
repo: https://github.com/vitest-dev/vitest
---

# Vitest

Test runner Vite-native com API compatível com Jest. Adotado como runner único do projeto para unit, integration e component tests. Browser tests E2E ficam com Playwright (`@stacks/testing/playwright`).

Regras agnósticas de teste vivem em `@rules/testing`. Disciplinas de processo vivem em `@practices/tdd` e `@practices/bdd`. Este documento cobre apenas o manual operacional da ferramenta.

## Por que Vitest sobre Jest

- TypeScript e ESM nativos. Sem `ts-jest`, sem `babel-jest`, sem `experimental-vm-modules`.
- Reuso da pipeline Vite: o transformer já usado em dev de Next.js / Vite app é o mesmo do runner.
- Watch mode com HMR de testes: re-executa apenas os testes afetados pelo arquivo alterado.
- Performance superior em projetos médios e grandes via pools paralelos (`threads`, `forks`, `vmThreads`).
- API drop-in com Jest (`describe`, `it`, `expect`), facilitando migração e leitura por quem vem de Jest.

## Versionamento e pin

Pin via `package.json` com versão exata ou caret restrito:

```json
{
  "devDependencies": {
    "vitest": "2.1.9",
    "@vitest/coverage-v8": "2.1.9",
    "@vitest/ui": "2.1.9"
  }
}
```

Manter `vitest`, `@vitest/coverage-v8`, `@vitest/ui` e `@vitest/browser` sempre na mesma versão. Upgrade para 3.x somente após `latest` estável por pelo menos um ciclo e changelog revisado (mudanças notáveis em 3.x: novo workspace API, ajustes em snapshot serializers, defaults de pool).

## Setup

### Instalação base

```bash
pnpm add -D vitest @vitest/coverage-v8
```

### Configuração canônica

`vitest.config.ts` na raiz do pacote:

```ts
import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/*.{test,spec}.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.next/**'],
    setupFiles: ['./test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.{test,spec}.ts', 'src/**/types.ts'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
  },
})
```

Convenção do projeto: `globals: false`. Importar `describe`, `it`, `expect`, `vi` explicitamente de `vitest`. Mantém os testes auto-contidos e evita poluir o escopo global, ao custo de uma linha de import.

### Aliases

Resolva paths via `vite-tsconfig-paths` lendo o `tsconfig.json` do pacote. Não duplique aliases manualmente em `vitest.config.ts` — eles divergem e geram bugs sutis. Ver `@stacks/language/typescript@6`.

## Environments

| Environment | Quando usar | Custo |
|---|---|---|
| `node` (default) | Lógica pura, server actions, route handlers, integration com DB/Firestore. | Mínimo. |
| `happy-dom` | Component tests com React Testing Library. | Leve, ~2x mais rápido que jsdom na inicialização. |
| `jsdom` | Quando algum lib exige APIs DOM que `happy-dom` ainda não implementa (ex: certos polyfills de `Range`). | Maior, mas mais completo. |
| `edge-runtime` | Testar route handlers ou middleware que rodam em Next.js Edge runtime. | Médio. |

Default do projeto: `node`. Sobrescreva por arquivo com pragma:

```ts
// @vitest-environment happy-dom
```

Não defina `environment: 'jsdom'` global se a maioria dos testes é de lógica pura — o custo de inicialização do JSDOM por arquivo de teste pesa.

## API essencial

Suítes e casos:

```ts
import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest'

describe('userService', () => {
  beforeEach(() => { /* reset state */ })

  it('returns the user when id exists', async () => {
    const user = await getUser('u_1')
    expect(user).toMatchObject({ id: 'u_1' })
  })
})
```

Modificadores:

- `it.only` / `test.only` — foco local. Nunca commitado. Configure lint rule para barrar.
- `it.skip` — pular temporariamente. Sempre acompanhado de comentário explicando o motivo.
- `it.todo('descreve o teste futuro')` — placeholder reportado no output.
- `it.each([...])` — table-driven tests. Preferir sobre loops manuais.
- `it.concurrent` — paralelizar dentro de um `describe`. Cuidado com estado compartilhado.
- `it.sequential` — forçar ordem dentro de um `describe.concurrent`.

## Matchers

Built-in cobre a maioria dos casos. Atalhos mais usados:

- `toEqual` para deep equality estrutural; `toStrictEqual` para checar também tipo de propriedades undefined.
- `toMatchObject` para asserts parciais — preferível quando o objeto tem campos voláteis (timestamps).
- `toThrow` / `rejects.toThrow` para erros; sempre passar matcher (string, RegExp ou classe) para evitar falso positivo.
- `toBeCloseTo` para floats — nunca `toBe` em float.
- `toMatchInlineSnapshot` para snapshots curtos. Use `toMatchFileSnapshot` quando o output for grande e estável.

Extensões via `expect.extend` ficam em `test/setup.ts`. `@testing-library/jest-dom/vitest` já registra matchers como `toBeInTheDocument` quando importado no setup.

## Mocks

```ts
import { vi } from 'vitest'

// Spy em método existente
const spy = vi.spyOn(repo, 'findById').mockResolvedValue({ id: 'u_1' })

// Mock de módulo (hoisted automaticamente para o topo do arquivo)
vi.mock('./gateway', () => ({
  callExternal: vi.fn().mockResolvedValue({ ok: true }),
}))

// Variável usada dentro de vi.mock factory exige vi.hoisted
const { mockClient } = vi.hoisted(() => ({ mockClient: vi.fn() }))
vi.mock('./client', () => ({ client: mockClient }))

// Fake timers
vi.useFakeTimers()
vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
// ... assertion ...
vi.useRealTimers()
```

Regras operacionais:

- `vi.mock` é hoisted. Nunca coloque no meio do arquivo achando que executa naquela linha — sempre é movido para antes dos imports. Se precisar de referências externas no factory, use `vi.hoisted`.
- `vi.importActual` quando precisa mockar apenas uma parte do módulo mantendo o resto real.
- Sempre `vi.useRealTimers()` em `afterEach` quando usar fake timers. Timer leakage entre testes é um bug clássico.
- Reset de mocks: defina `clearMocks: true` (ou `mockReset: true`) no `test` da config para limpar entre testes. Decida por pacote e mantenha consistente.

Princípio: mock no limite do sistema (HTTP, FS, clock, IO externo), não no meio da lógica. Ver `@rules/testing`.

## Coverage

Provider default do projeto: `v8`. É mais rápido que `istanbul` e suficiente para a maioria dos casos. Use `istanbul` apenas se precisar de branch coverage mais preciso ou de instrumentação customizada.

```bash
pnpm vitest run --coverage
```

Thresholds são guard-rails, não meta. Cobertura alta sem assertions de comportamento é teatro. Coverage é referenciado em `@practices/tdd`.

## UI

```bash
pnpm add -D @vitest/ui
pnpm vitest --ui
```

Útil durante desenvolvimento local para inspeção visual da árvore de testes, diffs de snapshot e re-execução seletiva. Não usado em CI.

## Browser Mode

```bash
pnpm add -D @vitest/browser playwright
```

```ts
// vitest.config.ts
export default defineConfig({
  test: {
    browser: {
      enabled: true,
      name: 'chromium',
      provider: 'playwright',
      headless: true,
    },
  },
})
```

Use browser mode para component tests onde a precisão do DOM real importa (layout, eventos pointer, APIs Web reais como `IntersectionObserver`, `ResizeObserver`). Para o restante, `happy-dom` é mais rápido e suficiente.

Não confundir com E2E — browser mode roda componentes isolados. Fluxos end-to-end ficam em `@stacks/testing/playwright`.

## Workspaces (monorepos)

Para o monorepo do projeto, defina `vitest.workspace.ts` na raiz:

```ts
import { defineWorkspace } from 'vitest/config'

export default defineWorkspace([
  'packages/*/vitest.config.ts',
  'apps/*/vitest.config.ts',
])
```

Permite `pnpm vitest` na raiz executar todos os pacotes com seus envs independentes. Cada pacote mantém seu `vitest.config.ts` com `environment`, `setupFiles` e thresholds próprios.

## Integration tests

### Postgres

Use `testcontainers` para subir Postgres real (não mock). Ver `@stacks/database/postgres`.

```ts
import { PostgreSqlContainer } from '@testcontainers/postgresql'

let container: StartedPostgreSqlContainer

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16').start()
  process.env.DATABASE_URL = container.getConnectionUri()
  await runMigrations()
}, 60_000)

afterAll(async () => {
  await container.stop()
})
```

Timeout do hook deve cobrir o pull da imagem na primeira execução. Em CI, faça cache da imagem.

### Firebase

Firestore e Functions são testados contra o Firebase Emulator Suite, nunca contra projeto real. Ver `@stacks/backend/firebase-functions`. Iniciar emulador via `firebase emulators:exec "pnpm vitest run"` no script de CI.

## React Testing Library

```ts
// test/setup.ts
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => cleanup())
```

Config do pacote frontend:

```ts
test: {
  environment: 'happy-dom',
  setupFiles: ['./test/setup.ts'],
}
```

Ver `@stacks/frontend/react@19`. Princípio: testar o componente como o usuário interage (`getByRole`, `getByText`), nunca por classe CSS ou estrutura interna.

## Next.js 15

Server Actions e Route Handlers são funções TS comuns — importe e teste diretamente. Não tente subir o servidor Next dentro do Vitest.

```ts
import { POST } from '@/app/api/users/route'

it('returns 400 on invalid body', async () => {
  const req = new Request('http://localhost/api/users', {
    method: 'POST',
    body: JSON.stringify({}),
  })
  const res = await POST(req)
  expect(res.status).toBe(400)
})
```

Mocks frequentes de Next:

```ts
vi.mock('next/headers', () => ({
  cookies: () => ({ get: vi.fn().mockReturnValue({ value: 'token' }) }),
  headers: () => new Headers(),
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
  notFound: vi.fn(),
}))
```

Ver `@stacks/frontend/next@16`.

## Zod

Schemas são testados com `safeParse`, não `parse`. Asserções no `success: false` devem checar `error.issues[0].path` e `code`, não a mensagem (mensagens mudam entre versões do Zod).

```ts
import { UserSchema } from './schemas'

it('rejects email vazio', () => {
  const r = UserSchema.safeParse({ email: '' })
  expect(r.success).toBe(false)
  if (!r.success) {
    expect(r.error.issues[0].path).toEqual(['email'])
  }
})
```

Para coverage abrangente de inputs, use property-based testing com `fast-check`:

```ts
import fc from 'fast-check'

it('aceita qualquer email válido', () => {
  fc.assert(fc.property(fc.emailAddress(), (email) => {
    expect(UserSchema.safeParse({ email }).success).toBe(true)
  }))
})
```

Ver `@stacks/validation/zod@4`.

## Vercel AI SDK e agents

Testes de agents nunca chamam o modelo real. Use o `MockLanguageModelV1` exposto pelo `ai/test`:

```ts
import { MockLanguageModelV1 } from 'ai/test'

const model = new MockLanguageModelV1({
  doGenerate: async () => ({
    text: 'mocked',
    finishReason: 'stop',
    usage: { promptTokens: 1, completionTokens: 1 },
  }),
})
```

Ver `@stacks/ai/vercel-ai-sdk`. Testes que dependem de comportamento estocástico de modelo devem ser e2e separados, fora do pipeline regular.

## Snapshots

Use snapshots para output estável e pequeno (forma de erro normalizado, AST de query gerada, contrato de evento). Não use para:

- HTML completo de componente (volátil, ilegível em diff).
- JSON com timestamps, IDs gerados, ordem não-determinística.
- Output de logs.

Preferir `toMatchInlineSnapshot` sempre que o snapshot couber em ~10 linhas — fica junto do teste, sem arquivos `__snapshots__` órfãos.

## Watch mode e CI

```bash
pnpm vitest                     # watch local
pnpm vitest --changed origin/main  # apenas testes afetados (PR check rápido)
pnpm vitest run                 # one-shot (CI)
pnpm vitest run --coverage      # CI com coverage
pnpm vitest run --reporter=junit --outputFile=junit.xml  # report para CI
```

Em CI sempre `--run`. Watch em CI trava o pipeline.

## Reporters

- `default` — local.
- `verbose` — debugging de teste lento ou flaky.
- `json` — pós-processamento.
- `junit` — integração com GitHub Actions / GitLab CI / etc.
- `dot` — output compacto em CI ruidoso.

## Performance e pools

```ts
test: {
  pool: 'threads',          // default; bom para a maioria
  poolOptions: {
    threads: { singleThread: false, isolate: true },
  },
}
```

- `threads` — worker threads. Default. Mais rápido. Compatível com a maioria do código.
- `forks` — child processes. Necessário quando código usa APIs incompatíveis com worker threads (alguns native modules).
- `vmThreads` — isolamento via VM. Mais lento, raramente necessário.

`isolate: false` acelera bastante, mas só é seguro se nenhum teste polui estado global. Confirme antes de habilitar.

## Migração desde Jest

- `jest.fn` → `vi.fn`, `jest.mock` → `vi.mock`, `jest.spyOn` → `vi.spyOn`.
- `jest.useFakeTimers` → `vi.useFakeTimers`.
- `--globals` habilita API global se a migração ainda tem `describe` sem import — usar apenas como ponte temporária. Convergir para imports explícitos.
- `jest.config.js` é descartado; o equivalente é `vitest.config.ts`.
- Snapshots gerados pelo Jest geralmente são compatíveis, mas serializers customizados precisam ser portados.

## Anti-patterns

- Testes acoplados a implementação (snapshot do HTML de um componente inteiro, asserts em variáveis internas).
- Mock-heavy: stub de todas as dependências até o teste só validar que mocks foram chamados. Não testa comportamento.
- Snapshots gigantes ou voláteis aceitos com `-u` sem revisão.
- `it.only` ou `describe.only` commitado.
- `beforeAll` setando estado compartilhado entre testes que dependem da ordem de execução.
- Coverage % como meta sem assertions de comportamento.
- `vi.mock` em posição arbitrária do arquivo esperando que rode naquela ordem — sempre é hoisted.
- Fake timers ativos vazando para o próximo teste por falta de `useRealTimers` no `afterEach`.
- Testar contra serviços externos reais (API de produção, banco real, modelo real) no pipeline regular.

## Referências cruzadas

- `@rules/testing` — regras agnósticas de qualidade de teste.
- `@practices/tdd`, `@practices/bdd` — disciplinas temporais.
- `@stacks/language/typescript@6`, `@stacks/runtime/node@24`.
- `@stacks/frontend/react@19`, `@stacks/frontend/next@16`.
- `@stacks/validation/zod@4`.
- `@stacks/ai/vercel-ai-sdk`.
- `@stacks/backend/firebase-functions`.
- `@stacks/database/postgres`.
- `@stacks/testing/playwright` — E2E e component-in-browser pesado.

## Upstream

- Site: https://vitest.dev
- Repositório: https://github.com/vitest-dev/vitest
- Changelog: https://github.com/vitest-dev/vitest/releases
