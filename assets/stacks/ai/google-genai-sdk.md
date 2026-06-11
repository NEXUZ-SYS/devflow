---
title: Google Gen AI SDK (@google/genai)
package: "@google/genai"
version: latest
last_updated: 2026-05-20
status: current
upstream:
  - https://github.com/googleapis/js-genai
  - https://ai.google.dev/gemini-api/docs/sdks
supersedes:
  - "@google/generative-ai (deprecado, modo manutenção)"
  - "@google-cloud/vertexai (legado)"
---

# Google Gen AI SDK — `@google/genai`

SDK TypeScript oficial unificado do Google para a Gemini API. Substitui simultaneamente `@google/generative-ai` (AI Studio) e `@google-cloud/vertexai` (Vertex AI legado), expondo a mesma surface de código para os dois backends via uma flag de construtor.

Este documento cobre **o SDK em si**: instalação, instanciação, organização de módulos, idioms e armadilhas. Para capacidades da Gemini API como produto (modelos, multimodal, thinking, function calling semântico, limites, pricing), consulte `@stacks/ai/gemini`.

---

## O que é

- SDK TS/JS first-class para Gemini API, modelos Imagen, Veo e Live API.
- **Dois backends, uma API**:
  - **Google AI Studio** (consumer/dev): autenticação por API key.
  - **Vertex AI** (enterprise/GCP): autenticação via Application Default Credentials (ADC), `project` e `location` obrigatórios.
- Surface de código idêntica nos dois — alterna-se pela flag `vertexai: true | false`.
- Tipos derivados de protobuf; cobertura completa de `Content`, `Part`, `GenerateContentResponse`, `Tool`, `Schema`, `ThinkingConfig`, etc.

---

## Migração a partir de `@google/generative-ai`

O pacote `@google/generative-ai` está em **modo manutenção**. Código novo deve usar `@google/genai`.

| Antes (`@google/generative-ai`)                              | Agora (`@google/genai`)                                       |
| ------------------------------------------------------------ | ------------------------------------------------------------- |
| `new GoogleGenerativeAI(apiKey)`                             | `new GoogleGenAI({ apiKey })`                                 |
| `genAI.getGenerativeModel({ model }).generateContent(...)`   | `ai.models.generateContent({ model, contents, config })`      |
| `.generateContentStream(...)` no model                       | `ai.models.generateContentStream({ ... })`                    |
| `model.startChat({ history })`                               | `ai.chats.create({ model, history, config })`                 |
| `chat.sendMessage(msg)`                                      | `chat.sendMessage(msg)` (a sessão é stateful como antes)      |
| `GoogleAIFileManager` em pacote separado                     | `ai.files.upload / get / list / delete`                       |
| Sem suporte unificado a Vertex                               | `new GoogleGenAI({ vertexai: true, project, location })`      |

A diferença estrutural mais importante: **não existe mais o conceito de "model instance" cacheado** — o `model` é um parâmetro por chamada, e os módulos (`ai.models`, `ai.chats`, `ai.files`, etc.) espelham a API REST.

---

## Instalação

```bash
pnpm add @google/genai
```

Requer Node 20+ (referencie `@stacks/runtime/node@24`) e TypeScript 5.4+ (referencie `@stacks/language/typescript@6`).

---

## Instanciação

### AI Studio (API key)

```ts
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY!,
});
```

O SDK também aceita `GOOGLE_API_KEY` como fallback. **Nunca** instanciar com API key em código de cliente — sempre Route Handler ou Server Action (referencie `@rules/security`).

### Vertex AI (ADC)

```ts
const ai = new GoogleGenAI({
  vertexai: true,
  project: process.env.GOOGLE_CLOUD_PROJECT!,
  location: 'us-central1',
});
```

Autenticação via Application Default Credentials:

- Local: `GOOGLE_APPLICATION_CREDENTIALS` apontando para JSON de service account, ou `gcloud auth application-default login`.
- Em GCP (Cloud Run, GCE, GKE, Cloud Functions): metadata server, sem configuração extra.

`location` deve ser uma região suportada (`us-central1`, `europe-west4`, `asia-northeast1`, etc.). Pinar a região é obrigatório — não há "global" para Vertex Gemini.

---

## Organização de módulos

