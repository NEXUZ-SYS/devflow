---
type: adr
name: adr-zod-frontend
description: Zod 4.1.x como schema validation runtime no Frontend
scope: organizational
source: local
stack: Zod 4.1
category: qualidade-testes
status: Aprovado
version: 1.0.0
created: 2026-05-11
decision_kind: firm
---

# ADR — Zod no Frontend

## Contexto

Tipos TS apagam em runtime; borda externa precisa de parse.

## Decisão

Adotar Zod 4.1.x. Todo schema em packages/contracts.

## Guardrails

- SEMPRE Schema.parse na borda externa antes de tocar lógica.
- NUNCA z.any() ou z.unknown() fora de packages/contracts/internal/**.

## Enforcement

- [ ] Code review: parse na primeira linha após I/O.
- [ ] Lint: ESLint custom proibindo z.any().
