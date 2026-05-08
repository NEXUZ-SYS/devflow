---
id: std-fastapi
description: FastAPI 0.135.x como framework Python async da camada Backend (monolito modular em Cloud Run)
version: 1.0.0
applyTo: ["**/*.py", "pyproject.toml"]
relatedAdrs: ["adr-fastapi-backend"]
enforcement:
  linter: standards/machine/std-fastapi.js
weakStandardWarning: true
---
# Standard: fastapi
## Princípios
Adotar **FastAPI 0.135.x** como framework HTTP/ASGI exclusivo da camada Backend. Servido por **Uvicorn** (workers=1, concurrency via async). Bounded contexts em módulos `svc-*` com **APIRouter** isolado por contexto e composição em `app.main`. **Pydantic 2.10** como única fonte de schemas request/response. **Dependency Injection** via `Depends` (autenticação, transações, clients GCP). Lifespan handler para warm-up de pools. OpenAPI 3.1 gerado e publicado em `/openapi.json`.
## Anti-patterns
| Errado | Certo |
|---|---|
| expor `Exception` genérica em response; usar exception handlers tipados. | Aplicar a alternativa explicitada na ADR (Decisão / Enforcement) |
## Linter
`./machine/std-fastapi.js` verifica:

1. bloqueia chamadas cross-context, `dict` em response, `Exception` genérica.
2. `ruff check` + `ruff format`; regras `ASYNC*` ativas; `mypy --strict` no diff.
3. `pytest` + `httpx.AsyncClient`; cobertura mínima por `svc-*` no CI.
4. Build CI: `uv sync` + `uvicorn --check`; smoke `/openapi.json` válido.
5. Gate PREVC: contract diff (OpenAPI) revisado antes do merge.

Output em formato `VIOLATION: <regra> (<file>:<line>) — <correção sugerida>` per SI-4 contract.
## Referência
ADRs derivadas:
- adr-fastapi-backend (`007-adr-fastapi-backend-v1.0.0.md`)
Fontes oficiais (consolidadas das ADRs):

**Fontes oficiais:**
- [FastAPI Docs](https://fastapi.tiangolo.com/)
- [FastAPI Release Notes](https://github.com/fastapi/fastapi/releases)
- [Starlette ASGI](https://www.starlette.io/)
- [Pydantic v2 Docs](https://docs.pydantic.dev/2.10/)
- [Uvicorn](https://www.uvicorn.org/)
Authoring guide: `.context/standards/README.md`
