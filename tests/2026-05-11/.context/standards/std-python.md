---
id: std-python
description: Python 3.13.x como linguagem dos serviços de domínio na camada Backend
version: 1.0.0
applyTo: ["**/*.py"]
relatedAdrs: ["adr-python-backend"]
enforcement:
  linter: standards/machine/std-python.js
weakStandardWarning: true
---
# Standard: python
## Princípios
Adotar **Python 3.13.x** como única linguagem fonte do Backend. `from __future__ import annotations` opcional (PEP 649 lazy annotations já default). Type hints obrigatórios em assinaturas públicas e modelos Pydantic. Async-first: `async def` em rotas FastAPI, clients Firestore/Pub/Sub/BigQuery via APIs assíncronas. Gerenciamento de dependências e venv via `uv`. Lint/format único via `ruff`.

```
services/svc-{context}/
  app/api/        → FastAPI routers (async)
  app/domain/     → Pydantic models + use cases
  app/infra/      → Firestore/Pub/Sub/BigQuery adapters
  tests/          → pytest + testcontainers + factory-boy
pyproject.toml    → uv-managed; ruff + mypy strict
```
## Anti-patterns
| Errado | Certo |
|---|---|
| `Any` implícito; NUNCA `# type: ignore` sem justificativa | Aplicar a alternativa explicitada na ADR (Decisão / Enforcement) |
| chamadas síncronas bloqueantes dentro de handler async | Aplicar a alternativa explicitada na ADR (Decisão / Enforcement) |
## Linter
`./machine/std-python.js` verifica:

1. rejeitar funções públicas sem type hints e chamadas síncronas em rotas async
2. `ruff check` (regras `E`, `F`, `I`, `B`, `UP`, `ASYNC`) + `ruff format`
3. `mypy --strict` por serviço; `pytest` + `testcontainers` para integrações
4. Validation roda `uv run ruff check`, `uv run mypy`, `uv run pytest`

Output em formato `VIOLATION: <regra> (<file>:<line>) — <correção sugerida>` per SI-4 contract.
## Referência
ADRs derivadas:
- adr-python-backend (`003-adr-python-backend-v1.0.0.md`)
Fontes oficiais (consolidadas das ADRs):

**Fontes oficiais:** [Python 3.13 — What's New](https://docs.python.org/3.13/whatsnew/3.13.html) · [Python Tutorial](https://docs.python.org/3/tutorial/index.html) · [PEP 695 — Type Parameter Syntax](https://peps.python.org/pep-0695/)
Authoring guide: `.context/standards/README.md`
