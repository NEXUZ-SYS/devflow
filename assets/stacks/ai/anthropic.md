---
title: Anthropic API (Claude)
category: ai
status: current
last_updated: 2026-05-20
upstream: https://docs.anthropic.com
---

# Anthropic API (Claude)

Provider de LLMs da Anthropic — **API/protocolo**, não SDK. Este documento cobre o
contrato HTTP, modelos, features distintivas e como o projeto consome a API. Para
o cliente TypeScript oficial, ver `@stacks/ai/anthropic-sdk`. Para o caminho
padrão de integração no projeto via Vercel AI SDK, ver `@stacks/ai/vercel-ai-sdk`.

## Plataformas

Três superfícies expõem os modelos Claude. Escolha por requisito de governança,
não por preferência pessoal.

| Plataforma | Endpoint base | Auth |
|---|---|---|
| **Anthropic API direta** | `https://api.anthropic.com` | header `x-api-key` |
| **AWS Bedrock** | `bedrock-runtime.<region>.amazonaws.com` | AWS SigV4 / IAM |
| **GCP Vertex AI** | `<region>-aiplatform.googleapis.com` | OAuth / ADC |

A API direta é o caminho padrão. Bedrock e Vertex existem quando contrato/regulação
exige residência de dados em conta da cloud (ver `@rules/governance`).

## Modelos (2026-05)

| Modelo | Family | Context | Notas |
|---|---|---|---|
| `claude-opus-4-7` | Opus 4.7 | 200K (1M opt-in) | Reasoning top-tier, extended thinking, computer use beta |
| `claude-sonnet-4-6` | Sonnet 4.6 | 200K | Trabalho diário, melhor custo/qualidade |
| `claude-haiku-4-5` | Haiku 4.5 | 200K | Latência baixa, classificação, batch barato |

- **Extended thinking** disponível em Opus e Sonnet via `thinking: { type: "enabled", budget_tokens: N }`.
- **1M context** é opt-in em Opus — habilitado por beta header; cobra tier diferente.
- **Computer use** é beta em Opus — tool especial `computer_20250124` para screenshots e ações.

Sempre fixar o model ID exato em código. Nunca alias genérico ("latest") em produção.

## Endpoints principais

| Endpoint | Uso |
|---|---|
| `POST /v1/messages` | Chat (sync ou streaming SSE) |
| `POST /v1/messages?betas=...` | Habilitar features beta (computer-use, 1m-context, files) |
| `POST /v1/messages/batches` | Batch async (50% desconto, até 100k requests) |
| `GET  /v1/messages/batches/{id}` | Status do batch |
| `POST /v1/files` | Upload de arquivos reutilizáveis |
| `GET  /v1/models` | Lista modelos disponíveis na org |

## Request shape

```jsonc
{
  "model": "claude-opus-4-7",
  "max_tokens": 4096,              // obrigatório
  "system": "You are ...",         // string OU array de blocks (com cache_control)
  "messages": [
    { "role": "user", "content": "..." }
    // ou content como array de blocks: text, image, document, tool_use, tool_result
  ],
  "tools": [
    {
      "name": "get_weather",
      "description": "...",
      "input_schema": { /* JSON Schema */ }
    }
  ],
  "tool_choice": { "type": "auto" },   // "auto" | "any" | { "type": "tool", "name": "..." } | "none"
  "thinking": { "type": "enabled", "budget_tokens": 8000 },
  "temperature": 1.0,
  "top_p": 0.95,
  "top_k": 40,
  "stop_sequences": ["\n\nHuman:"],
  "stream": true,
  "metadata": { "user_id": "<opaque-hash>" }  // ver @rules/security: nunca PII
}
```

Campos obrigatórios mínimos: `model`, `max_tokens`, `messages`.

## Response shape

```jsonc
{
  "id": "msg_01...",
  "type": "message",
  "role": "assistant",
  "model": "claude-opus-4-7",
  "content": [
    { "type": "thinking", "thinking": "..." },        // se extended thinking
    { "type": "text", "text": "..." },
    { "type": "tool_use", "id": "toolu_01...", "name": "get_weather", "input": { "city": "SP" } }
  ],
  "stop_reason": "tool_use",                          // end_turn | max_tokens | tool_use | stop_sequence
  "stop_sequence": null,
  "usage": {
    "input_tokens": 1234,
    "output_tokens": 567,
    "cache_creation_input_tokens": 800,
    "cache_read_input_tokens": 400
  }
}
```

