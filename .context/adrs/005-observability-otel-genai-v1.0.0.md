---
type: adr
name: observability-otel-genai
description: Spans gen_ai.* + devflow.* extension namespace, opt-in via observability.yaml
scope: organizational
source: local
stack: universal
category: infraestrutura
status: Proposto
version: 1.0.0
created: 2026-05-06
supersedes: []
refines: []
protocol_contract: null
decision_kind: gated
summary: "Telemetria opt-in seguindo OTel GenAI semconv (gen_ai.*) + devflow.* extension namespace; reproducibility token via sha256(model+params+lockHash+toolsHash) em todo span; conteúdo (prompts/completions) só com env var explícita + redactPii."
---

# ADR 005 — Observability OTel (GenAI semantic conventions)

- **Data:** 2026-05-06
- **Status:** Proposto
- **Escopo:** Organizacional
- **Stack:** universal
- **Categoria:** Infraestrutura

---

## Contexto

DevFlow v0.13.x não tem observabilidade padronizada — logs ficam em `actions.jsonl` (proprietário) + napkin (free-form). Para projetos NXZ que precisam de auditoria regulatória ou troubleshooting de produção, falta replay determinístico e atributos estruturados. OpenTelemetry GenAI semantic conventions (`gen_ai.*` namespace) é o padrão emergente — Anthropic SDK, LangChain, OpenAI já emitem nele. DevFlow alinhar significa output replicável em Langfuse, Phoenix, Datadog, Honeycomb sem adapter custom.

## Drivers

- **Standardization** — `gen_ai.*` semconv é portável entre coletores (Langfuse, Phoenix, Datadog)
- **Replay** — reproducibility token determinístico permite re-executar turn passado com config alterada (debug/eval)
- **Observability-before-enforcement** — coletar dados antes de adicionar gates (Gate 5 budget enforcement é roadmap v1.1+)
- **Vendor-neutrality** — OTel é OSS, não locked-in a um vendor de telemetria

## Decisão

`.context/observability.yaml` (`spec: devflow-observability/v0`) controla telemetria. Default `enabled: false` (opt-in). Quando habilitado:

- `scripts/lib/otel.mjs` lazy-load `@opentelemetry/sdk-trace-node` + `@opentelemetry/exporter-trace-otlp-http` (deps SÃO permitidas — única exceção à no-deps policy, gated por `enabled: true`)
- Spans emitidos com atributos `gen_ai.*` (per OTel semconv) + `devflow.*` (extension namespace)
- `scripts/lib/repro-token.mjs` computa `sha256(model + params + lockHash + toolDefinitionsHash)` em cada turn
- Prompts/completions REDIGIDOS por default; só capturados quando `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT=1`
- `redactPii: true` aplica strips em emails, IPs, números longos mesmo quando captura habilitada

`decision_kind: gated` porque telemetria toca privacy + cost — gate de revisão futura quando time avaliar custo real e adicionar enforcement (Gate 5).

## Alternativas Consideradas

- **Logging proprietário (status quo)** — rejeitado: não portável, sem replay
- **Vendor lock-in (Langfuse/Phoenix SDK direto)** — rejeitado: trava NXZ a um fornecedor
- **OTel sem GenAI semconv (apenas `service.*`)** — rejeitado: perde a riqueza de `gen_ai.usage.*`, `gen_ai.tool.*` que coletores entendem nativamente
- **Sempre-ligado com sampling baixo** — rejeitado: opt-in evita custo surpresa em projetos sem orçamento de telemetria
- **OTel GenAI semconv + opt-in + redact PII default** ✓ — escolhido: padrão emergente, controle claro, custo-zero quando off

## Consequências

**Positivas**
- Replay determinístico via reproducibility token (`devflow.repro.token` em todo span)
- Output direto em qualquer coletor OTel-compatível (Langfuse, Phoenix, Datadog, Jaeger, etc.)
- Telemetria opt-in: zero custo quando off; SDK não carregado
- `redactPii: true` por default reduz superfície de leak quando captura habilitada

**Negativas**
- 2 deps OTel adicionadas ao `package.json` futuro (lazy-loaded só quando enabled) — única exceção à no-deps policy
- Span emission adiciona ~1-3ms por hook quando enabled (OTLP HTTP é assíncrono)
- Capture de prompts/completions é opt-in via env var — operadores podem esquecer e ter trace incompleto

**Riscos aceitos**
- Coletor mal-configurado pode receber prompt content via env var (mitigação: redactPii, gating explícito)
- Custo de OTLP collector pode escalar em projetos high-traffic (mitigação: `sampling.default` configurável; gate de cost no roadmap)

## Guardrails

- SEMPRE manter `enabled: false` como default no template
- SEMPRE manter `gen_ai.prompt` e `gen_ai.completion` em `attributes.redact[]` por default
- SEMPRE injetar `devflow.repro.token` em todo span quando enabled
- SEMPRE redact best-effort PII (emails, IPv4, sequências numéricas ≥9 dígitos) quando `redactPii: true` E content capture habilitada — NÃO é PCI/PHI-grade scrubbing; operadores em ambientes regulados DEVEM usar scrubber externo (e.g., Datadog Sensitive Data Scanner) e/ou manter `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT` desabilitada
- NUNCA carregar OTel SDK quando `enabled: false` (lazy-load gate)
- NUNCA logar token API ou OAuth credentials mesmo com content capture
- QUANDO `callback.url` em `permissions.yaml` é configurado, ENTÃO span deve registrar `devflow.permission.callback_invoked` para audit trail
- QUANDO `decision_kind: gated` neste ADR, ENTÃO upgrade para Aprovado requer revisão de privacy + cost com time

## Enforcement

- [ ] Lint: schema validator em `scripts/lib/otel.mjs:validateObservabilityConfig` rejeita `enabled: true` sem `exporter.endpoint`
- [ ] Test: `tests/validation/test-otel.mjs` cobre 6 cenários (disabled no-op, enabled lazy-load, gen_ai.* attributes, devflow.* attributes, prompts redacted by default, content capture opt-in respeita redactPii)
- [ ] Test: `tests/validation/test-repro-token.mjs` verifica determinismo + uniqueness
- [ ] Code review: PRs adicionando atributos `devflow.*` requerem documentação em `references/otel-attributes.md` (criar quando 5+ atributos custom)
- [ ] Gate CI/PREVC: `devflow context verify --include=observability` checa schema válido + endpoint reachable quando enabled

## Evidências / Anexos

- Plano: `.context/plans/context-layer-v2.md` Task Groups 4.0-4.3
- Spec original: `docs/devflow-context-layer-validation-v2-pt-br.md` §5.5
- OTel GenAI semconv: https://opentelemetry.io/docs/specs/semconv/gen-ai/
- Reference: `scripts/lib/otel.mjs` (4.1), `scripts/lib/repro-token.mjs` (4.2)
- ADRs relacionadas: ADR-001 (path), ADR-002 (standards), ADR-003 (stacks), ADR-004 (permissions)
