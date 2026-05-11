---
id: std-datadog-llm-observability
description: Datadog LLM Observability nativo como traces de agentes e tools na camada BFF
version: 1.0.0
applyTo: []
relatedAdrs: ["adr-datadog-llm-observability-bff"]
enforcement:
  linter: standards/machine/std-datadog-llm-observability.js
weakStandardWarning: true
---
# Standard: datadog-llm-observability
## Princípios
Adotar **Datadog LLM Observability nativo** como traces de agentes e tools na camada BFF. SDK `dd-trace` Node com `DD_LLMOBS_ENABLED=1` e `DD_LLMOBS_ML_APP=<app>`. Spans para `llm`, `agent`, `workflow`, `tool`, `retrieval`, `embedding`. Instrumentação automática de Vercel AI SDK v6 e clients OpenAI/Anthropic/Google; instrumentação manual via decorator/`LLMObs.trace()` para tools customizadas, Mastra Workflows e MCP clients. Métricas: latência por span, tokens in/out, custo, taxa de erro, eval scores. Trace correlato com APM trace via `dd.trace_id` propagado em headers para FastAPI downstream.

```
route handler → AI SDK (auto) → Mastra Workflow (manual span)
                              → MCP tool (manual span)
                              → FastAPI (DD APM, mesmo trace_id)
```
## Anti-patterns
| Errado | Certo |
|---|---|
| logar prompt cru sem passar por redactor de PII | Aplicar a alternativa explicitada na ADR (Decisão / Enforcement) |
| criar spans manuais sem `kind` declarado (`agent \| workflow \| llm \| tool \| retrieval \| embedding`) | Aplicar a alternativa explicitada na ADR (Decisão / Enforcement) |
## Linter
`./machine/std-datadog-llm-observability.js` verifica:

1. rejeitar PR sem span manual em tool nova ou workflow novo
2. regra custom Biome bloqueando `console.log` de objeto contendo `prompt` ou `messages`
3. integração com `DD_LLMOBS_AGENTLESS_ENABLED=1` validando shape de span exportado
4. Validation phase verifica `DD_LLMOBS_ENABLED` setado em env de staging/prod

Output em formato `VIOLATION: <regra> (<file>:<line>) — <correção sugerida>` per SI-4 contract.
## Referência
ADRs derivadas:
- adr-datadog-llm-observability-bff (`016-adr-datadog-llm-observability-bff-v1.0.0.md`)
Fontes oficiais (consolidadas das ADRs):

**Fontes oficiais:** [Datadog LLM Observability](https://docs.datadoghq.com/llm_observability/) · [LLM Observability — Node.js SDK](https://docs.datadoghq.com/llm_observability/setup/sdk/nodejs/) · [LLM Observability — Trace Structure](https://docs.datadoghq.com/llm_observability/setup/auto_instrumentation/)
Authoring guide: `.context/standards/README.md`
