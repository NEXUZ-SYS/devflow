---
id: std-pydantic
description: Pydantic 2.10.x como schema validation runtime Python na camada Backend
version: 1.0.0
applyTo: ["**/*.py"]
relatedAdrs: ["adr-pydantic-backend"]
enforcement:
  linter: standards/machine/std-pydantic.js
weakStandardWarning: true
---
# Standard: pydantic
## Princípios
Adotar **Pydantic 2.10.x** como única biblioteca de validação runtime do Backend. `BaseModel` define todo DTO de borda: request/response FastAPI, envelope Pub/Sub, snapshot Firestore, settings (`BaseSettings`). Modelos canônicos vivem em `app/contexts/<context>/schemas.py`; modelos cross-domain em `app/shared/schemas/**`. `ConfigDict(extra='forbid', frozen=True)` por padrão em DTOs de borda (rejeita drift, imutável). Out: ORM models (não há ORM — Firestore documental).
## Anti-patterns
| Errado | Certo |
|---|---|
| usar `dict[str, Any]` em assinatura de rota ou handler de subscriber. | Aplicar a alternativa explicitada na ADR (Decisão / Enforcement) |
| misturar regra de domínio em `field_validator` — validators são forma, não regra de negócio. | Aplicar a alternativa explicitada na ADR (Decisão / Enforcement) |
## Linter
`./machine/std-pydantic.js` verifica:

1. todo handler FastAPI tem `response_model`; todo subscriber Pub/Sub faz `model_validate`.
2. `ruff` regra `PYI`/`ANN` + custom proibindo `dict[str, Any]` em borda; `mypy --strict` no CI.
3. pytest cobre `model_validate` para válido/inválido/extra-field; factory-boy gera fixtures.
4. job `contracts:check` exporta JSON Schema Pydantic + Zod e falha em divergência (fase V).

Output em formato `VIOLATION: <regra> (<file>:<line>) — <correção sugerida>` per SI-4 contract.
## Referência
ADRs derivadas:
- adr-pydantic-backend (`010-adr-pydantic-backend-v1.0.0.md`)
Fontes oficiais (consolidadas das ADRs):

**Fontes oficiais:** [Pydantic — Models](https://docs.pydantic.dev/2.10/concepts/models/) · [Pydantic — Latest](https://docs.pydantic.dev/latest/) · [Pydantic — Settings](https://docs.pydantic.dev/2.10/concepts/pydantic_settings/)
Authoring guide: `.context/standards/README.md`
