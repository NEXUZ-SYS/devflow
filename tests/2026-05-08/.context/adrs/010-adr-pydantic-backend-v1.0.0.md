---
type: adr
name: adr-pydantic-backend
description: Pydantic 2.10.x como schema validation runtime Python da camada Backend (HTTP boundary, eventos, configs)
scope: organizational
source: local
stack: Pydantic 2.10.x
category: qualidade-testes
status: Aprovado
version: 1.0.0
created: 2026-05-08
supersedes: []
refines: []
protocol_contract: null
decision_kind: firm
summary: ""
---

# ADR — Pydantic 2.10.x na Camada Backend

- **Data:** 2026-05-08
- **Status:** Aprovado
- **Escopo:** Organizacional
- **Stack:** Pydantic
- **Categoria:** Qualidade & Testes

## Contexto

Camada Backend: Python 3.13 + FastAPI 0.135 + Pub/Sub + Firestore Admin SDK + BigQuery + Secret Manager. Monolito modular Cloud Run com 6 bounded contexts. Validação tipada é exigida em **toda fronteira**: HTTP request/response (FastAPI), payloads de **eventos Pub/Sub**, configurações via env (Secret Manager), DTOs de integração e leituras de Firestore. Tipos `dataclass`/`TypedDict` não validam runtime; `marshmallow` e `attrs` exigem hand-rolling. Necessário core de validação rápido (Rust), JSON Schema gerável, integração 1:1 com FastAPI e ergonomia para AI-first (sinal de tipo denso para LLM).

## Decisão

Adotar **Pydantic 2.10.x** como biblioteca exclusiva de **validação runtime** e **definição de schemas** da camada Backend. Modelos vivem em `svc-<context>/schemas/` (locais) e em `packages/contracts` (compartilhados, pareados com YAML). FastAPI usa `BaseModel` para request/response. Eventos Pub/Sub validados com `model_validate_json` na borda do subscriber. Configs via `pydantic-settings` lendo Secret Manager + env. JSON Schema exportado via `model_json_schema()` para contract-tests com o BFF.

## Alternativas Consideradas

- **dataclasses + manual checks** — sem validação runtime, drift entre tipo e dado real, ergonomia baixa.
- **attrs + cattrs** — flexível, porém menor integração com FastAPI e JSON Schema custoso.
- **marshmallow** — robusto em validação, sintaxe verbosa, sem inferência de tipo nativa.
- **msgspec** — performance excelente, ecossistema/integrações limitadas (sem `pydantic-settings`, FastAPI parcial).
- **TypedDict + manual validators** — sem coerção, sem JSON Schema, sem ergonomia para erros estruturados.
- **Pydantic 2.10.x** ✓ — core em Rust (`pydantic-core`), integração nativa com FastAPI, JSON Schema 2020-12, `pydantic-settings` cobre config/secret loading.

## Consequências

**Positivas**
- Validação rápida em hot-path (core Rust) → headroom em endpoints com p99 apertado.
- Schema único: classe Python ↔ JSON Schema ↔ OpenAPI gerado pelo FastAPI.
- `model_validate_json` evita parse duplo em eventos Pub/Sub.
- `pydantic-settings` centraliza config com tipos, validators e fontes plugáveis.

**Negativas**
- Migração v1→v2 quebra hábitos (`Config` → `model_config`, validators reescritos).
- Modelos pesados (validators custosos) impactam latência se aplicados em loops.
- Erros de validação em produção viram 422 → exigem tratamento explícito por contexto.

**Riscos aceitos**
- Acoplamento ao Pydantic em DTOs internos → mitigado por fronteira em `packages/contracts` para schemas externos.
- Pinning minor estrito → mudanças breaking de 2.x mitigadas com smoke-tests no CI.

## Guardrails

- SEMPRE definir entrada/saída de endpoint, evento e config com `BaseModel` ou `BaseSettings`.
- SEMPRE `model_config = ConfigDict(extra="forbid", frozen=True)` em DTOs externos; mutáveis apenas em entidades de domínio justificadas.
- SEMPRE usar `field_validator` / `model_validator` (modo `"after"` por padrão) — NUNCA validar em construtor.
- NUNCA expor `BaseModel` interno como response sem schema dedicado (separar `*Read` / `*Create` / `*Update`).
- NUNCA usar `Any` em campo público; preferir `union` discriminada ou `Literal`.
- QUANDO validar evento Pub/Sub, ENTÃO `Model.model_validate_json(message.data)` no subscriber, antes de qualquer side-effect.
- QUANDO ler config, ENTÃO `Settings()` no lifespan; NUNCA `os.environ` direto em handler.

## Enforcement

- [ ] Code review: bloqueia `Any`, `extra="allow"` em DTO público, response com modelo interno.
- [ ] Lint: `ruff` regras `PYI`, `B`, `RUF`; `mypy --strict` com plugin `pydantic.mypy`.
- [ ] Teste: `pytest` com fixtures `factory-boy` por modelo crítico; casos válidos + inválidos.
- [ ] Build CI: export de `model_json_schema()` comparado a snapshot; diff exige aprovação.
- [ ] Gate PREVC: contract diff revisado; bump major em `packages/contracts` quando breaking.

## Evidências / Anexos

**Fontes oficiais:**
- [Pydantic v2 Docs](https://docs.pydantic.dev/2.10/)
- [Pydantic GitHub](https://github.com/pydantic/pydantic)
- [pydantic-core (Rust)](https://github.com/pydantic/pydantic-core)
- [pydantic-settings](https://docs.pydantic.dev/latest/concepts/pydantic_settings/)
- [FastAPI + Pydantic](https://fastapi.tiangolo.com/python-types/#pydantic-models)

```python
# svc_resource/schemas.py — DTOs externos imutáveis, validação na borda
from datetime import datetime
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator


class ResourceCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    name: str = Field(min_length=1, max_length=120)
    kind: Literal["alpha", "beta"]


class ResourceRead(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    id: str
    name: str
    kind: Literal["alpha", "beta"]
    created_at: datetime

    @field_validator("id")
    @classmethod
    def _id_not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("id must not be blank")
        return v
```
