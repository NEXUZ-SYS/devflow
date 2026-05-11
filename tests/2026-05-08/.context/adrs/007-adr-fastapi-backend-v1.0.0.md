---
type: adr
name: adr-fastapi-backend
description: FastAPI 0.135.x como framework Python async da camada Backend (monolito modular em Cloud Run)
scope: organizational
source: local
stack: FastAPI 0.135.x
category: arquitetura
status: Aprovado
version: 1.0.0
created: 2026-05-08
supersedes: []
refines: []
protocol_contract: null
decision_kind: firm
summary: ""
---

# ADR — FastAPI 0.135.x na Camada Backend

- **Data:** 2026-05-08
- **Status:** Aprovado
- **Escopo:** Organizacional
- **Stack:** FastAPI
- **Categoria:** Arquitetura

## Contexto

Camada Backend: Python 3.13 + Pydantic 2.10 + Pub/Sub + Firestore Admin SDK + BigQuery + Secret Manager. Monolito modular em Cloud Run (concurrency 80, min-instances > 0) com 6 bounded contexts coexistindo no mesmo deployable. Carga é mista I/O-bound (Firestore, Pub/Sub, HTTP outbound) com janelas de fan-out. Necessário framework ASGI nativo, validação tipada ponta-a-ponta (Pydantic ↔ HTTP boundary), DI explícita, OpenAPI gerado a partir do schema e ergonomia para AI-first (sinal denso de tipos e dependências para LLM).

## Decisão

Adotar **FastAPI 0.135.x** como framework HTTP/ASGI exclusivo da camada Backend. Servido por **Uvicorn** (workers=1, concurrency via async). Bounded contexts em módulos `svc-*` com **APIRouter** isolado por contexto e composição em `app.main`. **Pydantic 2.10** como única fonte de schemas request/response. **Dependency Injection** via `Depends` (autenticação, transações, clients GCP). Lifespan handler para warm-up de pools. OpenAPI 3.1 gerado e publicado em `/openapi.json`.

## Alternativas Consideradas

- **Django REST Framework** — maduro, porém sync-first, ORM acoplado, latência alta para I/O concorrente, OpenAPI via plugin.
- **Flask + extensões** — minimalista, sem async nativo robusto até v3, validação ad-hoc, OpenAPI manual.
- **Litestar** — async nativo e bem desenhado, ecossistema/comunidade menor, integrações GCP menos cobertas.
- **Starlette puro** — ASGI minimal, exige construir validação/DI/OpenAPI manualmente.
- **FastAPI 0.135.x** ✓ — async nativo, integração 1:1 com Pydantic v2, DI tipada, OpenAPI 3.1 automático, ecossistema amplo.

## Consequências

**Positivas**
- Type safety end-to-end (HTTP boundary ↔ Pydantic ↔ domínio).
- OpenAPI gerado → contratos consumíveis pelo BFF e ferramental de teste.
- Async I/O escala em Cloud Run com concurrency 80 sem thread pool.
- DI explícita facilita testes unitários e integração com `testcontainers`.

**Negativas**
- Pegadinhas de mistura sync/async (chamadas bloqueantes degradam loop).
- Custo de partida cold mais alto que Flask puro → mitigado por `min-instances > 0`.
- Pydantic 2 é hot-path; schemas mal projetados impactam p99.

**Riscos aceitos**
- Acoplamento à evolução da API FastAPI/Starlette → pinning minor + smoke-tests no CI.
- Risco de monolito virar god-app → enforcement de boundaries por imports e CI gate.

## Guardrails

- SEMPRE declarar request/response com modelos Pydantic; NUNCA `dict` cru em endpoint público.
- SEMPRE encapsular acesso cross-context via Pub/Sub publisher; NUNCA importar módulo de outro `svc-*` diretamente.
- SEMPRE `async def` em endpoints I/O-bound; NUNCA chamar SDK síncrono dentro de handler async sem `run_in_threadpool`.
- NUNCA expor `Exception` genérica em response; usar exception handlers tipados.
- QUANDO endpoint depender de cliente GCP, ENTÃO injetar via `Depends` com singleton no lifespan.
- QUANDO publicar mudança de schema, ENTÃO bump de versão da rota (`/v{n}`) ou campo opcional retrocompatível.

## Enforcement

- [ ] Code review: bloqueia chamadas cross-context, `dict` em response, `Exception` genérica.
- [ ] Lint: `ruff check` + `ruff format`; regras `ASYNC*` ativas; `mypy --strict` no diff.
- [ ] Teste: `pytest` + `httpx.AsyncClient`; cobertura mínima por `svc-*` no CI.
- [ ] Build CI: `uv sync` + `uvicorn --check`; smoke `/openapi.json` válido.
- [ ] Gate PREVC: contract diff (OpenAPI) revisado antes do merge.

## Evidências / Anexos

**Fontes oficiais:**
- [FastAPI Docs](https://fastapi.tiangolo.com/)
- [FastAPI Release Notes](https://github.com/fastapi/fastapi/releases)
- [Starlette ASGI](https://www.starlette.io/)
- [Pydantic v2 Docs](https://docs.pydantic.dev/2.10/)
- [Uvicorn](https://www.uvicorn.org/)

```python
# svc_resource/api.py — boundary tipado, DI explícita
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

router = APIRouter(prefix="/v1/resources", tags=["resource"])


class Resource(BaseModel):
    id: str = Field(min_length=1)
    name: str = Field(min_length=1)


async def get_repo() -> "ResourceRepo":
    ...  # injetado no lifespan


@router.get("/{resource_id}", response_model=Resource)
async def read_resource(
    resource_id: str,
    repo: "ResourceRepo" = Depends(get_repo),
) -> Resource:
    item = await repo.get(resource_id)
    if item is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not found")
    return item
```
