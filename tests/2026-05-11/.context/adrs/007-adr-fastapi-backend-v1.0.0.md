---
type: adr
name: adr-fastapi-backend
description: FastAPI 0.135.x como framework Python async na camada Backend
scope: organizational
source: local
stack: FastAPI 0.135
category: arquitetura
status: Aprovado
version: 1.0.0
created: 2026-05-11
supersedes: []
refines: []
protocol_contract: null
decision_kind: firm
summary: ""
---

# ADR — FastAPI como framework Python async no Backend

- **Data:** 2026-05-11
- **Status:** Aprovado
- **Escopo:** Organizacional
- **Stack:** FastAPI 0.135.x
- **Categoria:** Arquitetura

---

## Contexto

Backend Python 3.13 em Cloud Run (concurrency 80, min-instances > 0) precisa de I/O assíncrono (Firestore, Pub/Sub, BigQuery), validação de borda forte e OpenAPI gerado para contratos. Frameworks WSGI (Flask, Django) bloqueiam o event loop e não trazem schema-first nativo. Stack ASGI moderna + integração nativa com Pydantic 2 é requisito.

## Drivers

- I/O bound: Firestore/Pub/Sub/BigQuery
- Validação tipada de borda (Pydantic v2)
- OpenAPI auto-gerado p/ contratos
- Cold start aceitável em Cloud Run
- Ecossistema ASGI maduro

## Decisão

Adotar **FastAPI 0.135.x** como framework HTTP de todos os bounded contexts do monolito modular. Servidor: **uvicorn** workers ASGI; processo único por instância Cloud Run. Cada bounded context = `APIRouter` montado em `app.include_router(...)` com prefixo isolado. Cross-cutting (auth, request-id, logging estruturado, tracing OTLP) via dependências (`Depends`) e middlewares ASGI. Out: lógica de aplicação em rotas — rotas só fazem `validate → call use-case → serialize`.

## Alternativas Consideradas

- **Flask + Pydantic ad-hoc** — WSGI bloqueante, OpenAPI manual, validação fora do framework.
- **Django** — ORM acoplado, monolito assíncrono parcial, peso desnecessário sem templates.
- **Litestar** — ecossistema menor, menos integrações Google Cloud testadas.
- **gRPC puro** — perde browsability/OpenAPI, complica integração com BFF Next.
- **FastAPI 0.135.x ✓** — ASGI, Pydantic v2 nativo, OpenAPI canônico, comunidade ampla.

## Consequências

**Positivas**
- Async I/O nativo → throughput em concorrência 80/instância.
- OpenAPI 3.1 gerado de schemas Pydantic → contratos exportáveis para `packages/contracts`.
- Dependency injection testável (`Depends`) → bounded contexts isolados.
- Type-hints fim-a-fim → menor superfície de bug em borda.

**Negativas**
- Cold start ~300-600ms (mitigado por `min-instances > 0`).
- `BackgroundTasks` não é fila durável → trabalho assíncrono real vai para Pub/Sub.

**Riscos aceitos**
- Bibliotecas síncronas bloqueando event loop → wrap em `run_in_threadpool` + lint custom.

## Guardrails

- SEMPRE declarar `response_model` em todo endpoint; nunca retornar `dict` cru.
- SEMPRE isolar bounded context em `app/contexts/<context>/router.py` com prefixo único.
- NUNCA chamar SDK síncrono bloqueante no path async sem `run_in_threadpool`.
- NUNCA acoplar bounded contexts via import direto — comunicação cross-domain é Pub/Sub.
- QUANDO criar endpoint, ENTÃO declarar `tags`, `summary`, `response_model`, `status_code` e teste pytest cobrindo 200/4xx.
- QUANDO endpoint mutar estado, ENTÃO exigir header `Idempotency-Key` via `Depends`.

## Enforcement

- [ ] Code review: todo router montado em `include_router` com prefixo; nenhum cross-import entre contexts.
- [ ] Lint: `ruff` + regra custom proibindo `requests`/`time.sleep` em handler async.
- [ ] Teste: pytest + httpx `AsyncClient` cobre rotas; testcontainers cobre integração Firestore emulator.
- [ ] Gate CI/PREVC: job exporta OpenAPI e diffa contra `packages/contracts/openapi.json` (fase V).

## Evidências / Anexos

**Fontes oficiais:** [FastAPI — First Steps](https://fastapi.tiangolo.com/tutorial/first-steps/) · [FastAPI — Bigger Applications](https://fastapi.tiangolo.com/tutorial/bigger-applications/) · [Starlette ASGI](https://www.starlette.io/)

```python
# app/contexts/resources/router.py — router isolado, response_model obrigatório
from fastapi import APIRouter, Depends, status
from pydantic import BaseModel

router = APIRouter(prefix="/resources", tags=["resources"])

class Resource(BaseModel):
    id: str
    name: str

@router.get("/{resource_id}", response_model=Resource, status_code=status.HTTP_200_OK)
async def get_resource(resource_id: str) -> Resource:
    return Resource(id=resource_id, name="demo")
```
