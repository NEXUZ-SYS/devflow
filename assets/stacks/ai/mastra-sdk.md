---
title: Mastra
version: latest-stable
last_updated: 2026-05-20
status: current
upstream:
  docs: https://mastra.ai/docs
  repo: https://github.com/mastra-ai/mastra
category: ai
---

# Mastra

Framework TypeScript open-source, opinativo, para construção de **AI agents**, **workflows tipados**, **RAG** e **evals**. Construído pela equipe ex-Gatsby, posiciona-se como camada de orquestração acima do **Vercel AI SDK** (ver `@stacks/ai/vercel-ai-sdk`), adicionando memória persistente, multi-step workflows com snapshot/resume, vetorização nativa e observabilidade OpenTelemetry embutida.

Mastra **não substitui** o AI SDK — usa AI SDK Core como primitiva de modelo. A escolha entre os dois é arquitetural, não competitiva (ver seção "Mastra vs Vercel AI SDK puro").

## Versão e instalação

Pin sempre a versão exata em `package.json`. Mastra ainda evolui rapidamente; minor versions trazem mudanças relevantes em APIs de workflow e memory.

```json
{
  "dependencies": {
    "@mastra/core": "^0.x",
    "@mastra/memory": "^0.x",
    "@mastra/rag": "^0.x",
    "@mastra/evals": "^0.x",
    "@mastra/mcp": "^0.x"
  },
  "devDependencies": {
    "mastra": "^0.x"
  }
}
```

Toda interface pública de Mastra usa **Zod** (ver `@stacks/validation/zod@4`) — schemas Zod são o contrato de fronteira para tools, inputs e outputs.

## Componentes principais

### Agents

Unidade central de Mastra. Encapsula instruções (system prompt), modelo, ferramentas e memória.

```ts
import { Agent } from '@mastra/core/agent';
import { openai } from '@ai-sdk/openai';

export const supportAgent = new Agent({
  name: 'support-agent',
  instructions: 'Você responde dúvidas de suporte usando a base de conhecimento.',
  model: openai('gpt-4o'),
  tools: { searchKnowledge, createTicket },
  memory,
});

const result = await supportAgent.generate('Como resetar minha senha?');
const stream = await supportAgent.stream('Como resetar minha senha?');
```

Agents executam **agent loop** com tool use multi-step automático: o modelo decide quando chamar tools, Mastra executa, devolve resultado, e o loop continua até resposta final ou limite (`maxSteps`).

### Workflows

Orquestração tipada determinística. Use quando a sequência de passos é previsível e você quer observabilidade ponto a ponto, ao contrário do agent loop que é dirigido pelo LLM.

```ts
import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';

const extractStep = createStep({
  id: 'extract',
  inputSchema: z.object({ url: z.string().url() }),
  outputSchema: z.object({ text: z.string() }),
  execute: async ({ inputData }) => { /* ... */ },
});

const workflow = createWorkflow({ id: 'ingest-doc', inputSchema, outputSchema })
  .then(extractStep)
  .then(chunkStep)
  .parallel([embedStep, summarizeStep])
  .branch([
    [shouldNotify, notifyStep],
  ])
  .commit();
```

Suporta **retries**, **suspend/resume**, **snapshot** persistente — workflows longos podem pausar aguardando input humano e retomar do snapshot.

### Tools

Funções tipadas que agents invocam. Sempre definidas com `inputSchema` e `outputSchema` Zod.

```ts
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const searchKnowledge = createTool({
  id: 'search-knowledge',
  description: 'Busca semântica na base de conhecimento por similaridade de vetores.',
  inputSchema: z.object({ query: z.string(), topK: z.number().int().min(1).max(20).default(5) }),
  outputSchema: z.object({ results: z.array(z.object({ id: z.string(), text: z.string(), score: z.number() })) }),
  execute: async ({ context }) => { /* ... */ },
});
```

**Description** é parte do prompt — o LLM lê esse texto para decidir invocar a tool. Seja preciso, escreva em primeira-pessoa-de-ferramenta, descreva inputs.

### Memory

Camada de persistência conversacional. Três modos coexistentes:

