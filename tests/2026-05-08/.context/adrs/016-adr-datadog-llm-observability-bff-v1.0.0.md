---
type: adr
name: adr-datadog-llm-observability-bff
description: Datadog LLM Observability nativo para traces de agentes e tools na camada BFF
scope: organizational
source: local
stack: Datadog LLM Observability
category: infraestrutura
status: Aprovado
version: 1.0.0
created: 2026-05-08
supersedes: []
refines: []
protocol_contract: null
decision_kind: firm
summary: ""
---

# ADR — Datadog LLM Observability na Camada BFF

- **Data:** 2026-05-08
- **Status:** Aprovado
- **Escopo:** Organizacional
- **Stack:** Datadog LLM Observability
- **Categoria:** Infraestrutura

## Contexto

Camada BFF: route handlers Next + Vercel AI SDK v6 + Mastra Model Router (LLM-agnostic) + Mastra Workflows + MCP clients + NXZ Harness. Orquestração multi-step: workflow → tool calls → LLM provider (Gemini/Claude/OpenAI) → MCP server → resposta. Sem instrumentação dedicada, falhas de tool, drift de prompt, custo por request e latência por modelo ficam opacos. Logs estruturados isolados não correlacionam spans de agente. Necessário tracing distribuído com semântica LLM-aware (token usage, model/provider, tool I/O, eval) e correlação OpenTelemetry com APM existente.

## Decisão

Adotar **Datadog LLM Observability** como camada de tracing e evals da camada BFF. Instrumentação via `dd-trace` (Node) com auto-instrumentation de Vercel AI SDK + decoradores para spans manuais de Mastra Workflows, agentes e tools MCP. Spans LLM emitem `input/output messages`, `model`, `provider`, `total_tokens`, `error`. Trace ID propagado via header W3C `traceparent` para Backend FastAPI. Sampling 100% em dev/staging, head-based em prod. Evals offline via dataset exportado.

## Alternativas Consideradas

- **OpenTelemetry puro + backend genérico (Tempo/Jaeger)** — semântica LLM ausente, sem evals nativos, custo de modelagem manual de spans.
- **Langfuse self-hosted** — bom para LLM, mas duplica APM já consolidado; operação extra de Postgres/ClickHouse.
- **LangSmith** — vendor-lock em LangChain; integração frágil com Vercel AI SDK + Mastra.
- **Datadog LLM Observability** ✓ — semântica LLM nativa, integração com APM/RUM/Logs, OTel-compatível, evals e drift detection prontos.

## Consequências

**Positivas**
- Trace end-to-end: UI → BFF → LLM → tool MCP → Backend, com token usage e custo por span.
- Correlação automática com APM Node + RUM frontend + Logs estruturados.
- Evals (relevance, faithfulness, toxicity) sem pipeline custom.
- Drift e regressão de prompt detectáveis via dataset versionado.

**Negativas**
- Custo proporcional ao volume de spans LLM (mitigado por sampling).
- Acoplamento ao SaaS — exfil de prompts/respostas para Datadog.
- Overhead de PII scrubbing obrigatório antes do envio.

**Riscos aceitos**
- Vendor lock-in parcial — mitigado por OTel exporter dual em camada de adapter.
- Latência adicional (~5-15ms) por span — aceitável fora do hot path crítico.

## Guardrails

- SEMPRE instrumentar tool calls, workflow steps e LLM completions com spans nomeados (`agent.<name>`, `tool.<name>`, `workflow.<name>`).
- SEMPRE redact PII (`email`, `cpf`, `token`, `apiKey`) antes de emitir `input/output` em spans.
- SEMPRE propagar `traceparent` ao chamar Backend FastAPI ou MCP servers.
- NUNCA logar `input/output` LLM completos sem scrubber configurado.
- NUNCA habilitar `DD_LLMOBS_ENABLED=true` em ambiente local sem `DD_SITE` e API key de dev.
- QUANDO span exceder 30s ou tool falhar, ENTÃO emitir `error.type` + `error.message` no span.

## Enforcement

- [ ] Code review: bloqueia `console.log` de prompt/response; exige decorator `@observe` ou `LLMObs.trace()` em handlers de agente.
- [ ] Lint: regra custom ESLint detectando chamadas a `generateText`/`streamText` sem wrap de tracing.
- [ ] Teste: integration test verifica emissão de spans esperados em workflow de exemplo (mock exporter).
- [ ] Gate CI/PREVC: pipeline valida `DD_LLMOBS_ML_APP` e `DD_API_KEY` em secrets antes do deploy do BFF.
- [ ] Runtime: alerta Datadog em `error_rate > 2%` por agente em janela de 5min.

## Evidências / Anexos

**Fontes oficiais:**
- [Datadog LLM Observability Setup](https://docs.datadoghq.com/llm_observability/)
- [dd-trace-js LLM Observability SDK](https://docs.datadoghq.com/llm_observability/instrumentation/sdk/?tab=nodejs)
- [W3C Trace Context](https://www.w3.org/TR/trace-context/)
- [OpenTelemetry GenAI Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/)

```typescript
// app/api/agents/route.ts — boundary BFF instrumentado
import { LLMObs } from "dd-trace";
import { generateText } from "ai";

export async function POST(req: Request) {
  return LLMObs.trace({ name: "agent.resource-resolver", kind: "agent" }, async (span) => {
    const { input } = await req.json();
    span.annotate({ inputData: scrubPII(input), tags: { provider: "gemini" } });

    const { text, usage } = await generateText({ model, prompt: input });
    span.annotate({ outputData: scrubPII(text), metrics: { totalTokens: usage.totalTokens } });

    return Response.json({ text });
  });
}
```