Sempre inspecionar `stop_reason`. `max_tokens` indica truncamento silencioso e é
um bug em produção se não tratado (ver `@rules/error-handling`).

## Streaming (SSE)

Quando `stream: true`, a resposta é um stream de eventos `text/event-stream`:

```
message_start          → metadata inicial + usage parcial
content_block_start    → começo de um block (text, tool_use, thinking)
content_block_delta    → deltas (text_delta, input_json_delta, thinking_delta, signature_delta)
content_block_stop     → fim do block
message_delta          → stop_reason + usage final (output_tokens)
message_stop           → fim
ping                   → keepalive
```

Tool calls em streaming chegam como `input_json_delta` — acumular e parsear ao
final do `content_block_stop`.

## Prompt caching

Feature distintiva. Marca blocks estáveis com `cache_control: { type: "ephemeral" }`
para reduzir custo de input em até 90% e latência em ~85% em prompts repetidos.

```jsonc
{
  "system": [
    { "type": "text", "text": "<persona estática>" },
    { "type": "text", "text": "<RAG context grande>", "cache_control": { "type": "ephemeral" } }
  ]
}
```

Regras operacionais:

- **TTL**: 5 minutos por padrão (refresh em cada hit). `ttl: "1h"` disponível em modelos suportados (cobra a mais).
- **4 breakpoints máximos** por request (system + messages + tools combinados).
- **Mínimo cacheable**: ~1024 tokens (Opus/Sonnet) / ~2048 tokens (Haiku) por block. Blocks menores são ignorados.
- **Cache key**: hash exato do conteúdo até o breakpoint — qualquer caractere diferente invalida.
- Verificar adoção via `usage.cache_read_input_tokens` > 0.

Estratégia opinativa do projeto: ver `@rules/caching`.

## Tool use

Tools são a forma canônica de obter saída estruturada confiável. Sempre via
`input_schema` JSON Schema — preferencialmente derivado de Zod (`@stacks/validation/zod@4`):

```ts
import { z } from "zod";

const GetWeather = z.object({
  city: z.string(),
  unit: z.enum(["celsius", "fahrenheit"]).default("celsius"),
});

const tool = {
  name: "get_weather",
  description: "Get current weather for a city",
  input_schema: z.toJSONSchema(GetWeather),  // Zod 4 nativo
};
```

Multi-turn com tools: o `tool_use` retornado pelo modelo entra no histórico como
parte do `assistant` turn, e a resposta vai em um `user` turn como `tool_result`:

```jsonc
{ "role": "assistant", "content": [{ "type": "tool_use", "id": "toolu_01", "name": "get_weather", "input": { "city": "SP" } }] },
{ "role": "user",      "content": [{ "type": "tool_result", "tool_use_id": "toolu_01", "content": "23°C, sunny" }] }
```

**Parallel tool calls** são suportados — múltiplos `tool_use` blocks em um único
`assistant` turn. Forçar serial com `disable_parallel_tool_use: true` no `tool_choice`.

**Structured output** sem ambiguidade: `tool_choice: { type: "tool", name: "schema" }`
+ uma tool dummy cujo `input_schema` é o shape desejado. O `input` do `tool_use`
é o objeto validado.

## Vision e documentos

- **Imagens**: block `{ "type": "image", "source": { "type": "base64" | "url", ... } }`. JPEG/PNG/GIF/WebP, até ~5MB cada.
- **PDFs nativos**: block `{ "type": "document", "source": { ... } }`. Até 32MB / 100 páginas. Modelo enxerga texto + layout + imagens das páginas.
- **Citations**: passar `{ "citations": { "enabled": true } }` no document block. Resposta inclui `citations` apontando spans (`start_char_index`, `end_char_index`) no source. Não confundir com citações de busca web.

## Extended thinking

Reasoning explícito com budget controlado:

```jsonc
{ "thinking": { "type": "enabled", "budget_tokens": 8000 } }
```

- `budget_tokens` é teto, não cota. Modelo pode usar menos.
- O block `thinking` retornado conta como output tokens (cobra como output).
- **Sempre** cap `budget_tokens` em produção — sem cap, custo escala de forma não-óbvia.
- `temperature` deve ser `1.0` quando thinking está ativo (restrição da API).
- Thinking blocks precisam ser preservados no histórico em multi-turn com tool use.

