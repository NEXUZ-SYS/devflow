---
type: adr
name: adr-pytest-backend
description: pytest 8.x como test runner Python da camada Backend (FastAPI modular monolith em Cloud Run)
scope: organizational
source: local
stack: pytest 8.0.0
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

# ADR — pytest 8.x na Camada Backend

- **Data:** 2026-05-08
- **Status:** Aprovado
- **Escopo:** Organizacional
- **Stack:** pytest
- **Categoria:** Qualidade & Testes

## Contexto

Camada Backend: Python 3.13 + FastAPI 0.135 + Pydantic 2.10 + uv + ruff. Modular monolith em Cloud Run com 6 bounded contexts isolados; comunicação cross-domain via Pub/Sub; triggers reativos em Cloud Functions 2nd gen. Suíte precisa cobrir: unit (puro, fast), integration (Firestore/Pub/Sub via testcontainers e emulators), contract (schemas Pydantic ↔ Zod compartilhados), e component (FastAPI `TestClient`/`AsyncClient`). Necessário runner com discovery automático, fixtures composáveis, parametrização densa, suporte async-first nativo, plugins maduros (cov, xdist, asyncio, anyio), output estruturado para CI e LLM, e custo cognitivo baixo (assert nativo). Test layout precisa refletir bounded contexts e permitir paralelismo seguro.

## Decisão

Adotar **pytest 8.x** como test runner único da camada Backend. Layout `tests/` espelha `src/` por bounded context (`tests/svc-*/unit`, `tests/svc-*/integration`). Asserts nativos (sem `unittest.TestCase`). `pytest-asyncio` (`asyncio_mode = "auto"`) para handlers e clients async. `pytest-cov` para coverage com threshold por contexto. `pytest-xdist` para paralelismo (cuidado com fixtures session-scoped que tocam recurso externo). `factory-boy` gera modelos Pydantic; `testcontainers` provê Firestore/Pub/Sub emulators. Markers padronizados: `unit`, `integration`, `slow`, `external`. `conftest.py` por contexto + um root para fixtures cross-cutting. `pyproject.toml` é a configuração canônica; sem `pytest.ini` paralelo.

## Alternativas Consideradas

- **`unittest`** — stdlib, zero-deps, porém boilerplate xUnit, fixtures verbosas, sem parametrização first-class, ecossistema de plugins inexistente.
- **`nose2`** — manutenção fraca, ecossistema obsoleto.
- **`hypothesis` standalone** — property-based excelente, não é runner; melhor como plugin sobre pytest.
- **pytest 8.x** ✓ — assert nativo, fixtures composáveis, parametrização densa, async-first via plugin, ecossistema mais maduro do Python, integra com factory-boy/testcontainers/hypothesis.

## Consequências

**Positivas**
- Asserts nativos + introspecção rica → mensagens de falha legíveis.
- Fixtures composáveis com `scope` controlado → setup mínimo por teste.
- Parametrização (`@pytest.mark.parametrize`) → cobertura densa de edge cases.
- Async nativo via plugin → `httpx.AsyncClient` para FastAPI sem ginástica.
- Markers + `-m` → execução seletiva (PR fast lane vs. nightly full).
- Output JUnit/JSON → ingestão direta em CI e observability.

**Negativas**
- Magia de fixtures via injeção de parâmetros → curva inicial para novato.
- Plugins múltiplos (asyncio, anyio, xdist) podem conflitar em ordem de hooks.
- Coverage com paralelismo exige `--cov-context=test` e merge correto.

**Riscos aceitos**
- Flaky em integration (recursos externos) → quarentena via marker `external` + retry controlado.
- Skew Pydantic v2 ↔ schemas Zod → contract tests obrigatórios na fronteira.

## Guardrails

- SEMPRE testes em `tests/<bounded-context>/(unit|integration)/`; nome `test_*.py`; função `test_*`.
- SEMPRE assert nativo (`assert x == y`); NUNCA `self.assertEqual` (sem `unittest.TestCase`).
- SEMPRE marcar testes lentos/externos com `@pytest.mark.integration` ou `@pytest.mark.external`.
- SEMPRE async test via `pytest-asyncio` (`async def test_*`); NUNCA `asyncio.run` no corpo do teste.
- NUNCA mockar Pydantic models de fronteira; usar `factory-boy` ou builders tipados.
- NUNCA tocar Firestore/Pub/Sub real em teste; SEMPRE emulator via `testcontainers`.
- QUANDO fixture for compartilhada cross-context, ENTÃO morar em `tests/conftest.py` raiz; caso contrário, no `conftest.py` do contexto.
- QUANDO contrato Pydantic mudar, ENTÃO contract test atualizado na mesma PR.

## Enforcement

- [ ] Code review: bloqueia `unittest.TestCase`, `asyncio.run` em testes, mock de Pydantic schemas, acesso a recurso real sem emulator.
- [ ] Lint: ruff `PT*` (flake8-pytest-style) ativo; `pyproject.toml` é fonte única de config pytest.
- [ ] Teste: coverage threshold ≥ 85% por bounded context; markers exigidos (`unit`/`integration`).
- [ ] Gate PREVC: `uv run pytest -m "not external"` no PR; full suite com testcontainers em nightly; falha quebra merge.

## Evidências / Anexos

**Fontes oficiais:**
- [pytest Docs](https://docs.pytest.org/en/stable/)
- [pytest Fixtures](https://docs.pytest.org/en/stable/explanation/fixtures.html)
- [pytest-asyncio](https://pytest-asyncio.readthedocs.io/en/latest/)
- [FastAPI Testing](https://fastapi.tiangolo.com/tutorial/testing/)
- [testcontainers-python](https://testcontainers-python.readthedocs.io/en/latest/)
- [pytest GitHub](https://github.com/pytest-dev/pytest)

```python
# tests/svc-resource/unit/test_resource_service.py
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.contracts import ResourceIn

@pytest.fixture
def resource_payload() -> dict:
    return {"id": "11111111-1111-1111-1111-111111111111", "name": "Item A"}

@pytest.mark.asyncio
async def test_create_resource_returns_201(resource_payload: dict) -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/resources", json=resource_payload)
    assert response.status_code == 201
    parsed = ResourceIn.model_validate(response.json())
    assert parsed.name == "Item A"

@pytest.mark.parametrize("name", ["", " ", "x" * 256])
@pytest.mark.asyncio
async def test_create_resource_rejects_invalid_name(resource_payload: dict, name: str) -> None:
    payload = {**resource_payload, "name": name}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/resources", json=payload)
    assert response.status_code == 422
```
