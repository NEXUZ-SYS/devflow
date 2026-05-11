---
id: std-fastapi
description: FastAPI 0.135.x como framework Python async na camada Backend
version: 1.0.0
applyTo: ["**/*.py", "pyproject.toml"]
relatedAdrs: ["adr-fastapi-backend"]
enforcement:
  linter: standards/machine/std-fastapi.js
weakStandardWarning: true
---
# Standard: fastapi
## Princípios
Adotar **FastAPI 0.135.x** como framework HTTP de todos os bounded contexts do monolito modular. Servidor: **uvicorn** workers ASGI; processo único por instância Cloud Run. Cada bounded context = `APIRouter` montado em `app.include_router(...)` com prefixo isolado. Cross-cutting (auth, request-id, logging estruturado, tracing OTLP) via dependências (`Depends`) e middlewares ASGI. Out: lógica de aplicação em rotas — rotas só fazem `validate → call use-case → serialize`.
## Anti-patterns
| Errado | Certo |
|---|---|
| chamar SDK síncrono bloqueante no path async sem `run_in_threadpool`. | Aplicar a alternativa explicitada na ADR (Decisão / Enforcement) |
| acoplar bounded contexts via import direto — comunicação cross-domain é Pub/Sub. | Aplicar a alternativa explicitada na ADR (Decisão / Enforcement) |
## Linter
`./machine/std-fastapi.js` verifica:

1. todo router montado em `include_router` com prefixo; nenhum cross-import entre contexts.
2. `ruff` + regra custom proibindo `requests`/`time.sleep` em handler async.
3. pytest + httpx `AsyncClient` cobre rotas; testcontainers cobre integração Firestore emulator.
4. job exporta OpenAPI e diffa contra `packages/contracts/openapi.json` (fase V).

Output em formato `VIOLATION: <regra> (<file>:<line>) — <correção sugerida>` per SI-4 contract.
## Referência
ADRs derivadas:
- adr-fastapi-backend (`007-adr-fastapi-backend-v1.0.0.md`)
Fontes oficiais (consolidadas das ADRs):

**Fontes oficiais:** [FastAPI — First Steps](https://fastapi.tiangolo.com/tutorial/first-steps/) · [FastAPI — Bigger Applications](https://fastapi.tiangolo.com/tutorial/bigger-applications/) · [Starlette ASGI](https://www.starlette.io/)
Authoring guide: `.context/standards/README.md`
