---
type: adr
name: adr-python-backend
description: Python 3.13.x como linguagem dos serviços de domínio na camada Backend (FastAPI modular monolith)
scope: organizational
source: local
stack: Python 3.13.x
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

# ADR — Python 3.13.x na Camada Backend

- **Data:** 2026-05-08
- **Status:** Aprovado
- **Escopo:** Organizacional
- **Stack:** Python
- **Categoria:** Arquitetura

## Contexto

Camada Backend: monolito modular FastAPI em Cloud Run (concurrency 80, min-instances > 0), 6 bounded contexts isolados por módulo, comunicação cross-domain via Pub/Sub. Triggers reativos em Cloud Functions 2nd gen. Stack circundante: Pydantic 2.10, uv, ruff, pytest, factory-boy, testcontainers, clientes Google Cloud v2/v3. Necessário linguagem com tipagem estática robusta em runtime, ecossistema async-first, integração nativa com SDKs Google Cloud e ferramental moderno (uv, ruff).

## Decisão

Adotar **Python 3.13.x** (CPython oficial) como linguagem única da camada Backend. Type hints obrigatórios; `from __future__ import annotations`; modo estrito de mypy/pyright em CI. Gerenciamento de versão via `.python-version` e runtime base do container fixado. Async-first com `asyncio` + FastAPI.

## Alternativas Consideradas

- **Go** — performance superior, mas custo de produtividade alto e ecossistema de ML/LLM mais raso.
- **Node.js/TypeScript** — uniformiza com Frontend/BFF, mas ecossistema Python domina libs de dados/ML e SDKs internos.
- **Python 3.12** — estável, porém perde subinterpretes PEP 734 e ganhos de tipo do 3.13.
- **Python 3.13.x** ✓ — type system maduro (PEP 695, PEP 696), free-threaded build experimental, melhor performance, ecossistema FastAPI/Pydantic 2.10.

## Consequências

**Positivas**
- Type hints + Pydantic v2 = validação tipada de fronteira.
- Async nativo cobre I/O (Firestore, Pub/Sub, BigQuery, HTTP).
- Ecossistema rico (uv, ruff, pytest, testcontainers).
- Sinal denso para agentes AI em geração/revisão.

**Negativas**
- GIL (mitigado por concurrency Cloud Run + I/O bound).
- Cold start em Cloud Run (mitigado por min-instances > 0).
- Pacote nativo C compilado (manylinux) requer build cuidadoso.

**Riscos aceitos**
- Tipagem é checagem estática, não runtime — fronteiras validadas por Pydantic.
- Free-threaded build ainda experimental — não usar em prod por enquanto.

## Guardrails

- SEMPRE type hints em assinaturas públicas; `Any` proibido fora de boundary controlado.
- SEMPRE Pydantic v2 para DTOs de entrada/saída de endpoints e mensagens Pub/Sub.
- SEMPRE `async def` em handlers I/O bound.
- NUNCA `print()` em produção; usar `logging` estruturado (JSON).
- NUNCA `requests` síncrono em handler async; usar `httpx.AsyncClient`.
- NUNCA mutar estado global entre requests.
- QUANDO cruzar bounded context, ENTÃO via Pub/Sub event (não import direto).
- QUANDO consumir secret, ENTÃO via Secret Manager + cache TTL.

## Enforcement

- [ ] Code review: bloqueia `Any`, `print`, `requests` sync, import cross-context.
- [ ] Lint: `ruff check` + `ruff format` + `mypy --strict` (ou `pyright strict`).
- [ ] Build CI: `uv sync --frozen` + `mypy` + `pytest --cov`; pipeline falha em erro.
- [ ] Teste: pytest + factory-boy + testcontainers (Firestore emulator, Pub/Sub emulator).
- [ ] Gate PREVC: `make typecheck && make test` obrigatório antes do merge.

## Evidências / Anexos

**Fontes oficiais:**
- [Python 3.13 Release Notes](https://docs.python.org/3/whatsnew/3.13.html)
- [PEP 695 — Type Parameter Syntax](https://peps.python.org/pep-0695/)
- [FastAPI 0.135](https://fastapi.tiangolo.com/release-notes/)
- [Pydantic v2](https://docs.pydantic.dev/latest/)
- [uv (Astral)](https://docs.astral.sh/uv/)
- [Cloud Run concurrency](https://cloud.google.com/run/docs/about-concurrency)

```python
# app/api/resources.py — boundary tipado via Pydantic
from __future__ import annotations
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from uuid import UUID

router = APIRouter(prefix="/resources", tags=["resources"])

class ResourceIn(BaseModel):
    id: UUID
    name: str = Field(min_length=1)

class ResourceOut(BaseModel):
    id: UUID
    name: str

@router.post("", response_model=ResourceOut)
async def create_resource(payload: ResourceIn) -> ResourceOut:
    return ResourceOut(id=payload.id, name=payload.name)
```
