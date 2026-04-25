---
type: adr
name: logging-strategy
description: Estratégia de logging estruturado para serviços backend
scope: organizational
source: local
stack: TypeScript
category: infraestrutura
status: Proposto
version: 0.1.0
created: 2026-04-24
supersedes: []
refines: []
protocol_contract: null
decision_kind: firm
---

# ADR — Logging estruturado

- **Data:** 2026-04-24
- **Status:** Proposto
- **Escopo:** Organizacional
- **Stack:** TypeScript
- **Categoria:** Infraestrutura

---

## Contexto

Logs atuais em text plain. Difícil agregação. Observability limitada.

## Decisão

Pino como logger padrão, output JSON, shipping para Loki via Promtail.

## Alternativas Consideradas

- **Winston** — mais maduro, mais lento
- **Bunyan** — descontinuado
- **Pino** ✓ — alta performance, JSON nativo

## Consequências

**Positivas**
- Queries estruturadas no Grafana
- Correlação por traceId

**Negativas**
- Migração de 15 serviços legados

**Riscos aceitos**
- Volume pode crescer → reter 30 dias

## Guardrails

- SEMPRE seguir boas práticas de logging
- Ter cuidado com dados sensíveis
- Considerar performance ao logar

## Enforcement

- [ ] Code review: verificar uso de Pino

## Evidências / Anexos

**Fontes oficiais:** [Pino docs](https://getpino.io)

```typescript
import pino from 'pino';
const log = pino();
log.info({ userId, action: 'login' }, 'user logged in');
```
