---
title: Gemini API
version: 2025
last_updated: 2026-05-20
status: active
upstream:
  - https://ai.google.dev/gemini-api/docs
  - https://cloud.google.com/vertex-ai/generative-ai/docs
---

# Gemini API

Manual operacional da **Gemini API** como produto/protocolo do Google. Cobre superfícies, modelos, request shape, autenticação, quotas e governança. Documento focado em **o que a API é e como o projeto a consome**, agnóstico de SDK. Para o SDK oficial TypeScript `@google/genai`, ver `@stacks/ai/google-genai-sdk`. Para acesso via abstração unificada, ver `@stacks/ai/vercel-ai-sdk`.

## Duas plataformas, mesma família de modelos

A Gemini API é oferecida em **duas plataformas distintas**, com modelos compatíveis mas com superfícies de autenticação, billing, compliance e SLA diferentes. **A escolha entre elas é uma decisão arquitetural, não uma escolha de SDK.**

### Google AI Studio / Generative Language API

- Endpoint: `generativelanguage.googleapis.com`
- Auth: **API key simples** via header `x-goog-api-key` ou query param `?key=...`
- Billing: conta Google pessoal, free tier generoso
- Sem region pinning, sem data residency garantida
- Sem SLA contratual
- **Uso recomendado**: dev local, MVP, experimentação, prototipagem rápida

### Vertex AI Gemini API

- Endpoint: `{region}-aiplatform.googleapis.com` (ex: `us-central1-aiplatform.googleapis.com`)
- Auth: **OAuth via Application Default Credentials (ADC)**, scopes `https://www.googleapis.com/auth/cloud-platform`
- Billing: por projeto GCP, com IAM granular, audit logs em Cloud Logging
- **Region pinning**: data residency garantida por região
- SLA contratual, suporte enterprise
- **Default para produção neste projeto** — ver `@rules/security`, `@rules/governance`

> Regra operacional: **AI Studio em dev/MVP, Vertex em produção**. Migração não muda o shape do request, apenas auth e endpoint.

## Modelos principais (2025)

| Modelo | Família | Context | Caso de uso |
|---|---|---|---|
| `gemini-2.5-pro` | 2.5 | até 2M tokens | raciocínio complexo, multimodal pesado |
| `gemini-2.5-flash` | 2.5 | até 1M tokens | default custo/latência, thinking opcional |
| `gemini-2.5-flash-lite` | 2.5 | até 1M tokens | high-throughput, custo mínimo |
| `gemini-2.0-flash` | 2.0 | até 1M tokens | legacy estável |
| `text-embedding-004` | embed | — | embeddings 768 dims |
| `gemini-embedding-001` | embed | — | embeddings até 3072 dims, multilíngue |
| `imagen-3.0` / `imagen-4.0` | image gen | — | geração de imagens (Vertex) |
| `veo-*` | video gen | — | geração de vídeo (Vertex) |

Todos os modelos `gemini-2.x` são **multimodais nativos**: aceitam text, image, audio, video e PDF como input direto (sem pré-processamento OCR/transcrição externa).

## Features distintivas vs outros providers

- **Context window**: 1M–2M tokens em Pro/Flash 2.5 — ordem de magnitude acima de competidores.
- **Multimodal nativo**: vídeo inteiro como input, áudio longo, PDFs estruturados — não há conversão para texto antes.
- **Thinking/reasoning**: Gemini 2.5 expõe `thinkingConfig` com budget de tokens de pensamento (campo `thoughtsTokenCount` no `usageMetadata`).
- **Grounding with Google Search**: tool built-in (`googleSearch`) que injeta resultados de busca no contexto, com citações estruturadas no response.
- **Code execution**: tool built-in (`codeExecution`) que roda Python sandbox e retorna stdout/stderr.
- **URL context**: tool built-in (`urlContext`) para fetch e ingestão de URLs.
- **Live API**: streaming bidirecional voice/video via WebSocket (preview).
- **Context caching explícito**: recurso `cachedContents` com TTL configurável, reduz custo de prompts repetitivos longos em até 75% — ver `@rules/caching`.
- **Batch mode**: jobs assíncronos com desconto sobre preço síncrono.
- **PEFT tuning**: jobs de fine-tuning leve via `tuning` API.

## Endpoints e recursos canônicos

