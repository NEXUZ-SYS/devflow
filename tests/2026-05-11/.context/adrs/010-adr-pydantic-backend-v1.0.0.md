---
type: adr
name: adr-pydantic-backend
description: Pydantic 2.10.x como schema validation runtime Python na camada Backend
scope: organizational
source: local
stack: Pydantic 2.10
category: qualidade-testes
status: Aprovado
version: 1.0.0
created: 2026-05-11
supersedes: []
refines: []
protocol_contract: null
decision_kind: firm
summary: ""
---

# ADR — Pydantic como schema validation runtime Python no Backend

- **Data:** 2026-05-11
- **Status:** Aprovado
- **Escopo:** Organizacional
- **Stack:** Pydantic 2.10.x
- **Categoria:** Qualidade & Testes

---

## Contexto

Backend FastAPI 0.135 em Cloud Run recebe payloads HTTP, mensagens Pub/Sub, documentos Firestore e linhas BigQuery — todos `dict`/`bytes` na borda. Type-hints Python não validam em runtime. Sem parse forte na fronteira, drift de contrato cross-domain vira `KeyError`/`TypeError` em produção. Pydantic v2 já é dependência transitiva de FastAPI; engine `pydantic-core` (Rust) tornou parse barato.

## Decisão

Adotar **Pydantic 2.10.x** como única biblioteca de validação runtime do Backend. `BaseModel` define todo DTO de borda: request/response FastAPI, envelope Pub/Sub, snapshot Firestore, settings (`BaseSettings`). Modelos canônicos vivem em `app/contexts/<context>/schemas.py`; modelos cross-domain em `app/shared/schemas/**`. `ConfigDict(extra='forbid', frozen=True)` por padrão em DTOs de borda (rejeita drift, imutável). Out: ORM models (não há ORM — Firestore documental).

## Alternativas Consideradas

- **dataclasses + cattrs** — sem validação JSON Schema nativa; integração FastAPI manual.
- **attrs + voluptuous** — duas libs, sem inferência OpenAPI.
- **marshmallow** — schema separado do modelo, dupla manutenção.
- **msgspec** — performance superior, mas ecossistema GCP/FastAPI imaturo em 2026.
- **Pydantic 2.10.x ✓** — engine Rust, integração nativa FastAPI, JSON Schema → OpenAPI, `BaseSettings` para 12-factor.

## Consequências

**Positivas**
- Fronteira tipada em todo I/O → erros em parse, não em handler.
- `pydantic-core` (Rust) → parse ~5-50x mais rápido que v1; aceitável em concurrency 80.
- JSON Schema gerado → OpenAPI exportado para `packages/contracts` (paridade com Zod).
- `BaseSettings` centraliza config + Secret Manager.

**Negativas**
- Migração v1 → v2 deprecou `Config` class, `validator` → `field_validator` (mitigado: greenfield).
- Modelos profundos com `model_validate` repetidos em hot path custam CPU → cache por chave estável.

**Riscos aceitos**
- Drift Zod (Frontend) ↔ Pydantic (Backend) → gate de contratos no CI gera JSON Schema dos dois lados e diffa.

## Guardrails

- SEMPRE definir DTO de borda como `class X(BaseModel): model_config = ConfigDict(extra='forbid', frozen=True)`.
- SEMPRE `Model.model_validate(payload)` ao consumir Pub/Sub/Firestore/BigQuery — nunca tratar `dict` cru.
- NUNCA usar `dict[str, Any]` em assinatura de rota ou handler de subscriber.
- NUNCA misturar regra de domínio em `field_validator` — validators são forma, não regra de negócio.
- QUANDO compartilhar tipo cross-context, ENTÃO promover para `app/shared/schemas/**` e gerar JSON Schema em `packages/contracts`.
- QUANDO ler Secret Manager/env, ENTÃO usar `BaseSettings` tipado; nunca `os.environ[...]` direto.

## Enforcement

- [ ] Code review: todo handler FastAPI tem `response_model`; todo subscriber Pub/Sub faz `model_validate`.
- [ ] Lint: `ruff` regra `PYI`/`ANN` + custom proibindo `dict[str, Any]` em borda; `mypy --strict` no CI.
- [ ] Teste: pytest cobre `model_validate` para válido/inválido/extra-field; factory-boy gera fixtures.
- [ ] Gate CI/PREVC: job `contracts:check` exporta JSON Schema Pydantic + Zod e falha em divergência (fase V).

## Evidências / Anexos

**Fontes oficiais:** [Pydantic — Models](https://docs.pydantic.dev/2.10/concepts/models/) · [Pydantic — Latest](https://docs.pydantic.dev/latest/) · [Pydantic — Settings](https://docs.pydantic.dev/2.10/concepts/pydantic_settings/)

```python
# app/contexts/resources/schemas.py — DTO de borda imutável, extra='forbid'
from pydantic import BaseModel, ConfigDict, Field

class Resource(BaseModel):
    model_config = ConfigDict(extra='forbid', frozen=True)
    id: str = Field(pattern=r'^[0-9a-f-]{36}$')
    name: str = Field(min_length=1, max_length=120)
    kind: str = Field(pattern=r'^(a|b)$')

# uso em subscriber Pub/Sub
def handle(envelope: dict) -> None:
    payload = Resource.model_validate(envelope['data'])
    ...
```