- **Thread context** (short-term): últimas N mensagens da thread, injetadas no prompt.
- **Semantic recall** (long-term): busca vetorial em histórico completo da thread/usuário.
- **Working memory**: bloco mutável e estruturado que o agent mantém entre turnos (perfil do usuário, estado da tarefa).

```ts
import { Memory } from '@mastra/memory';
import { PostgresStore } from '@mastra/pg';

export const memory = new Memory({
  storage: new PostgresStore({ connectionString: process.env.DATABASE_URL! }),
  vector: new PgVector({ connectionString: process.env.DATABASE_URL! }),
  options: {
    lastMessages: 20,
    semanticRecall: { topK: 5, messageRange: 2 },
    workingMemory: { enabled: true, template: '...' },
  },
});
```

Postgres + pgvector é o backend recomendado para este projeto (ver `@stacks/database/pgvector`). Sempre defina **TTL/limite** em `lastMessages` e cap em working memory — contexto cresce sem bound se você não fechar.

### RAG

Pipeline completo: documentos → chunks → embeddings → store vetorial → retrieval → reranking.

```ts
import { MDocument } from '@mastra/rag';

const doc = MDocument.fromMarkdown(content);
const chunks = await doc.chunk({ strategy: 'recursive', size: 512, overlap: 50 });
const embeddings = await embed(chunks);
await vectorStore.upsert({ vectors: embeddings, metadata: chunks.map(c => c.metadata) });
```

Vector stores suportados: **pgvector** (preferido aqui), Pinecone, Qdrant, Chroma, Astra. Use `MDocument.fromMarkdown` / `.fromHTML` / `.fromText` / `.fromJSON` para fontes diferentes. Strategies de chunking: `recursive`, `character`, `token`, `markdown`, `html`, `json`, `latex`.

### Evals

Métricas built-in para qualidade de output de LLM. Roda em CI ou no Mastra Dev playground.

Métricas nativas: `faithfulness`, `answer-relevance`, `context-relevance`, `toxicity`, `bias`, `hallucination`, `summarization`, `prompt-alignment`, `tone-consistency`, `completeness`. Use `createEval()` para métricas custom (LLM-as-judge ou determinísticas).

Evals **não** substituem testes unitários — são proxies estatísticos. Trate scores como sinal, não verdade.

### Voice

STT/TTS via providers (OpenAI, ElevenLabs, Deepgram, Google). API uniforme: `agent.voice.speak(text)` e `agent.voice.listen(audio)`. Use apenas quando a UX exige áudio — para texto puro, é overhead.

### MCP

Cliente e servidor do Model Context Protocol.

- `MCPClient`: agent consome tools/resources expostos por servidores MCP externos.
- `MCPServer`: expõe agents/tools/workflows Mastra como servidor MCP para consumidores externos (Claude Desktop, IDEs).

### Deployment

Deployers oficiais empacotam Mastra para a plataforma alvo:

- `@mastra/deployer-vercel` — preferido neste projeto (alinhado com `@stacks/frontend/next@16`).
- `@mastra/deployer-cloudflare` — workers/edge.
- `@mastra/deployer-netlify`.
- Standalone Node — para containers, Cloud Run, ECS.

Configure em `mastra.config.ts`. O deployer compila workflows, registra rotas e injeta storage adapters.

### Mastra Dev

CLI `mastra dev` sobe playground local em `http://localhost:4111` com:

- Chat UI por agent, com inspetor de tool calls.
- Visualização de workflows com estado por step.
- Runner de evals com diff por iteração.
- Traces OpenTelemetry navegáveis.

Use durante desenvolvimento de agents/workflows — encurta drasticamente o loop de iteração.

## Mastra vs Vercel AI SDK puro

Decisão arquitetural por caso de uso:

| Caso | Use |
|---|---|
| Single completion / structured output único | `@stacks/ai/vercel-ai-sdk` puro |
| Chat simples sem persistência longa | `@stacks/ai/vercel-ai-sdk` + `useChat` |
| Agent com tools e memória entre sessões | **Mastra** |
| Workflow multi-step com observabilidade e retries | **Mastra** |
| RAG estruturado com chunking + retrieval + reranking | **Mastra** |
| Evals em CI | **Mastra** |
| Ingestão batch sem LLM-driven decisions | AI SDK puro (`embedMany`) |

