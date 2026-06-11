---
title: Node.js
version: 24.x (LTS)
last_updated: 2026-05-20
status: current
upstream: https://nodejs.org/docs/latest-v24.x/api/
supersedes: node@20
---

# Node.js 24 LTS

Runtime JavaScript do projeto. Versão **24.x LTS** (linha "Jod"), ativa desde out/2024, em **Active LTS** até abr/2026 e em **Maintenance LTS** até **~abr/2027**. Substitui [node@20](./node@20.md), que entrou em EOL. Próximo salto planejado: Node 26 LTS quando estabilizar (previsão out/2026 → adotar após primeiro patch release).

> Single source of truth para qualquer ambiente que execute código JS/TS no projeto: Functions, scripts locais, CI, ferramentas de build, server runtime de Next.js. Versão é fixada em `.nvmrc`, `package.json#engines` e imagem base do Docker/CI.

## Por que Node 24 importa para o projeto

Node 24 colapsa várias dependências externas que existiam por necessidade no ecossistema Node 20 e anteriores. A política do projeto é **preferir built-in sobre userland** sempre que o built-in cobrir o caso de uso, tanto por bundle size quanto por superfície de segurança reduzida (ver [@rules/security](../../rules/security.md)).

A versão também viabiliza execução direta de TypeScript em scripts (`--experimental-strip-types` estabilizado), eliminando `tsx`/`ts-node` na maioria dos pontos onde só queremos rodar um `.ts` rapidamente.

## Features novas relevantes vs Node 20

### Native TypeScript via type stripping

Node 24 estabiliza o **type stripping** introduzido experimental em 22. Executa arquivos `.ts` diretamente, removendo anotações de tipo sem fazer type-check.

```bash
node script.ts                          # roda direto
node --experimental-strip-types app.ts  # equivalente (flag agora default-on em 24)
```

**Limitações** (não cobertas pelo strip-types — exigem transformação real, então usar `tsc`/bundler):

- `enum` (sintaxe não é só anotação)
- `namespace` com runtime code
- Decoradores legados (`experimentalDecorators`)
- Path aliases do `tsconfig` (resolução não acontece)
- JSX/TSX

**Onde aplicar:** scripts internos, ferramentas de migração, seeds, one-shots locais. **Onde NÃO aplicar:** build de produção (continua via `tsc --noEmit` para checagem + bundler para emissão). Ver [@stacks/language/typescript@6](../language/typescript@6.md).

Anti-pattern: manter `tsx`/`ts-node` como dependência só para rodar scripts simples — remover.

### `--run` estável

Executa scripts do `package.json` sem overhead do package manager.

```bash
node --run build       # ~5-10x mais rápido que `npm run build` para scripts curtos
node --run lint
```

**Onde aplicar:** CI, hooks de git, qualquer chamada de script onde o overhead do npm/pnpm domina o tempo total. **Limitação:** não suporta `pre`/`post` hooks; se o script depende deles, manter `npm run`/`pnpm`.

### `node --watch` estável

Substitui `nodemon` para a maioria dos casos.

```bash
node --watch server.ts
node --watch --watch-path=./src app.ts
```

Anti-pattern: manter `nodemon` quando `--watch` resolve.

### Permission Model estável

Sandbox built-in. Restringe FS/network/child_process explicitamente.

```bash
node --permission --allow-fs-read=./data --allow-net=api.example.com script.ts
```

**Onde aplicar (obrigatório):** scripts que executam código de terceiros, jobs de processamento de input não confiável, qualquer fluxo onde supply-chain attack é vetor. Ver [@rules/security](../../rules/security.md). **Onde aplicar (recomendado):** scripts de CI que tocam credenciais.

### WebSocket client built-in

```ts
const ws = new WebSocket('wss://example.com');
ws.addEventListener('message', (e) => console.log(e.data));
```

Anti-pattern: instalar `ws` quando só precisamos de client. Manter `ws` apenas para server-side WebSocket.

### `node:test` runner maduro