## Batch API

Async, 50% desconto, SLA de até 24h:

```
POST /v1/messages/batches
{
  "requests": [
    { "custom_id": "req-1", "params": { /* mesmos campos de /messages */ } },
    ...
  ]
}
```

Até 100k requests por batch. Resultados via `results_url` (JSONL). Ideal para
classificação massiva, backfill, eval offline. Não usar para latência interativa.

## Files API

Upload reutilizável:

```
POST /v1/files       (multipart)
→ { "id": "file_01...", ... }
```

Referenciar em messages: `{ "type": "document", "source": { "type": "file", "file_id": "file_01..." } }`.

Útil quando o mesmo PDF/imagem aparece em muitas requests — evita reupload e
combina bem com prompt caching.

## Auth

| Plataforma | Como |
|---|---|
| Direct | header `x-api-key: $ANTHROPIC_API_KEY` + `anthropic-version: 2023-06-01` |
| Bedrock | AWS SDK assina com SigV4; chamar `bedrock-runtime:InvokeModel` |
| Vertex | OAuth bearer via ADC; endpoint regional Vertex |

Headers obrigatórios na API direta:

```
x-api-key: <key>
anthropic-version: 2023-06-01
content-type: application/json
anthropic-beta: <feature1>,<feature2>   // quando aplicável
```

Regras de chave (ver `@rules/security` e `@contracts/secrets`):

- API key **nunca** em browser, mobile, repo, log, mensagem de erro.
- Sempre via secret manager (`@contracts/secrets`); rotação periódica.
- Em edge/server use env var injetado pelo runtime, nunca hardcoded.

## Rate limits

Por organização, tier-based (RPM, ITPM, OTPM separados por modelo). Cada response
inclui:

```
anthropic-ratelimit-requests-limit
anthropic-ratelimit-requests-remaining
anthropic-ratelimit-requests-reset
anthropic-ratelimit-input-tokens-limit
anthropic-ratelimit-input-tokens-remaining
anthropic-ratelimit-input-tokens-reset
anthropic-ratelimit-output-tokens-*
```

Em 429: ler `retry-after` (segundos) e fazer backoff. Em 529 (overloaded):
exponential backoff com jitter. Política consolidada em `@rules/error-handling`.

## Erros

| Status | `type` | Significado |
|---|---|---|
| 400 | `invalid_request_error` | Schema/parâmetros inválidos — corrigir, não retry |
| 401 | `authentication_error` | Key inválida — falhar fast, alertar |
| 403 | `permission_error` | Org sem acesso ao modelo/feature |
| 404 | `not_found_error` | Model ID errado ou recurso (batch/file) inexistente |
| 413 | `request_too_large` | Reduzir input ou paginar |
| 429 | `rate_limit_error` | Backoff com `retry-after` |
| 500 | `api_error` | Retry com backoff curto |
| 529 | `overloaded_error` | Backoff exponencial + jitter |

Body sempre traz `{ "type": "error", "error": { "type": "...", "message": "..." } }`.
Nunca mostrar `message` raw em UI — pode vazar contexto interno.

## Quando usar a API Anthropic

- Tarefas onde Claude tem vantagem mensurada: writing longo, análise de documento, código de engenharia, agentes complexos com tool use, raciocínio multi-step.
- Prompt caching é game-changer: RAG, chatbots com persona grande, code review com codebase no contexto.
- Computer use beta (Opus 4.7).
- 1M context (Opus opt-in) para codebases inteiros ou corpora grandes.
- Extended thinking quando o problema é genuinamente "reasoning hard".
- Bedrock/Vertex quando há requisito de residência/compliance (LGPD/HIPAA) — ver `@rules/governance`.

Quando **não** usar diretamente: ver "Acesso no projeto" abaixo.

## Acesso no projeto

Ordem de preferência:

1. **`@stacks/ai/vercel-ai-sdk` + `@ai-sdk/anthropic`** — caminho padrão. Cobre 90% dos casos: chat, tool use, structured output via `generateObject`, streaming, multimodal. Provider-agnostic, fácil trocar Anthropic ↔ OpenAI ↔ Gemini sem reescrever a feature.
2. **`@anthropic-ai/sdk` direto** (`@stacks/ai/anthropic-sdk`) — quando precisar de features que o AI SDK não expõe ainda:
   - Computer use (beta)
   - Message Batches
   - Files API
   - Prompt caching com controle fino de breakpoints / TTL custom
   - Citations
