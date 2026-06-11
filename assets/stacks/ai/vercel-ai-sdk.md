---
title: Vercel AI SDK
version: 4.x
last_updated: 2026-05-20
status: current
upstream: https://ai-sdk.dev
repository: https://github.com/vercel/ai
---

# Vercel AI SDK

Camada de abstração de IA do projeto. Padroniza chamadas a LLMs entre provedores, estrutura saídas via Zod, habilita tool use cross-provider e fornece hooks React para streaming de UI. É a **primitiva de baixo nível** em cima da qual orquestramos agents — para fluxos compostos (workflows, memory, eval, RAG) ver `@stacks/ai/mastra-sdk`, que usa o AI SDK por baixo.

## Versão fixada

Usamos a **linha 4.x** (lançada nov/2024). Mudanças relevantes vs 3.x:

- `streamText`/`generateText` com superfície simplificada.
- Provider packages **obrigatoriamente separados** (`@ai-sdk/openai`, etc.) — não mais re-exportados do core `ai`.
- API de tools consolidada via helper `tool({...})`.
- Maioria dos `experimental_*` promovidos a estáveis ou renomeados.
- Codemods oficiais para migração 3 → 4: `npx @ai-sdk/codemod upgrade`.

**5.x** está em alpha/beta em meados de 2025. **Não adotar em produção** até estabilizar. Plano de upgrade: aguardar `5.0.0` estável + duas patches; rodar codemods; revalidar todos os tool schemas; smoke test em rotas de chat antes de promover.

## Pacotes

Core e UI:

- `ai` — AI SDK Core (provider-agnostic).
- `@ai-sdk/react` — hooks React (`useChat`, `useCompletion`, `useObject`, `useAssistant`).
- `@ai-sdk/rsc` — utilidades para React Server Components.

Provider packages (instalar apenas os usados):

- `@ai-sdk/openai` — OpenAI direto.
- `@ai-sdk/anthropic` — Claude.
- `@ai-sdk/google` — Gemini via Google Generative AI.
- `@ai-sdk/google-vertex` — Gemini via Vertex AI (auth GCP).
- `@ai-sdk/mistral`, `@ai-sdk/cohere`, `@ai-sdk/amazon-bedrock`, `@ai-sdk/azure`, `@ai-sdk/togetherai`.
- `@ai-sdk/openai-compatible` — adapter genérico para Groq, Ollama, LM Studio, vLLM e qualquer endpoint OpenAI-compatible.

Versionar provider packages **alinhados com a major do `ai` core**. Misturar `ai@4` com `@ai-sdk/openai@0.x` (que correspondia a `ai@3`) gera type errors silenciosos em tools.

## Instanciação de provider

```ts
import { createOpenAI } from "@ai-sdk/openai";

export const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  // baseURL opcional para gateway próprio
});

// Uso: openai("gpt-4o") retorna um LanguageModelV1
```

API keys sempre em server-side (Route Handler / Server Action). Ver `@rules/security`.

## generateText / streamText

Geração de texto livre. Use **somente quando a saída é prosa para humanos**. Para qualquer estrutura, prefira `generateObject` (ver abaixo).

```ts
import { generateText, streamText } from "ai";
import { openai } from "@/lib/ai/providers";

const { text, usage, finishReason } = await generateText({
  model: openai("gpt-4o"),
  system: "You are a concise technical writer.",
  prompt: "Resume o changelog abaixo em 3 bullets.",
  maxTokens: 512,
  temperature: 0.3,
  abortSignal: AbortSignal.timeout(30_000),
});
```

Parâmetros relevantes:

| Parâmetro | Uso |
|---|---|
| `model` | Instância do provider package. |
| `prompt` *ou* `messages` | `prompt: string` para single-turn; `messages: CoreMessage[]` para conversação. Mutuamente exclusivos. |
| `system` | Instrução de sistema. Preferir aqui em vez de role `system` em `messages`. |
| `temperature`, `topP`, `topK` | Determinismo. Para parsing/extração use `temperature: 0`. |
| `maxTokens` | **Sempre definir.** Default é provider-specific e geralmente generoso demais para budget. |
| `frequencyPenalty`, `presencePenalty`, `seed`, `stopSequences` | Controle fino. |
| `maxSteps` | Loop de tool use — quantas rodadas tool → modelo permitidas. Default 1. Para agents, 5-10 típico. |
| `tools`, `toolChoice` | Ver seção tools. |
| `experimental_telemetry` | Ver seção telemetria. |
| `abortSignal` | **Obrigatório em endpoints.** Sem timeout, request pode hang. |
| `maxRetries` | Default 2. SDK retry automático em 429/5xx com backoff exponencial. |

