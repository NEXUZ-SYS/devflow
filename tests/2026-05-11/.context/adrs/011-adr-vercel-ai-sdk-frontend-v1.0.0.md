---
type: adr
name: adr-vercel-ai-sdk-frontend
description: Vercel AI SDK 6.x como SDK universal para LLMs na camada Frontend
scope: organizational
source: local
stack: Vercel AI SDK 6.x
category: arquitetura
status: Aprovado
version: 1.0.0
created: 2026-05-11
supersedes: []
refines: []
protocol_contract: null
decision_kind: firm
summary: ""
---

# ADR — Vercel AI SDK 6.x como SDK universal para LLMs no Frontend

- **Data:** 2026-05-11
- **Status:** Aprovado
- **Escopo:** Organizacional
- **Stack:** Vercel AI SDK 6.x
- **Categoria:** Arquitetura

---

## Contexto

Frontend Next 16 + React 19 consome BFF (route handlers) que orquestra LLMs via Mastra Model Router. UI precisa renderizar streaming token-a-token, tool calls, partial JSON, generative UI e estado de execução de agente. Implementação manual de SSE/stream parsing em cada feature gera acoplamento ao provider, inconsistência de estado e custo alto de refactor. Necessário SDK declarativo, agnóstico a provider, com hooks React para `useChat`, `useCompletion`, `useObject` e protocolo AG-UI (UI events) padronizado entre Frontend e BFF.

## Decisão

Adotar **Vercel AI SDK 6.x** como única camada de integração LLM no Frontend. Hooks `useChat`/`useCompletion`/`useObject` consomem rotas BFF (`app/api/**`) que retornam streams compatíveis. Protocolo AG-UI v6 transporta tool calls, partial state e UI components. Provider-agnostic: troca de modelo via Mastra Router no BFF não impacta Frontend. Sem `fetch` manual para LLM; sem parse de SSE customizado.

```
apps/web/src/features/{slice}/ui/        → useChat({ api: '/api/<slice>/chat' })
apps/web/src/features/{slice}/model/     → tool/UI message handlers (z.infer)
app/api/<slice>/chat/route.ts (BFF)      → streamText() + Mastra Router
packages/contracts/ag-ui/                → schemas AG-UI (Zod)
```

## Alternativas Consideradas

- **fetch + SSE parser custom** — reimplementa stream, partial JSON, tool calls; alto acoplamento ao provider.
- **LangChain.js** — orientado a chains/agents server-side; hooks React fracos; bundle grande.
- **OpenAI SDK direto** — acopla Frontend ao provider; sem AG-UI; troca de modelo exige refactor.
- **Vercel AI SDK 6.x** ✓ — hooks React first-class, provider-agnostic, AG-UI nativo, streaming/tool-calls padronizados.

## Consequências

**Positivas**
- Streaming + tool calls + generative UI em um único hook
- Provider-agnostic → troca de LLM no BFF é transparente
- AG-UI v6 → contrato Frontend/BFF tipado e versionado
- Integração nativa com Next route handlers, suspense, RSC

**Negativas**
- Lock-in moderado ao protocolo AG-UI (mitigado por specs públicas)
- Breaking changes entre majors (v4→v5→v6)
- Bundle adicional (~30-50KB gzip)

**Riscos aceitos**
- Evolução rápida da API → pin de minor; review de release notes a cada bump

## Guardrails

- SEMPRE consumir LLMs via `useChat`/`useCompletion`/`useObject`; nunca `fetch` direto a provider
- SEMPRE tipar mensagens AG-UI via `z.infer` de `packages/contracts/ag-ui`
- NUNCA fazer parse manual de SSE/stream em componentes
- NUNCA importar SDKs de provider (`@ai-sdk/anthropic`, `@ai-sdk/openai`) no Frontend
- QUANDO precisar de tool client-side, ENTÃO declarar via `tools` no hook com schema Zod
- QUANDO partial state for necessário, ENTÃO usar `experimental_partialOutput` ou `useObject`

## Enforcement

- [ ] Code review: rejeitar PR com `fetch('/api/.../chat')` manual ou SSE parser custom
- [ ] Lint: regra import — `@ai-sdk/anthropic`/`@ai-sdk/openai` proibidos em `apps/web/**`
- [ ] Teste: Vitest + MSW mocka stream AG-UI; Playwright valida render incremental
- [ ] Gate CI/PREVC: Validation phase roda contract test contra schemas AG-UI

## Evidências / Anexos

**Fontes oficiais:** [Vercel AI SDK — Documentation](https://ai-sdk.dev/docs/introduction) · [Vercel AI SDK — GitHub](https://github.com/vercel/ai) · [Vercel AI SDK — UI Reference](https://ai-sdk.dev/docs/ai-sdk-ui/overview)

```tsx
// exemplo minimal — hook useChat consumindo route handler BFF
'use client';
import { useChat } from 'ai/react';
import { z } from 'zod';

const ResourceToolSchema = z.object({ id: z.string().uuid() });

export function ResourceChat() {
  const { messages, input, handleSubmit, handleInputChange } = useChat({
    api: '/api/resource/chat',
    experimental_toolCallStreaming: true,
  });

  return (
    <form onSubmit={handleSubmit}>
      {messages.map((m) => (
        <div key={m.id}>{m.role}: {m.content}</div>
      ))}
      <input value={input} onChange={handleInputChange} />
    </form>
  );
}
```
