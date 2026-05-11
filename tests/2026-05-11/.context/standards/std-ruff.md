---
id: std-ruff
description: ruff 0.9.x como linter e formatter Python na camada Backend
version: 1.0.0
applyTo: ["**/*.py", "pyproject.toml"]
relatedAdrs: ["adr-ruff-backend"]
enforcement:
  linter: standards/machine/std-ruff.js
weakStandardWarning: true
---
# Standard: ruff
## Princípios
Adotar **ruff 0.9.x** como linter e formatter de Python no Backend. Substitui `flake8`, `black`, `isort`, `pyupgrade`, `pycodestyle`, `pyflakes`. Config canônica em `pyproject.toml` (`[tool.ruff]`). `line-length: 100`, `target-version: "py313"`. Regras habilitadas: `E`, `W`, `F`, `I`, `B`, `C4`, `UP`, `N`, `S`, `SIM`, `RUF`, `ASYNC`, `FAST` (FastAPI), `PT` (pytest). Per-file ignores para `tests/**` e `migrations/**`. `ruff format` substitui Black com 99%+ compatibilidade. Executado via `uv run ruff check --fix` e `uv run ruff format`.

```
pyproject.toml                          → [tool.ruff] + [tool.ruff.lint] + [tool.ruff.format]
services/svc-*/pyproject.toml           → extends via [tool.ruff] include
.pre-commit-config.yaml                 → ruff-pre-commit hook
```
## Anti-patterns
| Errado | Certo |
|---|---|
| suprimir regra via `# noqa` sem código (`# noqa: F401` ok; `# noqa` cego não) | Aplicar a alternativa explicitada na ADR (Decisão / Enforcement) |
| coexistir com `black`, `isort`, `flake8` ou `pyupgrade` instalados no projeto | Aplicar a alternativa explicitada na ADR (Decisão / Enforcement) |
## Linter
`./machine/std-ruff.js` verifica:

1. rejeitar PR com `# noqa` sem código de regra explícito
2. `uv run ruff check --no-fix` em workflow `backend-ci.yml` (status check obrigatório)
3. pre-commit hook (`ruff-pre-commit` com `--fix` + `ruff-format`)
4. Validation phase exige `uv run ruff check` e `uv run ruff format --check` verdes

Output em formato `VIOLATION: <regra> (<file>:<line>) — <correção sugerida>` per SI-4 contract.
## Referência
ADRs derivadas:
- adr-ruff-backend (`019-adr-ruff-backend-v1.0.0.md`)
Fontes oficiais (consolidadas das ADRs):

**Fontes oficiais:** [ruff — Configuration](https://docs.astral.sh/ruff/configuration/) · [ruff — Rules](https://docs.astral.sh/ruff/rules/) · [ruff — Formatter](https://docs.astral.sh/ruff/formatter/)
Authoring guide: `.context/standards/README.md`