```
models.generateContent          # síncrono
models.streamGenerateContent    # streaming SSE
models.embedContent             # embeddings unitário
models.batchEmbedContents       # embeddings em batch
models.countTokens              # contagem antes de chamar

cachedContents.create | get | list | update | delete
files.upload | get | list | delete    # File API, até 2GB por arquivo
tuningJobs.create | get | list
batches.create | get | list           # batch mode

# Live API
wss://generativelanguage.googleapis.com/.../models.bidiGenerateContent
```

## Request shape canônico

```ts
{
  contents: [
    {
      role: "user" | "model",
      parts: [
        { text: "..." },
        { inlineData: { mimeType: "image/png", data: "<base64>" } },
        { fileData: { mimeType: "application/pdf", fileUri: "files/abc123" } },
        { functionCall: { name, args } },
        { functionResponse: { name, response } }
      ]
    }
  ],
  systemInstruction: { parts: [{ text: "..." }] },
  generationConfig: {
    temperature: 0.7,
    topP: 0.95,
    topK: 40,
    maxOutputTokens: 8192,
    candidateCount: 1,
    stopSequences: ["\n\n"],
    responseMimeType: "application/json",
    responseSchema: { /* JSON Schema subset */ },
    responseModalities: ["TEXT"],
    seed: 42,
    thinkingConfig: { thinkingBudget: 1024 }
  },
  safetySettings: [
    { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
    { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" }
  ],
  tools: [
    { functionDeclarations: [ /* OpenAPI-style schemas */ ] },
    { googleSearch: {} },
    { codeExecution: {} },
    { urlContext: {} }
  ],
  toolConfig: {
    functionCallingConfig: {
      mode: "AUTO",      // AUTO | ANY | NONE
      allowedFunctionNames: ["..."]
    }
  },
  cachedContent: "cachedContents/abc"
}
```

## Structured outputs

Para JSON estruturado garantido pelo decoder:

1. Defina `generationConfig.responseMimeType: "application/json"`.
2. Defina `generationConfig.responseSchema` com um **JSON Schema subset** (Gemini não aceita JSON Schema completo — sem `$ref`, sem `oneOf` em alguns níveis).
3. Pareie com Zod usando `zod-to-json-schema` e valide o parsed result com `Schema.parse()` — ver `@stacks/validation/zod@4`.

Sem `responseMimeType: "application/json"`, `responseSchema` é ignorado silenciosamente — bug recorrente.

## Function calling

- Declare funções em `tools[].functionDeclarations[]` com `name`, `description`, `parameters` (OpenAPI schema subset).
- Resposta do modelo virá com `parts: [{ functionCall: { name, args } }]`.
- Envie o resultado da execução no próximo turno como `parts: [{ functionResponse: { name, response } }]`.
- `toolConfig.functionCallingConfig.mode`:
  - `AUTO` — modelo decide se chama tool ou responde texto (default).
  - `ANY` — força chamada de **alguma** tool (útil para roteadores).
  - `NONE` — proíbe chamadas, força texto.

Built-in tools (`googleSearch`, `codeExecution`, `urlContext`) **não podem ser combinados** com `functionDeclarations` em todos os modelos — verifique compatibilidade do modelo alvo.

## Autenticação

### AI Studio
```http
GET /v1beta/models/gemini-2.5-flash:generateContent
Host: generativelanguage.googleapis.com
x-goog-api-key: <API_KEY>
```

API key vem de secret manager — **nunca** em código, nunca em client bundle. Ver `@rules/security`.

### Vertex AI
ADC via `google-auth-library`:
- Local: `gcloud auth application-default login`.
- Cloud Functions / Cloud Run / GKE: service account anexada, token automático.
- Scope: `https://www.googleapis.com/auth/cloud-platform`.

Endpoint regional obrigatório — `us-central1`, `europe-west4`, `southamerica-east1`, etc. Para LGPD, prefira região brasileira ou europeia conforme política — ver `@rules/governance`.

## Quotas e rate limits

- Limites são **por modelo, por projeto, por região**.
- Distinção entre **RPM** (requests/min), **TPM** (tokens/min) e **RPD** (requests/dia).
- Erros típicos: `429 RESOURCE_EXHAUSTED`, `503 UNAVAILABLE`.
- Aplicar **exponential backoff com jitter** — ver `@rules/error-handling`.
- Solicitar aumento de quota via console GCP quando necessário.

## Observabilidade