Retornos: `text`, `usage` (`promptTokens`, `completionTokens`, `totalTokens`), `finishReason` (`stop`, `length`, `content-filter`, `tool-calls`, `error`, `other`), `toolCalls`, `toolResults`, `steps` (multi-step), `warnings`, `response` (raw provider response, headers, id).

`streamText` retorna o mesmo formato + streams:

```ts
const result = streamText({ model: openai("gpt-4o"), prompt });

// Em Route Handler:
return result.toDataStreamResponse();

// Ou consumo manual:
for await (const chunk of result.textStream) { ... }
for await (const part of result.fullStream) { /* text-delta, tool-call, tool-result, finish, error */ }
```

Em 4.x, `toUIMessageStreamResponse()` é a variante alinhada ao formato consumido por `useChat` na nova superfície de UI messages.

**Sempre cheque `finishReason`.** `length` significa que o modelo foi cortado por `maxTokens` — retry com budget maior ou continuação, não trate como resposta válida.

## generateObject / streamObject

Structured output com schema Zod. Esta é a **forma canônica de extrair dados estruturados de LLM no projeto**. Para convenções de schema, ver `@stacks/validation/zod@4`.

```ts
import { generateObject } from "ai";
import { z } from "zod";

const { object } = await generateObject({
  model: openai("gpt-4o"),
  schema: z.object({
    title: z.string(),
    tags: z.array(z.string()).max(5),
    sentiment: z.enum(["positive", "neutral", "negative"]),
  }),
  prompt: `Classifique: ${input}`,
});

// object é tipado conforme o schema, com validação Zod já aplicada
```

Modos:

- `mode: "auto"` (default) — SDK escolhe entre JSON mode e tool mode conforme provider.
- `mode: "json"` — força JSON mode nativo do provider (OpenAI response_format, Gemini responseSchema).
- `mode: "tool"` — força tool calling como veículo (mais compatível com providers sem JSON mode).

`streamObject` para UI que renderiza objeto parcial conforme chega (`partialObjectStream`). Útil para formulários gerados, configurações, JSON longo.

**Anti-pattern:** rodar `generateText` e fazer `JSON.parse(text)` em cima. Frágil, sem retry estruturado, sem tipos. Use `generateObject`.

## Tool use

Ferramentas seguem schema Zod **obrigatório** em `parameters`. Sem schema, o modelo gera argumentos inválidos.

```ts
import { tool } from "ai";

const tools = {
  searchDocs: tool({
    description: "Busca documentos da base por similaridade semântica.",
    parameters: z.object({
      query: z.string().describe("Pergunta em linguagem natural"),
      topK: z.number().int().min(1).max(20).default(5),
    }),
    execute: async ({ query, topK }) => {
      return await vectorSearch(query, topK);
    },
  }),
};

const result = await generateText({
  model: openai("gpt-4o"),
  messages,
  tools,
  toolChoice: "auto",
  maxSteps: 5,
});
```

`toolChoice`: `"auto"` (modelo decide), `"required"` (deve chamar alguma tool), `"none"` (proíbe tools), `{ type: "tool", toolName: "searchDocs" }` (força tool específica).

`maxSteps` controla o agent loop: a cada step, modelo chama tools → resultados voltam → modelo decide próximo passo até `stop` ou limite. Sem isso, tools são chamadas mas o modelo nunca compõe a resposta final.

`experimental_toolCallStreaming: true` em `streamText` envia partial tool calls (argumentos parciais via `tool-call-streaming-start`/`tool-call-delta`). Útil para UI mostrar "chamando ferramenta X..." cedo.

Guardrails (validação de input, rate limit por tool, sandboxing de execução, redação de output sensível): ver `@rules/security`.

**Anti-patterns:**

- Tool sem `parameters: z.object(...)` (tipagem perdida; modelo alucina campos).
- Mais de ~10 tools no mesmo prompt — accuracy degrada. Preferir **router pattern**: uma tool inicial que classifica intenção e dispara subagente com toolset reduzido.
- `execute` que lança exception sem mensagem útil — o modelo recebe a exception como tool result e o erro vira parte do reasoning. Retornar `{ error: "mensagem" }` estruturado.

## Embeddings

```ts
import { embed, embedMany } from "ai";

const { embedding, usage } = await embed({
  model: openai.embedding("text-embedding-3-small"),
  value: "texto",
});

const { embeddings } = await embedMany({
  model: openai.embedding("text-embedding-3-small"),
  values: ["a", "b", "c"],
});
```

