---
type: adr
name: adr-python-backend
description: Python 3.13.x como linguagem dos serviços de domínio na camada Backend
scope: organizational
source: local
stack: Python 3.13.x
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

# ADR — Python 3.13.x como Linguagem dos Serviços de Domínio

- **Data:** 2026-05-11
- **Status:** Aprovado
- **Escopo:** Organizacional
- **Stack:** Python 3.13.x
- **Categoria:** Arquitetura

---

## Contexto

Monolito modular FastAPI 0.135 em Cloud Run (concurrency 80, min-instances > 0), seis bounded contexts comunicando via Pub/Sub. Triggers reativos em Cloud Functions 2nd gen. Stack exige type hints fortes para Pydantic 2.10, async I/O para Pub/Sub/Firestore/BigQuery, ferramental ruff + pytest + uv. Ecossistema científico/ML maduro é pré-requisito para serviços de domínio e contextos analíticos. Versão 3.13 trouxe free-threaded build experimental, JIT incremental e `typing` mais expressivo.

## Decisão

Adotar **Python 3.13.x** como única linguagem fonte do Backend. `from __future__ import annotations` opcional (PEP 649 lazy annotations já default). Type hints obrigatórios em assinaturas públicas e modelos Pydantic. Async-first: `async def` em rotas FastAPI, clients Firestore/Pub/Sub/BigQuery via APIs assíncronas. Gerenciamento de dependências e venv via `uv`. Lint/format único via `ruff`.

```
services/svc-{context}/
  app/api/        → FastAPI routers (async)
  app/domain/     → Pydantic models + use cases
  app/infra/      → Firestore/Pub/Sub/BigQuery adapters
  tests/          → pytest + testcontainers + factory-boy
pyproject.toml    → uv-managed; ruff + mypy strict
```

## Alternativas Consideradas

- **Go** — performance e binário único, mas ecossistema ML/LLM e Pydantic-equivalente fracos para bounded contexts analíticos.
- **Node.js/TypeScript** — duplicaria a stack do BFF; faltam libs científicas e clients GCP maduros em paridade.
- **Rust** — type system superior, mas curva de iteração e tooling FastAPI-equivalente custosos para feedback loop AI-first.
- **Python 3.13.x async + Pydantic 2** ✓ — type hints + validação + ecossistema GCP + ferramental ruff/uv/pytest alinham AI-first com performance suficiente em Cloud Run.

## Consequências

**Positivas**
- Type hints + Pydantic 2 → validação no boundary HTTP
- Async I/O nativo → concurrency 80 viável em Cloud Run
- Ferramental moderno: `uv` (instalação rápida), `ruff` (lint + format)
- Ecossistema GCP/ML maduro; PEP 695 type params, PEP 698 `@override`

**Negativas**
- GIL ainda padrão (free-threaded experimental); CPU-bound exige multiprocessing/Cloud Tasks
- Type checking estático mais frouxo que TS sem `mypy --strict`
- Cold start em Cloud Run mitigado por min-instances > 0

**Riscos aceitos**
- Free-threaded build experimental → não usar em produção até GA
- Libs com extension C podem atrasar suporte ao 3.13

## Guardrails

- SEMPRE type hints em assinaturas públicas e modelos Pydantic
- SEMPRE `async def` em rotas FastAPI e clients I/O
- SEMPRE usar `uv` para deps; `pyproject.toml` é fonte única
- NUNCA `Any` implícito; NUNCA `# type: ignore` sem justificativa
- NUNCA chamadas síncronas bloqueantes dentro de handler async
- QUANDO CPU-bound, ENTÃO offload para Cloud Tasks ou Cloud Functions

## Enforcement

- [ ] Code review: rejeitar funções públicas sem type hints e chamadas síncronas em rotas async
- [ ] Lint: `ruff check` (regras `E`, `F`, `I`, `B`, `UP`, `ASYNC`) + `ruff format`
- [ ] Teste: `mypy --strict` por serviço; `pytest` + `testcontainers` para integrações
- [ ] Gate CI/PREVC: Validation roda `uv run ruff check`, `uv run mypy`, `uv run pytest`

## Evidências / Anexos

**Fontes oficiais:** [Python 3.13 — What's New](https://docs.python.org/3.13/whatsnew/3.13.html) · [Python Tutorial](https://docs.python.org/3/tutorial/index.html) · [PEP 695 — Type Parameter Syntax](https://peps.python.org/pep-0695/)

```python
# exemplo minimal — rota FastAPI async tipada com Pydantic 2
from typing import Literal
from fastapi import APIRouter
from pydantic import BaseModel, Field

router = APIRouter(prefix="/resources")

class Resource(BaseModel):
    id: str = Field(min_length=1)
    status: Literal["ok", "pending"]

@router.get("/{resource_id}", response_model=Resource)
async def get_resource(resource_id: str) -> Resource:
    return Resource(id=resource_id, status="ok")
```
