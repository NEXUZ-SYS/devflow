---
type: adr
name: adr-llm-claude-bff
description: Anthropic Claude Sonnet 4.6 / Opus 4.6 como provider PT-BR e reasoning na camada BFF
scope: organizational
source: local
stack: Anthropic Claude API
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

# ADR — Claude Sonnet 4.6 / Opus 4.6 como Provider PT-BR e Reasoning no BFF

- **Data:** 2026-05-11
- **Status:** Aprovado
- **Escopo:** Organizacional
- **Stack:** Anthropic Claude API
- **Categoria:** Arquitetura

---

## Contexto

BFF (route handlers Next) orquestra LLMs via Mastra Model Router para múltiplas tarefas: reasoning multi-step, ferramentas via MCP, geração estruturada (tool use), respostas em português brasileiro. Provider único acopla o sistema; estratégia multi-provider exige um modelo principal com forte fidelidade PT-BR, raciocínio long-context (>100k) e tool use confiável. Necessário definir o provider canônico para reasoning e fallback hierárquico.

## Decisão

Adotar **Anthropic Claude** como provider primário para reasoning e PT-BR no BFF. **Sonnet 4.6** default (latência/custo); **Opus 4.6** para reasoning complexo (planning, multi-step tool use). Acesso exclusivo via Mastra Model Router (`@ai-sdk/anthropic` provider) — nunca SDK Anthropic direto em route handlers. Streaming + tool use via protocolo AG-UI exposto ao Frontend.

```
app/api/<slice>/route.ts                → streamText({ model: router.select('reasoning') })
packages/router/src/providers/          → anthropic.ts (Sonnet 4.6 + Opus 4.6)
packages/router/src/policies/           → escolha por task: 'reasoning' | 'cheap' | 'pt-br'
packages/contracts/llm/                 → Zod schemas de tool input/output
```

## Alternativas Consideradas

- **OpenAI GPT-5 only** — forte em geral; PT-BR aceitável; menor janela de reasoning interpretável.
- **Gemini 2.5 only** — long-context excelente; tool use menos previsível; PT-BR variável.
- **Llama 3.x self-hosted** — controle total; custo de infra + latência inviáveis para reasoning.
- **Claude Sonnet 4.6 + Opus 4.6 via router** ✓ — PT-BR superior, reasoning long-context, tool use estável, escapatória a outros providers via router.

## Consequências

**Positivas**
- PT-BR de alta fidelidade em prompts e outputs
- Reasoning multi-step + tool use estáveis em produção
- Long-context (200k) reduz necessidade de RAG agressivo
- Router permite degradação para Gemini/OpenAI sem refactor

**Negativas**
- Custo por token superior a Gemini Flash em tarefas simples (mitigado por policy 'cheap' → Gemini)
- Rate limits exigem queue/retry no router
- Vendor risk (mitigado pelo router multi-provider)

**Riscos aceitos**
- Mudanças de naming/pricing de modelos → revisão trimestral do router
- Latência p95 maior que Gemini Flash → uso restrito a tasks de reasoning

## Guardrails

- SEMPRE chamar LLM via Mastra Router; NUNCA importar `@anthropic-ai/sdk` em route handlers
- SEMPRE declarar policy (`reasoning` | `cheap` | `pt-br`) ao selecionar modelo
- NUNCA hardcode de modelo (`claude-sonnet-4-6`) fora de `packages/router/src/providers/`
- NUNCA expor `ANTHROPIC_API_KEY` a código client-side ou logs
- QUANDO task exigir planning multi-step, ENTÃO policy `reasoning` (Opus 4.6)
- QUANDO tool use estruturado, ENTÃO schema Zod em `packages/contracts/llm`

## Enforcement

- [ ] Code review: rejeitar `import` direto de `@anthropic-ai/sdk` fora do router
- [ ] Lint: regra `no-restricted-imports` proíbe SDK Anthropic em `app/api/**`
- [ ] Teste: contract tests do router validam policies → modelos; mocks de provider via MSW
- [ ] Gate CI/PREVC: secret scan bloqueia commit com `sk-ant-`; observability layer captura latência/custo por policy

## Evidências / Anexos

**Fontes oficiais:** [Anthropic — Welcome](https://docs.anthropic.com/en/docs/welcome) · [Anthropic API — Getting Started](https://docs.anthropic.com/en/api/getting-started) · [Vercel AI SDK — Anthropic Provider](https://ai-sdk.dev/providers/ai-sdk-providers/anthropic)

```ts
// exemplo minimal — route handler BFF consumindo Claude via Mastra Router
import { streamText } from 'ai';
import { router } from '@nxz/router';
import { z } from 'zod';

const ResourceToolSchema = z.object({ id: z.string().uuid() });

export async function POST(req: Request) {
  const { messages } = await req.json();
  const result = await streamText({
    model: router.select('reasoning'), // Opus 4.6
    messages,
    tools: {
      fetchResource: { parameters: ResourceToolSchema },
    },
  });
  return result.toAIStreamResponse();
}
```
