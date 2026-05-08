---
type: adr
name: adr-vercel-ai-sdk-frontend
description: Vercel AI SDK 6.0.0 como SDK universal para LLMs na camada Frontend (streaming, tools, AG-UI)
scope: organizational
source: local
stack: Vercel AI SDK 6.0.0
category: arquitetura
status: Aprovado
version: 1.0.0
created: 2026-05-08
supersedes: []
refines: []
protocol_contract: null
decision_kind: firm
summary: ""
---

# ADR — Vercel AI SDK 6.0.0 na Camada Frontend

- **Data:** 2026-05-08
- **Status:** Aprovado
- **Escopo:** Organizacional
- **Stack:** Vercel AI SDK
- **Categoria:** Arquitetura

## Contexto

Camada Frontend: Next.js 16 + React 19 + TypeScript 5.9 + Zustand 5 + Tauri 2. Consumo de LLMs heterogêneos via BFF (route handlers) com necessidade de streaming token-by-token, tool calling estruturado, multi-step reasoning e UI generativa. Implementações ad-hoc por provider (`fetch` + parser SSE manual) geram drift de tipos, custo de manutenção e fricção de UX (cancelamento, retomada, partial states). Hooks React precisam ser cliente-only, type-safe e independentes de provider. AG-UI exige protocolo de eventos padronizado entre LLM e renderização React.

## Decisão

Adotar **Vercel AI SDK 6.0.0** como SDK universal de LLM na camada Frontend. `@ai-sdk/react` para hooks (`useChat`, `useCompletion`, `useObject`); UI Message Stream Protocol como contrato de wire entre BFF e cliente. Tools tipadas via Zod; renderização AG-UI a partir de `parts[]` discriminados. `experimental_useObject` para streaming de objetos validados por Zod. Provider-agnostic: cliente nunca conhece o LLM concreto — apenas o endpoint do BFF.

## Alternativas Consideradas

- **LangChain.js** — runtime pesado, abstrações orientadas a chains/agents, integração React fraca, bundle hostil ao edge.
- **Provider SDKs diretos (`@anthropic-ai/sdk`, `openai`)** — acoplam UI ao provider, sem hooks React, sem protocolo de stream padronizado.
- **`fetch` + EventSource manual** — máximo controle, custo alto: parsing SSE, reconnect, tipagem de tools, cancelamento, gerenciamento de estado tudo manual.
- **Vercel AI SDK 6.0.0** ✓ — hooks React first-class, UI Message Stream Protocol estável, tools tipadas via Zod, AG-UI nativo, neutro de provider, integração ergonômica com Next route handlers.

## Consequências

**Positivas**
- Streaming → UI reativa sem parser SSE manual (`useChat` cuida de retry/cancel).
- Tool calls tipadas → contrato Zod compartilhado com BFF, sem drift.
- Provider swap → trocar Claude/Gemini/GPT no BFF sem tocar UI.
- AG-UI generativa → `parts[]` discriminados renderizam componentes ricos.
- Bundle tree-shakeable, edge-runtime friendly.

**Negativas**
- Acoplamento ao protocolo Vercel UI Message Stream (vendor-specific, embora open-source).
- Major bumps históricos (v3 → v4 → v5 → v6) exigem migration windows controladas.
- Hooks são client-only — RSC streaming exige bridge explícita.

**Riscos aceitos**
- Evolução do protocolo → pinning em minor (`^6.0`); changelog review obrigatório antes de bump.
- Lock-in de hooks → contratos Zod permanecem portáveis entre SDKs.

## Guardrails

- SEMPRE consumir LLM no Frontend via hooks `@ai-sdk/react` (`useChat`, `useObject`); NUNCA `fetch` direto contra endpoint de stream.
- SEMPRE definir tools com schema Zod compartilhado em `packages/contracts`.
- NUNCA importar provider SDK (`@anthropic-ai/sdk`, `openai`) na camada Frontend — apenas o BFF os conhece.
- NUNCA bypass do `transport` customizado para auth/headers — usar a API oficial.
- QUANDO renderizar AG-UI, ENTÃO discriminar `message.parts[]` por `type` antes de renderizar.
- QUANDO bump major, ENTÃO ADR-evolve obrigatória + smoke-test de streaming em CI.

## Enforcement

- [ ] Code review: bloqueia `fetch('/api/chat')` cru e imports de provider SDK fora do BFF.
- [ ] Lint: ESLint regra `no-restricted-imports` proíbe `@anthropic-ai/sdk`, `openai`, `@google/genai` em `apps/web/**`.
- [ ] Teste: Vitest + Testing Library + MSW cobrem `useChat` com mock de UI Message Stream; Playwright cobre cancelamento de stream.
- [ ] Gate PREVC: build CI executa typecheck contra contratos Zod compartilhados; major bump aciona ADR-evolve.

## Evidências / Anexos

**Fontes oficiais:**
- [Vercel AI SDK Docs](https://ai-sdk.dev/docs)
- [@ai-sdk/react Reference](https://ai-sdk.dev/docs/reference/ai-sdk-ui)
- [UI Message Stream Protocol](https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol)
- [Vercel AI SDK GitHub](https://github.com/vercel/ai)

```tsx
// apps/web/features/assistant/ui/chat.tsx — hook tipado, provider-agnostic
"use client";
import { useChat } from "@ai-sdk/react";
import { z } from "zod";

const ToolResultSchema = z.object({ id: z.string(), value: z.number() });

export function Chat() {
  const { messages, input, handleInputChange, handleSubmit, status } = useChat({
    api: "/api/chat",
    onToolCall: async ({ toolCall }) => {
      const parsed = ToolResultSchema.parse(toolCall.input);
      return { id: parsed.id, ok: true };
    },
  });
  return (
    <form onSubmit={handleSubmit}>
      {messages.map((m) =>
        m.parts.map((p, i) =>
          p.type === "text" ? <span key={i}>{p.text}</span> : null
        )
      )}
      <input value={input} onChange={handleInputChange} disabled={status === "streaming"} />
    </form>
  );
}
```
