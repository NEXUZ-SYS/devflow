---
id: std-pytest
description: pytest 8.x como test runner Python da camada Backend (FastAPI modular monolith em Cloud Run)
version: 1.0.0
applyTo: ["tests/**/*.py", "**/test_*.py", "**/*_test.py"]
relatedAdrs: ["adr-pytest-backend"]
enforcement:
  linter: standards/machine/std-pytest.js
weakStandardWarning: true
---
# Standard: pytest
## Princípios
Adotar **pytest 8.x** como test runner único da camada Backend. Layout `tests/` espelha `src/` por bounded context (`tests/svc-*/unit`, `tests/svc-*/integration`). Asserts nativos (sem `unittest.TestCase`). `pytest-asyncio` (`asyncio_mode = "auto"`) para handlers e clients async. `pytest-cov` para coverage com threshold por contexto. `pytest-xdist` para paralelismo (cuidado com fixtures session-scoped que tocam recurso externo). `factory-boy` gera modelos Pydantic; `testcontainers` provê Firestore/Pub/Sub emulators. Markers padronizados: `unit`, `integration`, `slow`, `external`. `conftest.py` por contexto + um root para fixtures cross-cutting. `pyproject.toml` é a configuração canônica; sem `pytest.ini` paralelo.
## Anti-patterns
| Errado | Certo |
|---|---|
| mockar Pydantic models de fronteira; usar `factory-boy` ou builders tipados. | Aplicar a alternativa explicitada na ADR (Decisão / Enforcement) |
| tocar Firestore/Pub/Sub real em teste; SEMPRE emulator via `testcontainers`. | Aplicar a alternativa explicitada na ADR (Decisão / Enforcement) |
## Linter
`./machine/std-pytest.js` verifica:

1. bloqueia `unittest.TestCase`, `asyncio.run` em testes, mock de Pydantic schemas, acesso a recurso real sem emulator.
2. ruff `PT*` (flake8-pytest-style) ativo; `pyproject.toml` é fonte única de config pytest.
3. coverage threshold ≥ 85% por bounded context; markers exigidos (`unit`/`integration`).
4. Gate PREVC: `uv run pytest -m "not external"` no PR; full suite com testcontainers em nightly; falha quebra merge.

Output em formato `VIOLATION: <regra> (<file>:<line>) — <correção sugerida>` per SI-4 contract.
## Referência
ADRs derivadas:
- adr-pytest-backend (`015-adr-pytest-backend-v1.0.0.md`)
Fontes oficiais (consolidadas das ADRs):

**Fontes oficiais:**
- [pytest Docs](https://docs.pytest.org/en/stable/)
- [pytest Fixtures](https://docs.pytest.org/en/stable/explanation/fixtures.html)
- [pytest-asyncio](https://pytest-asyncio.readthedocs.io/en/latest/)
- [FastAPI Testing](https://fastapi.tiangolo.com/tutorial/testing/)
- [testcontainers-python](https://testcontainers-python.readthedocs.io/en/latest/)
- [pytest GitHub](https://github.com/pytest-dev/pytest)
Authoring guide: `.context/standards/README.md`