Test runner built-in com TAP output, watch, coverage, mocks.

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('soma', () => {
  assert.equal(1 + 1, 2);
});
```

```bash
node --test --experimental-test-coverage
```

**Política do projeto:** continuar usando Vitest para testes de aplicação (ergonomia superior, ecossistema). `node:test` é apropriado para **bibliotecas internas** publicadas onde queremos zero dependência de teste.

### Import attributes estáveis

```ts
import data from './config.json' with { type: 'json' };
```

Substitui `assert { type: 'json' }` (deprecado).

### `module.register` para custom loaders

API estável para loaders customizados, substituindo `--loader` (deprecado).

### V8 atualizado

V8 12.x → ganhos de performance em parsing/codegen. `structuredClone` agora suporta mais tipos (Error, DOMException compat). Não há ação requerida — apenas vem de graça no upgrade.

### `Intl` atualizado

CLDR mais recente, mais locales, melhorias em `Intl.Segmenter`, `Intl.DurationFormat`. Ver [@rules/internationalization](../../rules/internationalization.md).

### Top-level await e `import.meta`

Ambos estáveis desde antes mas reforçados como padrão:

```ts
// substitui __dirname/__filename em ESM
const here = import.meta.dirname;
const file = import.meta.filename;

// top-level await
const config = await loadConfig();
```

Anti-pattern: `fileURLToPath(import.meta.url)` + `path.dirname()` — use `import.meta.dirname` direto.

### Web APIs built-in (estáveis)

Todos disponíveis globalmente, sem import e sem polyfill:

- `fetch`, `Request`, `Response`, `Headers`
- `FormData`, `Blob`, `File`
- `crypto.randomUUID()`, `crypto.subtle`
- `structuredClone()`
- `URL`, `URLSearchParams`
- `AbortController`, `AbortSignal`
- `ReadableStream`, `WritableStream`, `TransformStream`
- `WebSocket` (cliente)
- `EventTarget`, `Event`, `CustomEvent`
- `performance.now()`, `performance.mark()`

Anti-patterns explícitos:

| Userland | Substituir por |
|---|---|
| `axios`, `node-fetch`, `got` | `fetch` global |
| `uuid` (v4) | `crypto.randomUUID()` |
| `dotenv` | `node --env-file=.env` |
| `nodemon` | `node --watch` |
| `tsx`, `ts-node` (scripts simples) | `node` direto (type stripping) |
| `ws` (client) | `WebSocket` global |
| `form-data` | `FormData` global |
| `node-cron` (simples) | `setInterval`/scheduler do Functions |

Manter userland apenas quando feature crítica não está coberta (ex: `axios` interceptors complexos, `ws` server, `tsx` para JSX/decorators).

### `node:sea` — Single Executable Apps

Empacotamento de app Node em binário único. Útil para CLIs internos distribuídos sem requerer Node instalado. Não usado em runtime de servidor.

## ESM como padrão

Todo código novo é ESM. Não há exceção. Ver [@rules/development](../../rules/development.md).

```jsonc
// package.json
{
  "type": "module",
  "engines": {
    "node": ">=24.0.0 <25"
  }
}
```

- Use `import`/`export`, nunca `require`/`module.exports`.
- Use `node:` specifier para módulos built-in: `import fs from 'node:fs/promises'` (não `import fs from 'fs/promises'`).
- Top-level await é permitido e encorajado em entry points.
- Use `import.meta.dirname` em vez de `__dirname`.

CommonJS legado é tolerado apenas em dependências de terceiros via interop.

## Diagnostics e observability

Built-in suficiente para a maioria dos casos:

```bash
node --inspect=0.0.0.0:9229 server.ts        # debugger
node --prof app.ts                            # V8 profiler (raw)
node --cpu-prof --cpu-prof-dir=./profiles    # CPU profile direto
node --heap-prof                              # heap profile
node --trace-warnings                         # stack em warnings
node --trace-uncaught                         # stack em uncaughtException
```

Para instrumentação programática:

- `node:diagnostics_channel` — pub/sub de eventos internos (HTTP, DNS, net, undici).
- `node:perf_hooks` — `PerformanceObserver`, marks, measures.
- OpenTelemetry: hooks built-in expostos para instrumentation libraries (sem flag).

Ver [@rules/performance](../../rules/performance.md) para quando profilar versus quando aceitar.

## Worker threads

`node:worker_threads` para trabalho CPU-bound. Não usar para I/O (event loop resolve). Não usar como substituto de fila — para workloads paralelos persistentes, ver arquitetura de jobs.

```ts
import { Worker } from 'node:worker_threads';
const worker = new Worker(new URL('./heavy.ts', import.meta.url));
```

## Versionamento e tooling

- `.nvmrc`: `24` (deixa nvm resolver para a patch mais recente da linha).
- `package.json#engines.node`: `">=24.0.0 <25"`.
- `volta` (se em uso): `"volta": { "node": "24.x.x" }`.
- CI: usar `actions/setup-node@v4` com `node-version-file: .nvmrc`.
- Docker: imagem base `node:24-alpine` (ou `node:24-slim` se nativos forem necessários).

