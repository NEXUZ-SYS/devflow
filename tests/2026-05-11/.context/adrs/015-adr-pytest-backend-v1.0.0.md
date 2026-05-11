---
type: adr
name: adr-pytest-backend
description: pytest 8.x como test runner Python na camada Backend
scope: organizational
source: local
stack: pytest 8.x
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

# ADR — pytest 8.x como Test Runner Python no Backend

- **Data:** 2026-05-11
- **Status:** Aprovado
- **Escopo:** Organizacional
- **Stack:** pytest 8.x
- **Categoria:** Qualidade & Testes

---

## Contexto

Backend FastAPI 0.135 (modular monolith em Cloud Run) com 6 bounded contexts, Pydantic 2.10, Firestore Admin SDK, Pub/Sub e BigQuery. Necessário runner com fixtures composáveis, parametrização densa, plugin ecosystem maduro (asyncio, factoryboy, testcontainers), discovery por convenção e integração com `uv` + `ruff`. `unittest` é verboso e não escala fixtures cross-context; `nose2` é descontinuado. Cobertura de contratos cross-domain (Pub/Sub envelopes, Firestore docs) exige fakes/emuladores reais via testcontainers.

## Decisão

Adotar **pytest 8.x** como runner único de unit + integration do Backend. `pytest-asyncio` para endpoints FastAPI async; `pytest-cov` para cobertura; `factory-boy` para fixtures de Pydantic models; `testcontainers` para Firestore/Pub/Sub/BigQuery emulators. Layout por bounded context (`tests/svc_<name>/`), markers explícitos (`@pytest.mark.integration`, `@pytest.mark.contract`), fixtures escopadas a sessão para containers.

```
services/<svc>/
  src/                                  → módulo de domínio
  tests/
    unit/test_*.py                      → puro, sem I/O
    integration/test_*.py               → testcontainers + httpx.AsyncClient
    conftest.py                         → fixtures de bounded context
pyproject.toml                          → [tool.pytest.ini_options] + markers
```

## Alternativas Consideradas

- **unittest** (stdlib) — sem fixtures composáveis; parametrize verboso; sem plugin ecosystem.
- **nose2** — manutenção mínima; comunidade pequena; sem suporte first-class a asyncio moderno.
- **ward** — interessante, mas plugins (testcontainers, factory-boy) imaturos.
- **pytest 8.x** ✓ — fixtures componíveis, plugins maduros, asyncio robusto, padrão de facto Python.

## Consequências

**Positivas**
- Fixtures composáveis → setup compartilhado entre bounded contexts sem herança
- `parametrize` denso → matriz de casos com baixo overhead
- Plugin ecosystem (asyncio, cov, xdist, factoryboy, testcontainers) maduro
- Discovery por convenção → zero boilerplate de runner

**Negativas**
- Mágica de fixtures (dependency injection implícita) eleva curva inicial
- Parallel via `pytest-xdist` exige fixtures process-safe
- Markers sem disciplina viram catch-all

**Riscos aceitos**
- Plugin drift entre majors → pin de versões em `pyproject.toml`; bump trimestral

## Guardrails

- SEMPRE separar `tests/unit/` (sem I/O) de `tests/integration/` (testcontainers)
- SEMPRE marcar testes integration com `@pytest.mark.integration`
- SEMPRE usar `httpx.AsyncClient(app=app, base_url='http://test')` para endpoints FastAPI
- NUNCA importar fixture entre bounded contexts; duplicar em `conftest.py` local
- NUNCA `time.sleep` em testes — usar `asyncio.wait_for` ou polling com timeout
- QUANDO testar Firestore, ENTÃO emulator via testcontainers; nunca mock do SDK
- QUANDO teste depender de Pub/Sub, ENTÃO contract test com schema Pydantic do envelope

## Enforcement

- [ ] Code review: rejeitar `unittest.TestCase` em `tests/`; rejeitar `time.sleep`
- [ ] Lint: `ruff` configurada com `pytest-style` rules (PT001-PT027)
- [ ] Teste: threshold `--cov-fail-under=80`; `pytest-asyncio` em strict mode
- [ ] Gate CI/PREVC: Validation phase roda `uv run pytest -m 'not integration'` (fast) + job dedicado para integration

## Evidências / Anexos

**Fontes oficiais:** [pytest — Getting Started](https://docs.pytest.org/en/stable/getting-started.html) · [pytest — Documentation](https://docs.pytest.org/en/stable/) · [pytest-asyncio](https://pytest-asyncio.readthedocs.io/)

```python
# exemplo minimal — endpoint FastAPI testado com httpx async + fixture pytest
import pytest
from httpx import AsyncClient
from svc_resource.app import create_app
from svc_resource.schemas import Resource

@pytest.fixture
async def client():
    app = create_app()
    async with AsyncClient(app=app, base_url="http://test") as c:
        yield c

@pytest.mark.asyncio
@pytest.mark.parametrize("payload", [{"id": "r-1", "active": True}])
async def test_create_resource_returns_201(client: AsyncClient, payload: dict) -> None:
    response = await client.post("/resources", json=payload)

    assert response.status_code == 201
    assert Resource.model_validate(response.json()).id == "r-1"
```