A API do client espelha a API REST do Google. Para semântica de cada operação (parâmetros do modelo, limites, multimodal), consulte `@stacks/ai/gemini`.

### `ai.models`

Operações stateless contra um modelo.

```ts
const res = await ai.models.generateContent({
  model: 'gemini-2.5-pro',
  contents: 'Resuma em uma frase: ...',
  config: {
    temperature: 0.2,
    maxOutputTokens: 256,
    systemInstruction: 'Você é um assistente conciso.',
  },
});
console.log(res.text);
```

Streaming via `AsyncIterable`:

```ts
const stream = await ai.models.generateContentStream({
  model: 'gemini-2.5-flash',
  contents: prompt,
});
for await (const chunk of stream) {
  process.stdout.write(chunk.text ?? '');
}
```

Embeddings:

```ts
const emb = await ai.models.embedContent({
  model: 'text-embedding-004',
  contents: ['frase A', 'frase B'],
});
```

### `ai.chats`

Sessão stateful com histórico mantido pelo SDK.

```ts
const chat = ai.chats.create({
  model: 'gemini-2.5-pro',
  history: [],
  config: { temperature: 0.7 },
});

const r1 = await chat.sendMessage({ message: 'Olá' });
const r2 = await chat.sendMessage({ message: 'E daí?' });

// Streaming
for await (const chunk of await chat.sendMessageStream({ message: '...' })) {
  // ...
}
```

### `ai.files`

Upload de arquivos para reuso entre chamadas. Use para inputs >20MB ou quando o mesmo arquivo é referenciado várias vezes.

```ts
const uploaded = await ai.files.upload({
  file: '/path/to/video.mp4',
  config: { mimeType: 'video/mp4' },
});

await ai.models.generateContent({
  model: 'gemini-2.5-pro',
  contents: [
    { fileData: { fileUri: uploaded.uri!, mimeType: uploaded.mimeType! } },
    'Descreva o vídeo.',
  ],
});

await ai.files.delete({ name: uploaded.name! });
```

### `ai.caches`

Context caching explícito (referencie `@stacks/ai/gemini` para semântica e pricing).

```ts
const cache = await ai.caches.create({
  model: 'gemini-2.5-pro',
  config: {
    contents: largeContext,
    systemInstruction: '...',
    ttl: '3600s',
  },
});

await ai.models.generateContent({
  model: 'gemini-2.5-pro',
  contents: 'Pergunta sobre o contexto cacheado',
  config: { cachedContent: cache.name },
});
```

### `ai.batches`

Inferência assíncrona em lote (Vertex). `create`, `get`, `list`, `cancel`, `delete`.

### `ai.tunings`

Jobs de fine-tuning supervisionado. Operações long-running — combine com `ai.operations`.

### `ai.live`

Live API: sessão WebSocket bidirecional com áudio/vídeo de entrada e áudio/texto de saída.

```ts
const session = await ai.live.connect({
  model: 'gemini-2.0-flash-live',
  config: { responseModalities: ['AUDIO'] },
  callbacks: {
    onmessage: (msg) => { /* LiveServerMessage */ },
    onerror: (err) => { /* ... */ },
    onclose: () => { /* ... */ },
  },
});

await session.sendClientContent({ turns: '...' });
```

**Live API exige Node runtime** — não funciona em edge runtime de Next.js (referencie `@stacks/frontend/next@16`).

### `ai.operations`

Polling/wait para long-running operations (Veo, Imagen async, tuning jobs).

```ts
let op = await ai.models.generateVideos({ model: 'veo-2.0', prompt: '...' });
while (!op.done) {
  await new Promise((r) => setTimeout(r, 5000));
  op = await ai.operations.getVideosOperation({ operation: op });
}
```

---

## Tipos oficiais

O SDK exporta tipos para todos os shapes da API. Sempre use-os em vez de `any`:

```ts
import type {
  Content,
  Part,
  GenerateContentResponse,
  GenerationConfig,
  SafetySetting,
  Tool,
  FunctionDeclaration,
  Schema,
  ThinkingConfig,
  CachedContent,
  LiveServerMessage,
} from '@google/genai';
```