## Integração com Firebase Functions

Firebase Functions runtime: **verificar disponibilidade de `nodejs24`** antes de deployar. Em maio/2026, o runtime suportado pode ainda ser `nodejs22`. Estratégia:

1. Se `nodejs24` disponível: setar `runtime: 'nodejs24'` em todas as functions.
2. Se ainda `nodejs22`: manter `nodejs22` em Functions, **mas usar Node 24 local** (compatibilidade forward é garantida para o subset que usamos). Migrar para `nodejs24` no primeiro release que o suportar.

Ver [@stacks/backend/firebase-functions](../backend/firebase-functions.md).

Anti-pattern crítico em Functions: **imports caros no top-level**. Inflam cold start. Mover imports pesados para dentro do handler ou usar dynamic `import()` sob demanda.

```ts
// ruim — cold start paga sempre
import { BigLib } from 'big-lib';
export const handler = (...) => { BigLib.do(); };

// bom — paga só quando usado
export const handler = async (...) => {
  const { BigLib } = await import('big-lib');
  BigLib.do();
};
```

## Integração com Next.js 16

Next.js 16 server runtime roda sobre Node 24. Nenhuma configuração especial — `package.json#engines.node` é fonte da verdade. Ver [@stacks/frontend/next@16](../frontend/next@16.md).

## Integração com TypeScript

- **Scripts e ferramentas internas:** rodar `.ts` direto via type stripping. Sem build step.
- **Build de produção:** continua via bundler / `tsc` para emissão. Type-check sempre via `tsc --noEmit` (strip-types não valida tipos).
- **`tsconfig` para código rodado direto:** `module: "nodenext"`, `moduleResolution: "nodenext"`, `target: "es2024"` ou superior.

Ver [@stacks/language/typescript@6](../language/typescript@6.md).

## Performance defaults

Raramente precisamos tunar. Defaults do Node 24 são bons. Casos onde mexer:

- `UV_THREADPOOL_SIZE=8` (default 4) — apenas se profiling mostrar saturação da threadpool (DNS, FS síncrono, crypto pesado). Não setar preventivamente.
- `--max-old-space-size=N` — apenas se OOM em workload conhecido. Em Functions, o runtime gerencia.
- GC flags (`--expose-gc`, `--gc-interval`) — não usar fora de debugging.

Ver [@rules/performance](../../rules/performance.md).

## Segurança

Política não-negociável: ver [@rules/security](../../rules/security.md). Pontos específicos de Node 24:

- **Permission Model** (`--permission`) em scripts que tocam credenciais ou processam input não confiável.
- **`--frozen-intrinsics`** em contextos sensíveis para impedir prototype pollution em runtime.
- **Supply chain:** auditar dependências, usar `npm audit signatures` / `pnpm audit`, fixar versões com lockfile, revisar transitivos novos. Preferir built-in (ver tabela de anti-patterns acima) reduz superfície.
- **Não executar `npm install` sem lockfile commitado.**

## Anti-patterns consolidados

1. Userland para o que built-in resolve (ver tabela acima).
2. `__dirname` / `__filename` em vez de `import.meta.dirname` / `import.meta.filename`.
3. `tsx` / `ts-node` para scripts que strip-types resolve.
4. Top-level imports caros em Firebase Functions (custo de cold start).
5. Bloquear o event loop (FS síncrono, loops longos, JSON gigante) — use `worker_threads` ou streaming.
6. Ignorar Permission Model em scripts sensíveis.
7. Specifier sem `node:` para built-ins (`import fs from 'fs'` em vez de `'node:fs'`).
8. CommonJS em código novo.
9. `dotenv` quando `--env-file=.env` resolve.
10. Fixar `node-version` em CI sem coerência com `.nvmrc`/`engines`.

## Roadmap Node 26 LTS

Node 26 entra em LTS em out/2026. Plano:

- Aguardar primeiro patch release (estabilidade) antes de adotar.
- Reavaliar features experimentais em 24 que estabilizam em 26 (`node:sqlite`, novos hooks, evolução do Permission Model).
- Atualizar este doc para `node@26.md` e mover este para `superseded`.
- Sincronizar com upgrade do runtime do Firebase Functions (geralmente atrasa 6-12 meses).

Não atualizar para Node 25 (linha "Current", não-LTS).
