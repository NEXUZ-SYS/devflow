---
title: Anthropic TypeScript SDK
package: "@anthropic-ai/sdk"
version: 0.30+ / 1.x
last_updated: 2026-05-20
status: stable
upstream: https://github.com/anthropics/anthropic-sdk-typescript
runtime: node | edge (parcial)
type: stack
category: ai
---

# Anthropic TypeScript SDK (`@anthropic-ai/sdk`)

SDK oficial TypeScript da Anthropic com cobertura completa da Messages API, Batches, Files, Token Counting e features beta (computer use, extended thinking avançado). Tipos first-class, helpers de streaming e retry automático com exponential backoff.

> Este documento descreve o **client TypeScript**. Para capacidades da API em si (modelos, message format, parameters, content blocks, tool use protocol), consulte `@stacks/ai/anthropic`.

---

## Quando usar este SDK vs alternativas

| Caso | Use |
|---|---|
| Fluxo padrão de geração no produto (chat, tools, structured output) | `@stacks/ai/vercel-ai-sdk` |
| Prompt caching com 4 breakpoints e controle granular | `@anthropic-ai/sdk` direto |
| Computer use (beta) | `@anthropic-ai/sdk` direto |
| Batches API (50% desconto, latência relaxada) | `@anthropic-ai/sdk` direto |
| Files API (upload de PDFs/imagens persistentes) | `@anthropic-ai/sdk` direto |
| Extended thinking com `budget_tokens` customizado e `thinking` blocks | `@anthropic-ai/sdk` direto |
| Bedrock | `@anthropic-ai/bedrock-sdk` |
| Vertex AI | `@anthropic-ai/vertex-sdk` |
| Cross-provider (OpenAI + Anthropic + Gemini no mesmo código) | `@stacks/ai/vercel-ai-sdk` |

**Regra padrão do projeto:** Vercel AI SDK como default. Caia para `@anthropic-ai/sdk` apenas quando precisar de algo que o AI SDK não expõe nativamente (e documente em um ADR — `@decisions`).

---

## Instalação

```bash
pnpm add @anthropic-ai/sdk
# variantes
pnpm add @anthropic-ai/bedrock-sdk
pnpm add @anthropic-ai/vertex-sdk
```

Pinning recomendado no `package.json` (versões 0.x/1.x ainda podem ter breaking changes em minor):

```json
{
  "dependencies": {
    "@anthropic-ai/sdk": "1.2.3"
  }
}
```

Não use `^` em produção até a linha estabilizar plenamente em 1.x. Veja `@processes/dependencies`.

---

## Instanciação

### Direct API

```ts
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY, // lido automaticamente se omitido
  maxRetries: 2,                          // default: 2
  timeout: 60_000,                        // ms
});
```

### Bedrock

```ts
import AnthropicBedrock from "@anthropic-ai/bedrock-sdk";

const client = new AnthropicBedrock({
  awsRegion: "us-east-1",
  // credenciais via AWS default chain (env, profile, role IRSA, etc.)
});
```

### Vertex AI

```ts
import AnthropicVertex from "@anthropic-ai/vertex-sdk";

const client = new AnthropicVertex({
  projectId: process.env.GCP_PROJECT_ID,
  region: "us-east5",
  // ADC via google-auth-library (env GOOGLE_APPLICATION_CREDENTIALS ou metadata server)
});
```

> **Nunca** instancie no client browser. `apiKey` em bundle público é vazamento crítico. Veja `@rules/security`.

---

## Surface do client

### `client.messages.create`

```ts
const message = await client.messages.create({
  model: "claude-opus-4-7",
  max_tokens: 1024,                     // OBRIGATÓRIO; não há default
  system: "You are a helpful assistant",
  messages: [{ role: "user", content: "Hi" }],
  tools: [...],
  tool_choice: { type: "auto" },
  temperature: 1,
  stop_sequences: [],
  metadata: { user_id: "..." },
});
```

### `client.messages.stream` (helper)

Wrapper acima de SSE com event emitter + AsyncIterable. **Use sempre que houver UX humana** — UX percebida é dominada por TTFB.

```ts
const stream = client.messages
  .stream({
    model: "claude-opus-4-7",
    max_tokens: 4096,
    messages,
  })
  .on("text", (delta) => process.stdout.write(delta))
  .on("contentBlock", (block) => {
    if (block.type === "tool_use") handleToolUse(block);
  })
  .on("thinking", (delta) => logThinking(delta))
  .on("message", (msg) => persist(msg))
  .on("error", (err) => report(err))
  .on("finalMessage", (msg) => finalize(msg));

const final = await stream.finalMessage();
```

