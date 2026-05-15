---
type: adr
name: adr-pydantic-backend
description: Pydantic 2.x validação runtime no Backend
scope: organizational
source: local
stack: Pydantic 2.x
category: backend
status: Aprovado
version: 1.0.0
created: 2026-05-11
decision_kind: firm
---

# ADR — Pydantic

## Decisão

Adotar Pydantic 2.x para schemas de I/O.

## Guardrails

- SEMPRE Model.model_validate em handlers.
- QUANDO criar DTO, ENTÃO derivar de BaseModel.

## Enforcement

- [ ] Pytest cobre roundtrip de schemas.
- [ ] mypy --strict bloqueia merge em drift.