Mastra **usa** AI SDK por baixo (`model: openai(...)`, `model: google(...)`) — providers do AI SDK funcionam transparentemente. Ver `@stacks/ai/openai` e `@stacks/ai/gemini` para configuração de providers.

## Integrações deste projeto

### Next.js 15

Em Route Handlers App Router (ver `@stacks/frontend/next@16`):

```ts
// app/api/chat/route.ts
import { mastra } from '@/mastra';

export async function POST(req: Request) {
  const { messages, threadId, resourceId } = await req.json();
  const agent = mastra.getAgent('supportAgent');
  const stream = await agent.stream(messages, { threadId, resourceId });
  return stream.toDataStreamResponse();
}
```

Cliente consome via `useChat` do AI SDK UI normalmente — o stream é compatível.

### Postgres / pgvector

Store de memory e vetores. Ver `@stacks/database/pgvector`. Configure `DATABASE_URL` em secrets (ver `@rules/security`), nunca inline.

### TypeScript 5.4

Ver `@stacks/language/typescript@6`. Toda fronteira pública tipa com Zod e infere com `z.infer<typeof schema>`. Nunca use `any` em `execute` de tools — derive o tipo do `inputSchema`.

### Observability

OpenTelemetry built-in. Configure exporter em `mastra.config.ts` para Langfuse, Braintrust, SigNoz, Datadog ou OTLP genérico. Ver `@rules/observability`.

```ts
telemetry: {
  serviceName: 'support-service',
  enabled: true,
  export: { type: 'otlp', endpoint: process.env.OTEL_ENDPOINT! },
}
```

### Error handling

Ver `@rules/error-handling`. Tools devem lançar erros tipados — Mastra captura, envia ao agent loop como tool error, e o LLM decide retry/fallback. Não swallow exceptions dentro de `execute`. Workflows definem retry por step (`retries: { attempts, delay }`).

## Anti-patterns

- **Usar Mastra para single completion** — overhead de agent loop, memory, telemetria. Use `generateText`/`generateObject` do AI SDK puro.
- **Agent sem `instructions` claros** — system prompt vago produz tool selection errática. Escreva instructions com persona, escopo e regras de invocação de tools.
- **Tools sem schema Zod completo** — LLM alucina inputs se `inputSchema` for permissivo. Use `.strict()`, enums, `min`/`max`, `.describe()` em cada campo.
- **Memory sem TTL/limite** — `lastMessages` sem cap explode o contexto e a fatura. Sempre defina `lastMessages` numérico e revise working memory periodicamente.
- **Workflows sem observabilidade** — workflows sem telemetria são pior que código imperativo. Se desligou OTEL, não use workflows; use funções TS.
- **Misturar agent loop com workflow para o mesmo passo** — se a sequência é determinística, é workflow. Se depende de decisão do LLM, é agent. Não force agent a executar pipeline ETL.
- **Evals como gate booleano** — métricas são distribuições, não passa/falha. Use thresholds com banda de tolerância.
- **Embedar `apiKey` em config de provider** — sempre via env. Ver `@rules/security`.

## Roadmap de upgrade

Antes de subir minor version: leia o changelog em `github.com/mastra-ai/mastra/releases`, rode evals existentes contra a nova versão, compare scores. APIs marcadas como experimental (workflow `.suspend`, working memory templates) podem mudar entre minors.

## Referências cruzadas

- `@stacks/ai/vercel-ai-sdk` — primitiva de modelo usada por baixo
- `@stacks/ai/openai` — provider OpenAI
- `@stacks/ai/gemini` — provider Google
- `@stacks/validation/zod@4` — schemas de fronteira
- `@stacks/language/typescript@6` — tipos inferidos
- `@stacks/frontend/next@16` — integração Route Handlers
- `@stacks/database/pgvector` — backend de memory e vetores
- `@rules/observability` — telemetria OpenTelemetry
- `@rules/security` — secrets e API keys
- `@rules/error-handling` — erros em tools e workflows
