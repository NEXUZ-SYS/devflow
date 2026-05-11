---
type: adr
name: adr-datadog-llm-observability-bff
description: Datadog LLM Observability nativo como traces de agentes e tools na camada BFF
scope: organizational
source: local
stack: Datadog LLM Observability
category: infraestrutura
status: Aprovado
version: 1.0.0
created: 2026-05-11
supersedes: []
refines: []
protocol_contract: null
decision_kind: firm
summary: ""
---

# ADR — Datadog LLM Observability como Tracing de Agentes e Tools no BFF

- **Data:** 2026-05-11
- **Status:** Aprovado
- **Escopo:** Organizacional
- **Stack:** Datadog LLM Observability
- **Categoria:** Infraestrutura

---

## Contexto

Route handlers Next orquestram Mastra Model Router (Gemini/Claude/OpenAI), Mastra Workflows, Mastra Memory e MCP clients. Cada turno gera cadeia LLM → tool-call → LLM, com fan-out para MCP servers e Firestore Admin. Logs estruturados não capturam latência por span, custo por token, falha de tool ou drift de prompt. Sem tracing nativo de LLM, regressões em qualidade/latência só aparecem em produção. AI-first exige feedback loop curto entre prompt, tool invocation e outcome.

## Decisão

Adotar **Datadog LLM Observability nativo** como traces de agentes e tools na camada BFF. SDK `dd-trace` Node com `DD_LLMOBS_ENABLED=1` e `DD_LLMOBS_ML_APP=<app>`. Spans para `llm`, `agent`, `workflow`, `tool`, `retrieval`, `embedding`. Instrumentação automática de Vercel AI SDK v6 e clients OpenAI/Anthropic/Google; instrumentação manual via decorator/`LLMObs.trace()` para tools customizadas, Mastra Workflows e MCP clients. Métricas: latência por span, tokens in/out, custo, taxa de erro, eval scores. Trace correlato com APM trace via `dd.trace_id` propagado em headers para FastAPI downstream.

```
route handler → AI SDK (auto) → Mastra Workflow (manual span)
                              → MCP tool (manual span)
                              → FastAPI (DD APM, mesmo trace_id)
```

## Alternativas Consideradas

- **OpenTelemetry GenAI semantic conventions + OTel Collector → Datadog OTLP** — vendor-neutral; falta UI de evals, replay de prompt e cost analytics; conventions GenAI ainda em experimental.
- **LangSmith** — feature parity em traces; outro vendor, sem unificação com APM/logs/RUM do resto da plataforma.
- **Langfuse self-hosted** — open-source; custo operacional (Postgres + Clickhouse) e duplicação de stack de observabilidade.
- **Datadog LLM Observability nativo** ✓ — unifica APM, logs, RUM e LLM no mesmo trace; evals, prompt replay e cost analytics nativos.

## Consequências

**Positivas**
- Trace fim-a-fim único (Frontend RUM → BFF LLM → Backend APM)
- Métricas de custo/token/latência por agente, workflow e tool
- Eval framework nativo (hallucination, toxicity, custom)
- Prompt versioning e replay direto da UI
- Correlação com logs/erros sem join manual

**Negativas**
- Vendor lock-in (telemetria em formato proprietário)
- Custo por ingest scale com tokens trafegados
- SDK adiciona overhead em cold-start de route handler serverless

**Riscos aceitos**
- PII em prompts → escrubbing via `DD_LLMOBS_PROMPT_TEMPLATE` allowlist e redaction antes do `LLMObs.annotate`

## Guardrails

- SEMPRE inicializar SDK em arquivo de bootstrap único (`instrumentation.ts`), antes do primeiro `import` que use LLM
- SEMPRE marcar span de tool com `LLMObs.annotate({ input_data, output_data, metadata })`
- SEMPRE propagar `dd.trace_id` em headers para chamadas downstream FastAPI
- NUNCA logar prompt cru sem passar por redactor de PII
- NUNCA criar spans manuais sem `kind` declarado (`agent | workflow | llm | tool | retrieval | embedding`)
- QUANDO eval roda em CI, ENTÃO publicar via `LLMObs.submit_evaluation()` com `metric_type` e `score`

## Enforcement

- [ ] Code review: rejeitar PR sem span manual em tool nova ou workflow novo
- [ ] Lint: regra custom Biome bloqueando `console.log` de objeto contendo `prompt` ou `messages`
- [ ] Teste: integração com `DD_LLMOBS_AGENTLESS_ENABLED=1` validando shape de span exportado
- [ ] Gate CI/PREVC: Validation phase verifica `DD_LLMOBS_ENABLED` setado em env de staging/prod

## Evidências / Anexos

**Fontes oficiais:** [Datadog LLM Observability](https://docs.datadoghq.com/llm_observability/) · [LLM Observability — Node.js SDK](https://docs.datadoghq.com/llm_observability/setup/sdk/nodejs/) · [LLM Observability — Trace Structure](https://docs.datadoghq.com/llm_observability/setup/auto_instrumentation/)

```ts
// exemplo minimal — span manual de tool no BFF
import tracer from 'dd-trace';
tracer.init();
import { LLMObs } from 'dd-trace/llmobs';

export async function callTool(input: { resourceId: string }) {
  return LLMObs.tool('fetch_resource', async (span) => {
    LLMObs.annotate(span, { input_data: input });
    const result = await fetchResource(input.resourceId);
    LLMObs.annotate(span, { output_data: result, metadata: { latency_ms: result.t } });
    return result;
  });
}
```