`Schema` é um subset de JSON Schema. Para gerar `Schema` a partir de Zod, use o adapter do Vercel AI SDK (`@ai-sdk/google`) — não há conversor Zod→Schema embutido no `@google/genai` (referencie `@stacks/validation/zod@4`).

---

## Idioms recomendados

### `config` como objeto único

Toda configuração de geração vai dentro de `config`, não espalhada:

```ts
await ai.models.generateContent({
  model: 'gemini-2.5-pro',
  contents,
  config: {
    temperature: 0.4,
    topP: 0.95,
    topK: 40,
    maxOutputTokens: 2048,
    responseMimeType: 'application/json',
    responseSchema: outputSchema,
    systemInstruction: 'Você é um classificador estrito.',
    tools: [{ functionDeclarations: [...] }],
    toolConfig: { functionCallingConfig: { mode: 'ANY' } },
    safetySettings: [...],
    thinkingConfig: { thinkingBudget: 1024 },
    seed: 42,
    abortSignal: controller.signal,
  },
});
```

### Helpers para multimodal

```ts
import { createPartFromUri, createPartFromBase64, createUserContent } from '@google/genai';

const content = createUserContent([
  'Descreva a imagem:',
  createPartFromUri('gs://bucket/img.png', 'image/png'),
]);
```

### Function calling

Declare tools com `FunctionDeclaration`. O `parameters` é `Schema` (JSON Schema):

```ts
const getWeather: FunctionDeclaration = {
  name: 'getWeather',
  description: 'Retorna previsão do tempo para uma cidade.',
  parameters: {
    type: 'OBJECT',
    properties: {
      city: { type: 'STRING' },
      unit: { type: 'STRING', enum: ['C', 'F'] },
    },
    required: ['city'],
  },
};
```

### Cancelamento

`AbortSignal` em `config.abortSignal`:

```ts
const controller = new AbortController();
setTimeout(() => controller.abort(), 10_000);

await ai.models.generateContent({
  model: 'gemini-2.5-flash',
  contents,
  config: { abortSignal: controller.signal },
});
```

---

## Quando usar `@google/genai` direto vs Vercel AI SDK

A regra default do stack é **Vercel AI SDK** (`@ai-sdk/google` ou `@ai-sdk/google-vertex`) — referencie `@stacks/ai/vercel-ai-sdk`. Ele oferece:

- Cross-provider (trocar para Anthropic/OpenAI sem reescrever).
- `generateObject`/`streamObject` com Zod nativo.
- Tool use unificado.
- UI streaming React (`useChat`, `useCompletion`).

**Use `@google/genai` diretamente quando precisar de:**

- **Live API** (WebSocket bidirectional com áudio/vídeo) — não exposta no AI SDK.
- **Files API** (upload reusável, suporte a vídeo longo, audio longo).
- **Context caching explícito** com controle de TTL e reuso entre chamadas.
- **Batch jobs** (`ai.batches`).
- **Fine-tuning** (`ai.tunings`).
- **Long-running operations** (Veo, Imagen async).
- Features Vertex-only não expostas no adapter (custom controlled generation avançado, modelos Vertex-specific).

Para chat/completion/tool use comum, **Vercel AI SDK é a primeira escolha**. Não misture os dois no mesmo fluxo sem motivo concreto.

---

## Integração com Next.js 15

Referencie `@stacks/frontend/next@16`.

- **Route Handler** (App Router) para streaming HTTP:
  ```ts
  // app/api/generate/route.ts
  export async function POST(req: Request) {
    const { prompt } = await req.json();
    const stream = await ai.models.generateContentStream({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    const encoder = new TextEncoder();
    const body = new ReadableStream({
      async start(controller) {
        for await (const chunk of stream) {
          controller.enqueue(encoder.encode(chunk.text ?? ''));
        }
        controller.close();
      },
    });
    return new Response(body, { headers: { 'Content-Type': 'text/plain' } });
  }
  ```
- **Server Actions** para chamadas non-streaming.
- **Edge runtime**: `ai.models.generateContent` e streaming funcionam, mas `ai.live` **não** — Live API exige `runtime = 'nodejs'`.
- **API keys em client**: proibido. Toda chamada origina-se de server.

---

## Auth — detalhes operacionais