Também consumível como AsyncIterable de `MessageStreamEvent`:

```ts
for await (const event of stream) {
  if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
    process.stdout.write(event.delta.text);
  }
}
```

### `client.messages.countTokens`

Pré-validação de tamanho antes de pagar pela request:

```ts
const { input_tokens } = await client.messages.countTokens({
  model: "claude-opus-4-7",
  messages,
  system,
  tools,
});
if (input_tokens > BUDGET) throw new BudgetExceeded();
```

### `client.messages.batches.*`

Batches API (50% de desconto, processamento até 24h):

```ts
const batch = await client.messages.batches.create({
  requests: items.map((it, i) => ({
    custom_id: `req-${i}`,
    params: {
      model: "claude-opus-4-7",
      max_tokens: 1024,
      messages: [{ role: "user", content: it.prompt }],
    },
  })),
});

const status = await client.messages.batches.retrieve(batch.id);
const list   = await client.messages.batches.list();
await client.messages.batches.cancel(batch.id);

// streaming dos resultados (JSONL)
for await (const result of await client.messages.batches.results(batch.id)) {
  if (result.result.type === "succeeded") persist(result);
}
```

### `client.files.*` / `client.beta.files.*`

Upload persistente (PDFs, imagens) reutilizável entre requests, reduz repagamento de bytes:

```ts
const file = await client.beta.files.upload({
  file: fs.createReadStream("./contract.pdf"),
});

await client.messages.create({
  model: "claude-opus-4-7",
  max_tokens: 1024,
  messages: [{
    role: "user",
    content: [
      { type: "document", source: { type: "file", file_id: file.id } },
      { type: "text", text: "Resuma este contrato em 5 bullets" },
    ],
  }],
});
```

### `client.beta.*`

Features ainda em beta (computer use, novos tipos de content). Equivalente a passar `anthropic-beta` em header, mas com tipos atualizados.

```ts
const message = await client.beta.messages.create({
  model: "claude-opus-4-7",
  max_tokens: 1024,
  betas: ["computer-use-2024-10-22"],
  tools: [{ type: "computer_20241022", name: "computer", display_width_px: 1024, display_height_px: 768 }],
  messages: [...],
});
```

---

## Tipos relevantes (TypeScript first)

Veja `@stacks/language/typescript@6`. Tipos exportados que você usará:

```ts
import type {
  Message,
  MessageParam,
  MessageStreamEvent,
  ContentBlock,
  TextBlock,
  ToolUseBlock,
  ToolResultBlockParam,
  ThinkingBlock,
  Tool,
  ToolChoice,
  Usage,
  StopReason,
} from "@anthropic-ai/sdk/resources/messages";
```

Nunca declare seus próprios shapes paralelos dos blocks da API — use os exportados.

---

## Idioms recomendados

### 1. Prompt caching com `cache_control`

Coloque blocks estáveis e grandes antes dos voláteis. Marque o último com `cache_control`:

```ts
await client.messages.create({
  model: "claude-opus-4-7",
  max_tokens: 1024,
  system: [
    { type: "text", text: SYSTEM_PROMPT_LONGO },
    { type: "text", text: TOOLS_DESCRIPTION, cache_control: { type: "ephemeral" } },
  ],
  tools,
  messages,
});
```

Inspecione `message.usage.cache_creation_input_tokens` e `cache_read_input_tokens` para validar hit rate. Veja `@rules/caching`.

### 2. Tools com schema derivado de Zod 4

Veja `@stacks/validation/zod@4`:

```ts
import { z, toJSONSchema } from "zod";

const SearchInput = z.object({
  query: z.string(),
  limit: z.number().int().min(1).max(50).default(10),
});

const tools: Tool[] = [{
  name: "search",
  description: "Search the catalog",
  input_schema: toJSONSchema(SearchInput) as Tool["input_schema"],
}];
```

Nunca declare `input_schema` com `any` ou hardcoded fora do source-of-truth do Zod schema.

### 3. Structured output forçado via `tool_choice`

