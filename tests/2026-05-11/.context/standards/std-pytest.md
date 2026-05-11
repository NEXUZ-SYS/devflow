---
id: std-pytest
description: pytest 8.x como test runner Python na camada Backend
version: 1.0.0
applyTo: ["tests/**/*.py", "**/test_*.py", "**/*_test.py"]
relatedAdrs: ["adr-pytest-backend"]
enforcement:
  linter: standards/machine/std-pytest.js
weakStandardWarning: true
---
# Standard: pytest
## Princípios
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
## Anti-patterns
| Errado | Certo |
|---|---|
| importar fixture entre bounded contexts; duplicar em `conftest.py` local | Aplicar a alternativa explicitada na ADR (Decisão / Enforcement) |
| `time.sleep` em testes — usar `asyncio.wait_for` ou polling com timeout | Aplicar a alternativa explicitada na ADR (Decisão / Enforcement) |
## Linter
`./machine/std-pytest.js` verifica:

1. rejeitar `unittest.TestCase` em `tests/`; rejeitar `time.sleep`
2. `ruff` configurada com `pytest-style` rules (PT001-PT027)
3. threshold `--cov-fail-under=80`; `pytest-asyncio` em strict mode
4. Validation phase roda `uv run pytest -m 'not integration'` (fast) + job dedicado para integration

Output em formato `VIOLATION: <regra> (<file>:<line>) — <correção sugerida>` per SI-4 contract.
## Referência
ADRs derivadas:
- adr-pytest-backend (`015-adr-pytest-backend-v1.0.0.md`)
Fontes oficiais (consolidadas das ADRs):

**Fontes oficiais:** [pytest — Getting Started](https://docs.pytest.org/en/stable/getting-started.html) · [pytest — Documentation](https://docs.pytest.org/en/stable/) · [pytest-asyncio](https://pytest-asyncio.readthedocs.io/)
Authoring guide: `.context/standards/README.md`