Persistência e similaridade vetorial: integração com pgvector (futuro `@stacks/database/pgvector`). Normalizar dimensão do embedding no schema da tabela conforme modelo escolhido (1536 para `text-embedding-3-small`, 3072 para `-3-large`).

## Image generation

`experimental_generateImage` (4.x) — superfície ainda estabilizando:

```ts
import { experimental_generateImage as generateImage } from "ai";

const { image } = await generateImage({
  model: openai.image("dall-e-3"),
  prompt: "...",
  size: "1024x1024",
});
```

Providers: OpenAI (DALL-E), Fal, Replicate. Tratar como experimental — pinar versão minor exata e revisar em cada upgrade.

## AI SDK UI (hooks React)

Para padrões de uso dentro do projeto, ver `@stacks/frontend/react@19` e `@stacks/frontend/next@16`.

### useChat

```ts
"use client";
import { useChat } from "@ai-sdk/react";

const {
  messages, input, handleInputChange, handleSubmit,
  isLoading, status, error, append, reload, stop, setMessages,
} = useChat({ api: "/api/chat", id: chatId });
```

`id` estável é **obrigatório** quando há múltiplos chats na mesma página — sem isso, o hook compartilha cache e mistura streams.

`messages[i].id` deve ser preservado em qualquer persistência. UI que regenera ids a cada render quebra dedupe e causa flicker.

Server side:

```ts
// app/api/chat/route.ts
import { streamText } from "ai";
import { openai } from "@/lib/ai/providers";

export async function POST(req: Request) {
  const { messages } = await req.json();
  const result = streamText({
    model: openai("gpt-4o"),
    system: "...",
    messages,
    abortSignal: req.signal,
  });
  return result.toDataStreamResponse();
}
```

`req.signal` propagado para `abortSignal` garante cancelamento real quando o cliente desconecta.

### useCompletion, useObject, useAssistant

- `useCompletion({ api })` — single completion, sem histórico.
- `useObject({ api, schema })` — streaming de objeto estruturado (par com `streamObject` no server).
- `useAssistant` — OpenAI Assistants API. Usar apenas se obrigatório por contrato; preferir `useChat` + tools próprio para portabilidade entre providers.

## Integração com Next.js 15

- **Route Handlers** (`app/api/*/route.ts`) são o caminho default. `export const runtime = "edge"` é opcional — usar quando latência de cold start importa e o workload cabe nas restrições edge (sem bibliotecas Node-only, sem filesystem, timeout reduzido). Caso contrário, Node runtime.
- **Server Actions** funcionam para uso não-streaming (`generateText`, `generateObject` sync).
- **RSC + `use(promise)`** para conteúdo determinístico carregado em Suspense. Não substitui `useChat` para conversação interativa.

## Telemetria

OpenTelemetry nativo. Ver `@rules/observability` para convenções de redação e atributos.

```ts
await generateText({
  model: openai("gpt-4o"),
  prompt,
  experimental_telemetry: {
    isEnabled: true,
    functionId: "summarize-changelog",
    metadata: { userId, tenantId },
    recordInputs: false,   // PII safety
    recordOutputs: false,
  },
});
```

Spans com atributos `ai.*` e `gen_ai.*` (padrão OTel GenAI semantic conventions). `recordInputs`/`recordOutputs` **default true** — desligar explicitamente em qualquer rota com PII e logar apenas hashes ou counts.

## Erros e retry

Hierarquia principal: `APICallError`, `InvalidResponseDataError`, `RetryError`, `NoObjectGeneratedError`, `InvalidToolArgumentsError`, `ToolExecutionError`. SDK faz retry automático em 429/5xx via backoff exponencial (default `maxRetries: 2`).

Combinar com:

- `abortSignal: AbortSignal.timeout(ms)` — timeout duro.
- `maxRetries` no provider para política diferente do default.
- Retry de **negócio** (não rede) em volta da chamada quando `finishReason === "length"` ou `NoObjectGeneratedError` — diferente de retry de rede.

Ver `@rules/error-handling` para convenções gerais.

## Caching e custo

Tracking de tokens via `usage` em toda chamada. Persistir por `functionId` para análise de custo por feature.

Camadas de cache:

1. **Provider-level (preferido quando disponível):**
   - Anthropic prompt caching: marcar segmentos com `providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } }` em partes específicas de `messages`.
   - OpenAI prompt caching: automático para prompts longos repetidos (sem opt-in).