```ts
const Result = z.object({ sentiment: z.enum(["pos", "neg", "neu"]), score: z.number() });

const message = await client.messages.create({
  model: "claude-opus-4-7",
  max_tokens: 256,
  tools: [{ name: "emit_result", description: "Emit the result", input_schema: toJSONSchema(Result) }],
  tool_choice: { type: "tool", name: "emit_result" },
  messages,
});

const block = message.content.find((b): b is ToolUseBlock => b.type === "tool_use");
const parsed = Result.parse(block?.input);
```

### 4. Cancelamento via `AbortSignal`

Obrigatório em qualquer stream com vida ligada à UX (request HTTP, websocket):

```ts
const controller = new AbortController();
req.on("close", () => controller.abort());

const stream = client.messages.stream(
  { model, max_tokens, messages },
  { signal: controller.signal },
);
```

Sem isso, stream continua consumindo tokens depois que o cliente desconectou.

### 5. Beta headers via `extra_headers`

Quando o SDK ainda não cobre uma feature beta via `client.beta`:

```ts
await client.messages.create(
  { model, max_tokens, messages },
  { headers: { "anthropic-beta": "feature-name-yyyy-mm-dd" } },
);
```

### 6. Inspecionar `stop_reason`

Sempre. Corte silencioso é a fonte #1 de bug invisível:

```ts
if (message.stop_reason === "max_tokens") {
  // resposta truncada — retry com max_tokens maior ou continuação
}
if (message.stop_reason === "tool_use") {
  // executar tool, devolver tool_result e continuar
}
```

---

## Retry e timeouts

SDK tem retry automático com exponential backoff em:

- `408 Request Timeout`
- `409 Conflict`
- `429 Too Many Requests`
- `5xx`

Configurável:

```ts
new Anthropic({
  maxRetries: 4,         // default 2
  timeout: 120_000,      // default 10 min em stream, 60s em sync
});
```

Para `529 Overloaded`, o SDK também retenta. Customize com cuidado — retry agressivo em peak amplifica overload. Veja `@rules/error-handling`.

---

## Errors

```ts
import Anthropic from "@anthropic-ai/sdk";

try {
  await client.messages.create({ ... });
} catch (err) {
  if (err instanceof Anthropic.APIError) {
    err.status;          // 401, 429, 529, ...
    err.headers;
    err.error;
  }
  if (err instanceof Anthropic.AuthenticationError) { /* 401 */ }
  if (err instanceof Anthropic.RateLimitError)     { /* 429 */ }
  if (err instanceof Anthropic.BadRequestError)    { /* 400 */ }
  if (err instanceof Anthropic.PermissionDeniedError) { /* 403 */ }
  if (err instanceof Anthropic.NotFoundError)      { /* 404 */ }
  if (err instanceof Anthropic.UnprocessableEntityError) { /* 422 */ }
  if (err instanceof Anthropic.InternalServerError) { /* 5xx */ }
  throw err;
}
```

Não confunda `APIError` (resposta HTTP da API) com `APIConnectionError` (rede, DNS, TLS). O primeiro tem `status`; o segundo é wrap de erro de transporte.

---

## Auth

| Variante | Mecanismo | Onde |
|---|---|---|
| Direct | `ANTHROPIC_API_KEY` (env) ou `{ apiKey }` no constructor | server-side only |
| Bedrock | AWS default credential chain (env, profile, IRSA, IMDS) | server-side only |
| Vertex | ADC (`GOOGLE_APPLICATION_CREDENTIALS` ou metadata server) | server-side only |

Em Next.js use **Route Handlers** ou **Server Actions** apenas (veja `@stacks/frontend/next@16`). Nunca em Client Components, nunca em edge runtime se o secret store for incompatível.

Para gerenciamento e rotação de secrets, veja `@rules/security`.

---

## Integração com Next.js 16

Veja `@stacks/frontend/next@16`. Pattern padrão de streaming em Route Handler:

```ts
// app/api/chat/route.ts
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs"; // algumas features (files, retries) preferem node runtime

const client = new Anthropic();

export async function POST(req: Request) {
  const { messages } = await req.json();
  const controller = new AbortController();
  req.signal.addEventListener("abort", () => controller.abort());

  const stream = client.messages.stream(
    { model: "claude-opus-4-7", max_tokens: 4096, messages },
    { signal: controller.signal },
  );

  return new Response(stream.toReadableStream(), {
    headers: { "Content-Type": "text/event-stream" },
  });
}
```

Para UI streaming (RSC + `useChat` pattern), prefira `@stacks/ai/vercel-ai-sdk`.

