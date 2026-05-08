---
id: std-python
description: Python 3.13.x como linguagem dos serviços de domínio na camada Backend (FastAPI modular monolith)
version: 1.0.0
applyTo: ["**/*.py"]
relatedAdrs: ["adr-python-backend"]
enforcement:
  linter: standards/machine/std-python.js
weakStandardWarning: true
---
# Standard: python
## Princípios
Adotar **Python 3.13.x** (CPython oficial) como linguagem única da camada Backend. Type hints obrigatórios; `from __future__ import annotations`; modo estrito de mypy/pyright em CI. Gerenciamento de versão via `.python-version` e runtime base do container fixado. Async-first com `asyncio` + FastAPI.
## Anti-patterns
| Errado | Certo |
|---|---|
| `print()` em produção; usar `logging` estruturado (JSON). | Aplicar a alternativa explicitada na ADR (Decisão / Enforcement) |
| `requests` síncrono em handler async; usar `httpx.AsyncClient`. | Aplicar a alternativa explicitada na ADR (Decisão / Enforcement) |
| mutar estado global entre requests. | Aplicar a alternativa explicitada na ADR (Decisão / Enforcement) |
## Linter
`./machine/std-python.js` verifica:

1. bloqueia `Any`, `print`, `requests` sync, import cross-context.
2. `ruff check` + `ruff format` + `mypy --strict` (ou `pyright strict`).
3. Build CI: `uv sync --frozen` + `mypy` + `pytest --cov`; pipeline falha em erro.
4. pytest + factory-boy + testcontainers (Firestore emulator, Pub/Sub emulator).
5. Gate PREVC: `make typecheck && make test` obrigatório antes do merge.

Output em formato `VIOLATION: <regra> (<file>:<line>) — <correção sugerida>` per SI-4 contract.
## Referência
ADRs derivadas:
- adr-python-backend (`003-adr-python-backend-v1.0.0.md`)
Fontes oficiais (consolidadas das ADRs):

**Fontes oficiais:**
- [Python 3.13 Release Notes](https://docs.python.org/3/whatsnew/3.13.html)
- [PEP 695 — Type Parameter Syntax](https://peps.python.org/pep-0695/)
- [FastAPI 0.135](https://fastapi.tiangolo.com/release-notes/)
- [Pydantic v2](https://docs.pydantic.dev/latest/)
- [uv (Astral)](https://docs.astral.sh/uv/)
- [Cloud Run concurrency](https://cloud.google.com/run/docs/about-concurrency)
Authoring guide: `.context/standards/README.md`
