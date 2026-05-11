---
id: std-datadog-llm-observability
description: Datadog LLM Observability nativo para traces de agentes e tools na camada BFF
version: 1.0.0
applyTo: []
relatedAdrs: ["adr-datadog-llm-observability-bff"]
enforcement:
  linter: standards/machine/std-datadog-llm-observability.js
weakStandardWarning: true
---
# Standard: datadog-llm-observability
## Princípios
Adotar **Datadog LLM Observability** como camada de tracing e evals da camada BFF. Instrumentação via `dd-trace` (Node) com auto-instrumentation de Vercel AI SDK + decoradores para spans manuais de Mastra Workflows, agentes e tools MCP. Spans LLM emitem `input/output messages`, `model`, `provider`, `total_tokens`, `error`. Trace ID propagado via header W3C `traceparent` para Backend FastAPI. Sampling 100% em dev/staging, head-based em prod. Evals offline via dataset exportado.
## Anti-patterns
| Errado | Certo |
|---|---|
| logar `input/output` LLM completos sem scrubber configurado. | Aplicar a alternativa explicitada na ADR (Decisão / Enforcement) |
| habilitar `DD_LLMOBS_ENABLED=true` em ambiente local sem `DD_SITE` e API key de dev. | Aplicar a alternativa explicitada na ADR (Decisão / Enforcement) |
## Linter
`./machine/std-datadog-llm-observability.js` verifica:

1. bloqueia `console.log` de prompt/response; exige decorator `@observe` ou `LLMObs.trace()` em handlers de agente.
2. regra custom ESLint detectando chamadas a `generateText`/`streamText` sem wrap de tracing.
3. integration test verifica emissão de spans esperados em workflow de exemplo (mock exporter).
4. pipeline valida `DD_LLMOBS_ML_APP` e `DD_API_KEY` em secrets antes do deploy do BFF.
5. Runtime: alerta Datadog em `error_rate > 2%` por agente em janela de 5min.

Output em formato `VIOLATION: <regra> (<file>:<line>) — <correção sugerida>` per SI-4 contract.
## Referência
ADRs derivadas:
- adr-datadog-llm-observability-bff (`016-adr-datadog-llm-observability-bff-v1.0.0.md`)
Fontes oficiais (consolidadas das ADRs):

**Fontes oficiais:**
- [Datadog LLM Observability Setup](https://docs.datadoghq.com/llm_observability/)
- [dd-trace-js LLM Observability SDK](https://docs.datadoghq.com/llm_observability/instrumentation/sdk/?tab=nodejs)
- [W3C Trace Context](https://www.w3.org/TR/trace-context/)
- [OpenTelemetry GenAI Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/)
Authoring guide: `.context/standards/README.md`