---

## Observabilidade

Veja `@rules/observability`. Wrap toda chamada em span OpenTelemetry com atributos `gen_ai.*`:

```ts
await tracer.startActiveSpan("anthropic.messages.create", async (span) => {
  span.setAttributes({
    "gen_ai.system": "anthropic",
    "gen_ai.request.model": model,
    "gen_ai.request.max_tokens": max_tokens,
  });
  const msg = await client.messages.create({ model, max_tokens, messages });
  span.setAttributes({
    "gen_ai.response.id": msg.id,
    "gen_ai.response.finish_reason": msg.stop_reason ?? "unknown",
    "gen_ai.usage.input_tokens": msg.usage.input_tokens,
    "gen_ai.usage.output_tokens": msg.usage.output_tokens,
    "gen_ai.usage.cache_read_input_tokens": msg.usage.cache_read_input_tokens ?? 0,
    "gen_ai.usage.cache_creation_input_tokens": msg.usage.cache_creation_input_tokens ?? 0,
  });
  span.end();
  return msg;
});
```

Nunca logue `messages[].content` cru em produção — risco de PII. Veja `@rules/security`.

---

## Pitfalls específicos da versão atual

- **`max_tokens` é obrigatório.** Não há default. Esquecer = `400`.
- **`thinking` content blocks** chegam antes do `text` quando extended thinking está habilitado — seu loop de eventos precisa tratá-los explicitamente ou ignorá-los, nunca renderizar como resposta final.
- **`cache_control` é por block**, não por request. Você marca o último block que deve ser cacheado e tudo antes dele entra no cache. Limite atual: 4 breakpoints.
- **Bedrock e Vertex usam IDs de modelo diferentes** do direct API (`anthropic.claude-opus-4-7-v1:0` vs `claude-opus-4-7`). Não compartilhe constantes entre variantes.
- **`countTokens` cobra tokens?** Não — endpoint gratuito, mas faz roundtrip; cacheie resultado se o input for estável.
- **Stream `error` event** não rejeita a Promise automaticamente em todos os caminhos. Sempre adicione `.on("error", ...)` explicitamente.
- **`finalMessage()` joga** se houve erro durante o stream — envolva em try/catch.
- **Edge runtime** não suporta todos os helpers (uploads de arquivo, alguns retries). Use Node runtime quando em dúvida.

---

## Anti-patterns

- `apiKey` em qualquer bundle client-side. Catástrofe. Veja `@rules/security`.
- Misturar `@anthropic-ai/sdk` e `@ai-sdk/anthropic` no mesmo fluxo sem justificativa em ADR.
- Ignorar `cache_control` em prompts grandes reutilizados (queima de orçamento).
- Tools com `input_schema: { type: "object" }` solto, sem properties, ou tipado como `any`.
- Stream sem `AbortSignal` ligado ao request lifecycle (request hang após disconnect).
- Logar `messages` cru com PII em qualquer sink (APM, logs, traces).
- Acoplar a `@anthropic-ai/bedrock-sdk` quando o direct API resolve, criando lock-in sem motivo.
- Esquecer `max_tokens` (400 garantido).
- Não checar `stop_reason` (truncamento silencioso).
- Declarar tipos paralelos aos do SDK (`MyMessage`, `MyContentBlock`) em vez de importar.
- Retry manual em loop por cima do retry interno do SDK (duplica tentativas, amplifica 429).
- `temperature` e `top_p` juntos (use um ou outro).
- `client` instanciado dentro do handler em hot path (sem reuso de keep-alive HTTP). Crie no module scope.

---

## Referências cruzadas

- `@stacks/ai/anthropic` — Messages API em si (formato, modelos, capabilities).
- `@stacks/ai/vercel-ai-sdk` — alternativa cross-provider, padrão do projeto.
- `@stacks/validation/zod@4` — schemas para `input_schema` de tools e parse de outputs.
- `@stacks/language/typescript@6` — convenções TS aplicadas ao uso do SDK.
- `@stacks/frontend/next@16` — integração com Route Handlers e Server Actions.
- `@rules/security` — manuseio de `apiKey`, secrets, PII em logs.
- `@rules/caching` — uso correto de `cache_control` e medição de hit rate.
- `@rules/observability` — atributos `gen_ai.*`, spans, métricas de uso.
- `@rules/error-handling` — retries, backoff, classificação de erros, 529 overload.