2. **Cache próprio:** hash determinístico de `(model, system, messages, params)` → response. Considerações de PII obrigatórias antes de cachear conteúdo de usuário. Ver `@rules/caching`.

Para performance e budget geral, ver `@rules/performance`.

## Multi-modal

```ts
const { text } = await generateText({
  model: openai("gpt-4o"),
  messages: [
    {
      role: "user",
      content: [
        { type: "text", text: "Descreva esta imagem:" },
        { type: "image", image: new URL("https://...") }, // URL, Buffer, Uint8Array, base64
      ],
    },
  ],
});
```

`content` parts: `text`, `image`, `file` (PDF e outros conforme provider), `tool-call`, `tool-result`. Vídeo/áudio onde provider suporta (Gemini). Validar tamanho antes de enviar — providers cobram por token de imagem.

## CoreMessage

Schema canônico de mensagens. Roles: `system`, `user`, `assistant`, `tool`. Content é `string` (atalho para single text part) ou array de parts tipadas. Persistir conversas **sempre como `CoreMessage[]`** (não como string concatenada) — preserva tool calls, tool results e parts multi-modais.

## Quando usar Vercel AI SDK vs SDK do provider direto

**Use AI SDK quando:**
- Streaming para UI (hooks `useChat` etc.).
- Multi-provider (mesmo código roda em OpenAI/Anthropic/Gemini trocando o `model`).
- Structured output com Zod.
- Tool use cross-provider.
- Telemetria padronizada.
- Integração Next.js fluida.

**Use SDK do provider direto** (ver `@stacks/ai/openai`, `@stacks/ai/gemini`, `@stacks/ai/google-genai-sdk`) **quando:**
- Feature específica do provider ainda não exposta no AI SDK (Assistants API beta, Batches API, fine-tuning, files API avançada).
- Contrato vendor obriga uso do SDK oficial.
- Controle fine-grained de headers, retries customizados, streaming proprietário.

Não duplicar: se uma rota usa SDK direto e outra usa AI SDK, isolar em módulos separados e documentar a razão na decisão (`@decisions/`).

## Diferenciação dos próximos docs

- **`@stacks/ai/mastra-sdk`** — framework de agents/workflows com memory, eval, RAG. Usa AI SDK por baixo. AI SDK é a primitiva; Mastra é a orquestração.
- **`@stacks/ai/openai`** e **`@stacks/ai/gemini`** — SDKs vendor diretos. Usar quando AI SDK não cobre.
- **`@stacks/ai/google-genai-sdk`** — `@google/genai` (SDK Google direto), distinto de `@ai-sdk/google`.
- **`@stacks/ai/harness-engineering`** — framework próprio/conceitual de engenharia de prompts e harnesses; ortogonal ao AI SDK.

## Anti-patterns

- Usar `generateText` + `JSON.parse` quando `generateObject` resolve. Parsing manual frágil e sem retry estruturado.
- Tool sem `parameters: z.object(...)`. Modelo gera junk; sem tipagem.
- `streamText` em endpoint sem `abortSignal`. Request hang em desconexão do cliente.
- API keys ou tokens em código client. Sempre Route Handler ou Server Action. Ver `@rules/security`.
- Misturar versões de provider package incompatíveis com `ai` core. Pinar majors alinhados.
- Ignorar `finishReason`. `length` cortado por `maxTokens` não é resposta válida.
- Logar prompts/responses completos sem redação. PII obrigatoriamente filtrada. Ver `@rules/observability` e `@rules/security`.
- UI que regenera `messages[i].id` a cada render. Quebra dedupe, causa flicker e perde idempotência em persistência.
- Mais de ~10 tools no mesmo prompt. Accuracy degrada. Usar router pattern.
- `experimental_*` em código sem revisão semestral. Promovidos ou removidos sem aviso entre minors.

## Roadmap de upgrade

- **Curto prazo (4.x):** manter pinado. Acompanhar changelog mensal. Atualizar codemods quando publicados.
- **Médio prazo (5.x estável):** validar em branch de spike — testar streaming, tools, telemetria, structured output. Rodar codemods oficiais. Smoke test em rotas de chat. Promover apenas após duas patches `5.0.x` estáveis.
- **Aposentadoria 3.x:** já fora. Qualquer código remanescente deve migrar via codemod.

## Referências

- Documentação oficial: https://ai-sdk.dev
- Repositório: https://github.com/vercel/ai
- Provider docs: https://ai-sdk.dev/providers
- Cookbook: https://ai-sdk.dev/cookbook
