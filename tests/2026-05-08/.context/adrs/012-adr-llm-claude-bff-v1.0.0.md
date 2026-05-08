---
type: adr
name: adr-llm-claude-bff
description: Anthropic Claude (Sonnet 4.6 / Opus 4.6) como provider PT-BR e reasoning na camada BFF
scope: organizational
source: local
stack: Anthropic Claude API
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

# ADR — Anthropic Claude na Camada BFF

- **Data:** 2026-05-08
- **Status:** Aprovado
- **Escopo:** Organizacional
- **Stack:** Anthropic Claude API
- **Categoria:** Arquitetura

## Contexto

Camada BFF: route handlers Next + Vercel AI SDK v6 + Mastra Model Router (LLM-agnostic) + Mastra Workflows/Memory + MCP clients + NXZ Harness. Roteamento entre múltiplos providers (Gemini/Claude/OpenAI) demanda baseline de qualidade em PT-BR, reasoning multi-step e tool use determinístico. Inferência em PT-BR com Sonnet/Opus apresenta menor taxa de alucinação semântica e melhor seguimento de instruções complexas em prompt longo. Workflows multi-step (planejamento → ferramenta → síntese) exigem extended thinking confiável e janela ampla. Necessário fixar provider canônico para tarefas reasoning-heavy mantendo a fronteira de troca via Mastra.

## Decisão

Adotar **Claude Sonnet 4.6** como provider default para tarefas de reasoning e PT-BR no BFF; **Claude Opus 4.6** reservado para extended thinking e tarefas long-horizon. Acesso exclusivamente via `@ai-sdk/anthropic` integrado ao Mastra Model Router — nunca via `@anthropic-ai/sdk` cru fora do harness. Tool use tipado via Zod (`tool({ inputSchema })`); streaming via UI Message Stream Protocol do AI SDK. Server Tools (`web_search`, `code_execution`) habilitadas seletivamente por workflow. API keys exclusivamente do Secret Manager; nunca em env literal.

## Alternativas Consideradas

- **OpenAI GPT-5** — forte em function-calling, latência menor; PT-BR aceitável mas inferior em reasoning longo e seguimento de instruções estruturadas.
- **Google Gemini 2.5 Pro** — janela ampla, multimodal nativo, custo competitivo; reasoning PT-BR menos consistente em chain-of-thought.
- **Modelo único multi-uso (sem router)** — simplicidade operacional, mas perde otimização custo/qualidade por tarefa.
- **Claude Sonnet 4.6 / Opus 4.6** ✓ — reasoning PT-BR superior, tool use estável, extended thinking opcional, integração first-class com AI SDK e Mastra.

## Consequências

**Positivas**
- PT-BR de qualidade default → menos pós-processamento.
- Tool use tipado via Zod → contrato compartilhado com Frontend.
- Extended thinking (Opus) → workflows long-horizon viáveis.
- Mastra Router → swap por tarefa sem mudar handlers.
- Citations e Server Tools → grounding nativo sem orquestração extra.

**Negativas**
- Custo por token superior a Gemini Flash em chamadas curtas.
- Rate limits regionais; workloads burst exigem queueing no harness.
- Acoplamento operacional ao roadmap Anthropic (deprecation de modelos).

**Riscos aceitos**
- Latência p95 em Opus → reservar Opus para tarefas explicitamente assíncronas; Sonnet em síncrono.
- Quota/billing → observabilidade obrigatória (custo por workflow, tokens por sessão).

## Guardrails

- SEMPRE acessar Claude via `@ai-sdk/anthropic` dentro do Mastra Model Router; NUNCA `@anthropic-ai/sdk` direto fora do harness.
- SEMPRE definir tools com `inputSchema: z.object(...)`; NUNCA tool com schema livre.
- NUNCA hardcode de model id em handler — sempre via configuração do router (`tasks.reasoning.default`).
- NUNCA expor `ANTHROPIC_API_KEY` em logs, traces ou client-side bundle.
- QUANDO workflow exigir reasoning > 30s, ENTÃO usar Opus + execução assíncrona (Workflow + Memory).
- QUANDO bump de modelo (ex.: 4.6 → 5.0), ENTÃO ADR-evolve obrigatória + regression suite (golden prompts).

## Enforcement

- [ ] Code review: bloqueia import de `@anthropic-ai/sdk` em `app/api/**`; exige uso do Mastra Router.
- [ ] Lint: ESLint `no-restricted-imports` para `@anthropic-ai/sdk`; regra custom para hardcode de model id.
- [ ] Teste: Vitest com mock do AI SDK Provider cobrindo tool calls; suíte de golden prompts em PT-BR.
- [ ] Gate PREVC: smoke-test contra modelo real em CI nightly; alarme de custo/token via observabilidade.

## Evidências / Anexos

**Fontes oficiais:**
- [Anthropic Claude API Docs](https://docs.anthropic.com/en/api/overview)
- [Anthropic Models](https://docs.anthropic.com/en/docs/about-claude/models)
- [@ai-sdk/anthropic](https://ai-sdk.dev/providers/ai-sdk-providers/anthropic)
- [Mastra Model Routing](https://mastra.ai/docs/agents/agent-overview)
- [Anthropic SDK GitHub](https://github.com/anthropics/anthropic-sdk-typescript)

```ts
// apps/bff/app/api/chat/route.ts — provider via router, tool tipada
import { anthropic } from "@ai-sdk/anthropic";
import { streamText, tool } from "ai";
import { z } from "zod";
import { router } from "@/harness/router";

const fetchResource = tool({
  description: "Busca um Resource pelo id",
  inputSchema: z.object({ id: z.string().uuid() }),
  execute: async ({ id }) => ({ id, value: 42 }),
});

export async function POST(req: Request) {
  const { messages } = await req.json();
  const model = router.pick("reasoning"); // resolve para anthropic("claude-sonnet-4-6")
  const result = streamText({ model, messages, tools: { fetchResource } });
  return result.toUIMessageStreamResponse();
}
```