3. **HTTP raw** — apenas em edge runtimes onde nem o SDK roda. Justificar.

Regra: nunca inventar wrapper próprio sobre `fetch` se um dos dois acima resolve.

## Observabilidade

Ver `@rules/observability`. Specificamente para Anthropic:

- Spans com attributes `gen_ai.system="anthropic"`, `gen_ai.request.model`, `gen_ai.response.id`.
- Logar `usage` completo incluindo `cache_creation_input_tokens` e `cache_read_input_tokens` — único jeito de auditar hit rate de cache.
- Logar `stop_reason` em todo request.
- **Nunca** logar `messages.content` cru — redação obrigatória (PII). Ver `@rules/security`.
- Métrica de cache hit rate: `cache_read / (cache_read + cache_creation + input_tokens_uncached)`. Alvo: > 60% em fluxos repetitivos.

## Anti-patterns

- API key em código client-side (browser, app mobile, extension).
- Ignorar prompt caching em system prompts > 1K tokens reutilizados — desperdício direto de custo.
- Tool sem `input_schema` completo — modelo improvisa JSON e quebra parse.
- Extended thinking sem `budget_tokens` cap em produção — custo de output escala silenciosamente.
- Logar `messages` ou `content` sem redaction — vaza PII e prompts proprietários (ver `@rules/security`).
- Tratar texto livre quando `tool_use` com schema resolve o problema com determinismo.
- Misturar versão de `@ai-sdk/anthropic` incompatível com a versão de `ai` core.
- Não inspecionar `stop_reason` — `max_tokens` cortado silencioso vira bug em prod.
- Usar `@anthropic-ai/sdk` direto quando `@stacks/ai/vercel-ai-sdk` já cobre — duplica conhecimento de provider no codebase.
- Hardcode de `claude-opus-4-7` espalhado no código — model ID deve ser config (env var ou arquivo de modelos).
- Retry agressivo em 400/401/403 — são erros determinísticos, retry só piora.
- Confiar em `temperature: 0` para determinismo total — Claude não é determinístico mesmo a 0.

## Comparação rápida com outros providers

- vs **OpenAI** (ver `@stacks/ai/openai`): Anthropic tem prompt caching explícito superior, melhor em writing longo e análise; OpenAI tem function calling com `strict: true` (Anthropic não tem equivalente nativo — usar Zod no input_schema).
- vs **Gemini** (ver `@stacks/ai/gemini`): Anthropic tem extended thinking e computer use; Gemini tem context window maior nativo e custo mais baixo em Flash.
- Em agentes complexos, ver `@stacks/ai/harness-engineering` para padrões de orquestração.

## Referências

- API docs: https://docs.anthropic.com
- Changelog de modelos: https://www.anthropic.com/news
- API reference: https://docs.anthropic.com/en/api/messages
- Beta features: https://docs.anthropic.com/en/api/beta-headers
- Prompt caching: https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
- Tool use: https://docs.anthropic.com/en/docs/build-with-claude/tool-use
- Extended thinking: https://docs.anthropic.com/en/docs/build-with-claude/extended-thinking
- Computer use: https://docs.anthropic.com/en/docs/build-with-claude/computer-use

## Referências cruzadas

- `@stacks/ai/anthropic-sdk` — cliente TypeScript oficial
- `@stacks/ai/vercel-ai-sdk` — caminho padrão de integração no projeto
- `@stacks/ai/openai` — provider alternativo
- `@stacks/ai/gemini` — provider alternativo
- `@stacks/ai/harness-engineering` — padrões de orquestração de agentes
- `@stacks/validation/zod@4` — schemas para tool `input_schema`
- `@rules/security` — handling de API key, redaction de logs
- `@rules/caching` — política de prompt caching
- `@rules/observability` — spans, métricas e logs de LLM
- `@rules/error-handling` — retry/backoff em 429/529, tratamento de `stop_reason`
- `@rules/governance` — quando exigir Bedrock/Vertex por compliance
- `@contracts/secrets` — convenções de naming e storage da API key