| Backend     | Variáveis aceitas                                | Notas                                                                 |
| ----------- | ------------------------------------------------ | --------------------------------------------------------------------- |
| AI Studio   | `GEMINI_API_KEY` ou `GOOGLE_API_KEY`             | Quota e billing via Google AI Studio.                                 |
| Vertex AI   | `GOOGLE_APPLICATION_CREDENTIALS` + `project`     | ADC obrigatório. Quota e billing via projeto GCP.                     |
| Vertex (GCP runtime) | metadata server                          | Sem env vars; service account do compute resource.                    |

**Não misturar quotas**: se você está rodando em GCP e esquece `vertexai: true`, o SDK cai para AI Studio e consome a quota errada — provavelmente sem a API key configurada, resultando em erro silencioso ou falha de auth.

---

## Erros

O SDK propaga erros HTTP com status e detalhes. Não há retry automático universal — implemente backoff explícito para 429 e 5xx (referencie `@rules/error-handling`).

```ts
try {
  await ai.models.generateContent({ ... });
} catch (err) {
  // Erros expõem .status, .message, .statusText
  // Trate 429 (rate limit), 503 (overloaded), 400 (safety block), 401/403 (auth)
}
```

Bloqueios por safety chegam como `400` com `promptFeedback.blockReason` no payload, **não** como exception — sempre cheque `response.promptFeedback` e `response.candidates[0]?.finishReason`.

---

## Observabilidade

Referencie `@rules/observability`. Envolva chamadas em spans OpenTelemetry com convenções `gen_ai`:

```ts
const span = tracer.startSpan('gen_ai.generate_content', {
  attributes: {
    'gen_ai.system': 'gemini',
    'gen_ai.request.model': 'gemini-2.5-pro',
    'gen_ai.request.temperature': 0.4,
  },
});
// ...
span.setAttributes({
  'gen_ai.usage.input_tokens': res.usageMetadata?.promptTokenCount,
  'gen_ai.usage.output_tokens': res.usageMetadata?.candidatesTokenCount,
});
span.end();
```

`response.usageMetadata` traz `promptTokenCount`, `candidatesTokenCount`, `totalTokenCount`, `cachedContentTokenCount` e `thoughtsTokenCount` (quando thinking ativo).

---

## Anti-patterns

- **Manter código novo em `@google/generative-ai`** — deprecado; migre.
- **Misturar `@google/genai` e Vercel AI SDK no mesmo fluxo** sem motivo (escolha um por fluxo).
- **`apiKey` em código de cliente** — catástrofe de segurança (referencie `@rules/security`).
- **Inline base64 para arquivos grandes** (>20MB) — use Files API.
- **`ai.live` em edge runtime** — exige Node runtime.
- **Caches sem TTL adequado** — custos acumulam, mesmo cache ocioso.
- **Esquecer `vertexai: true`** em ambiente Vertex — consome quota AI Studio errada.
- **Tipos `any` em `parts`/`contents`** — o SDK fornece tipos completos; use-os.
- **Cachear o `GoogleGenAI` instance como singleton com API key vazia** em runtime edge antes da env estar disponível — instancie por request ou em módulo top-level após `process.env` estar populado.
- **Retry automático presumido** — não existe universal; implemente para 429/5xx.

---

## Referências cruzadas

- `@stacks/ai/gemini` — capacidades da Gemini API (modelos, multimodal, thinking, function calling).
- `@stacks/ai/vercel-ai-sdk` — wrapper cross-provider; default para chat/completion comum.
- `@stacks/validation/zod@4` — geração de schemas para structured output (via AI SDK adapter).
- `@stacks/language/typescript@6` — tipos TS first-class.
- `@stacks/runtime/node@24` — runtime mínimo.
- `@stacks/frontend/next@16` — Route Handlers, Server Actions, runtimes.
- `@rules/security` — API keys nunca em client.
- `@rules/observability` — spans OpenTelemetry e atributos `gen_ai.*`.
- `@rules/error-handling` — backoff para 429/5xx, tratamento de safety blocks.

---

## Upstream

- Repositório: https://github.com/googleapis/js-genai
- Documentação: https://ai.google.dev/gemini-api/docs/sdks
- Reference Vertex: https://cloud.google.com/vertex-ai/generative-ai/docs/sdks/overview