`usageMetadata` retornado em toda response contém:
- `promptTokenCount` — input tokens.
- `candidatesTokenCount` — output tokens (visíveis).
- `cachedContentTokenCount` — tokens servidos via cache (faturados com desconto).
- `thoughtsTokenCount` — tokens de raciocínio interno (faturados em modelos 2.5 com thinking).
- `totalTokenCount` — soma de todos os anteriores.

Emita spans OpenTelemetry com atributos padrão `gen_ai.*`:
- `gen_ai.system = "gemini"`
- `gen_ai.request.model = "gemini-2.5-flash"`
- `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`
- `gen_ai.response.finish_reasons`

Ver `@rules/observability`.

## Quando usar Gemini API

- **Multimodal pesado**: vídeo, PDFs grandes, áudio longo como input direto.
- **Context window >200k tokens** (documentos inteiros, repositórios de código).
- **Custo/latência**: Flash 2.5 e Flash-Lite competem agressivamente em throughput.
- **Grounding obrigatório com Google Search** com citações estruturadas.
- **Region pinning Vertex** para compliance LGPD/GDPR — ver `@rules/governance`.
- **Caching explícito de prompts longos repetidos** (system prompts grandes, RAG context fixo).

## Quando NÃO usar Gemini (neste projeto)

- Workloads que dependem de features OpenAI-specific (ex: Realtime API com WebRTC) — use OpenAI direto, ver `@stacks/ai/openai`.
- Texto curto, baixo volume, sem multimodal: `gpt-4o-mini` costuma ser mais barato e simples.
- Compliance que exige provider não-Google.

## Acesso no projeto

**Ordem de preferência:**

1. **Vercel AI SDK** com `@ai-sdk/google` (AI Studio) ou `@ai-sdk/google-vertex` (Vertex) — abstração unificada, streaming, tool-calling normalizado. Default para chat/generation. Ver `@stacks/ai/vercel-ai-sdk`.
2. **SDK direto `@google/genai`** quando o AI SDK não cobre a feature: Live API (WebSocket bidirecional), gestão explícita de `cachedContents`, Files API, batch mode, tuning. Ver `@stacks/ai/google-genai-sdk`.
3. **HTTP direto** apenas em casos extremos (edge runtime sem SDK, debug). Não é o caminho idiomático.

Não use bibliotecas comunitárias não-oficiais para Gemini.

## Anti-patterns

- Expor API key da AI Studio ou credenciais Vertex no client bundle.
- Desabilitar todos os `safetySettings` para `BLOCK_NONE` sem justificativa documentada.
- Usar `inlineData` (base64) para arquivos grandes (>20MB) em vez de **Files API** — estoura limite de request.
- Definir `responseSchema` **sem** `responseMimeType: "application/json"` — schema é silenciosamente ignorado.
- Logar `contents` inteiros com PII em produção — viola governança, ver `@rules/governance`.
- Usar AI Studio em produção: sem SLA, sem IAM, sem data residency, billing pessoal.
- Confiar em grounding com Google Search sem revisão humana ou citação visível ao usuário.
- `thinkingBudget` ilimitado em Flash quando o caso não exige raciocínio profundo — custo explode silenciosamente via `thoughtsTokenCount`.
- Recriar `cachedContents` a cada request em vez de reaproveitar TTL — anula o benefício de custo.
- Misturar built-in tools (`googleSearch`, `codeExecution`) com `functionDeclarations` sem checar suporte do modelo.
- Codificar `region` Vertex como string mágica espalhada — centralize em config.

## Referências

- AI Studio / Generative Language API: https://ai.google.dev/gemini-api/docs
- Vertex AI Gemini: https://cloud.google.com/vertex-ai/generative-ai/docs
- Model card e pricing: https://ai.google.dev/gemini-api/docs/models
- Safety settings: https://ai.google.dev/gemini-api/docs/safety-settings
- Context caching: https://ai.google.dev/gemini-api/docs/caching

## Cross-references

- `@stacks/ai/google-genai-sdk` — SDK TypeScript oficial `@google/genai`.
- `@stacks/ai/vercel-ai-sdk` — abstração unificada de providers.
- `@stacks/ai/openai` — comparação com provider alternativo.
- `@stacks/validation/zod@4` — bridging `responseSchema` ↔ Zod.
- `@rules/security` — manuseio de API keys e ADC.
- `@rules/governance` — data residency, LGPD, audit.
- `@rules/caching` — política de `cachedContents`.
- `@rules/error-handling` — backoff e retry em 429/503.
- `@rules/observability` — spans `gen_ai.*` e métricas de uso.
