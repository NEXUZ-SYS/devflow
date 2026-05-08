---
id: std-ruff
description: ruff 0.9.x como linter e formatter unificado de Python na camada Backend
version: 1.0.0
applyTo: ["**/*.py", "pyproject.toml"]
relatedAdrs: ["adr-ruff-backend"]
enforcement:
  linter: standards/machine/std-ruff.js
weakStandardWarning: true
---
# Standard: ruff
## Princípios
Adotar **ruff 0.9.x** como ferramenta única de lint + format de Python na camada Backend. Substitui flake8 + isort + black + pylint + pyupgrade + autoflake + pydocstyle. Configuração centralizada em `pyproject.toml` na raiz, com overrides por bounded context. Regras: `E`, `F`, `I`, `B`, `UP`, `N`, `S`, `ASYNC`, `RUF`, `PL`, `TID` (tidy imports para boundary entre contexts). Format via `ruff format` (Black-compatible). Single-binary distribuído via uv, AST único compartilhado entre lint e format.
## Anti-patterns
| Errado | Certo |
|---|---|
| coexistir com black, isort, flake8, pylint, autoflake no mesmo workspace. | Aplicar a alternativa explicitada na ADR (Decisão / Enforcement) |
| suprimir regras com `# noqa` sem código + motivo (`# noqa: B008  # FastAPI Depends`). | Aplicar a alternativa explicitada na ADR (Decisão / Enforcement) |
## Linter
`./machine/std-ruff.js` verifica:

1. bloqueia `# noqa` sem motivo + reintrodução de black/flake8/isort.
2. `ruff check --no-fix` no CI; `ruff format --check`; falha quebra pipeline.
3. Pre-commit: hook `ruff` em modo fix + `ruff format`.
4. pytest + ruff check em CI; cobertura mínima de regras `S` (security) no svc-finance.
5. Gate PREVC: `uv run ruff check && uv run ruff format --check` obrigatório antes do merge.

Output em formato `VIOLATION: <regra> (<file>:<line>) — <correção sugerida>` per SI-4 contract.
## Referência
ADRs derivadas:
- adr-ruff-backend (`019-adr-ruff-backend-v1.0.0.md`)
Fontes oficiais (consolidadas das ADRs):

**Fontes oficiais:**
- [ruff Documentation](https://docs.astral.sh/ruff/)
- [ruff Rules Reference](https://docs.astral.sh/ruff/rules/)
- [ruff Configuration](https://docs.astral.sh/ruff/configuration/)
- [PEP 8 — Style Guide for Python Code](https://peps.python.org/pep-0008/)
- [PEP 621 — Storing project metadata in pyproject.toml](https://peps.python.org/pep-0621/)
Authoring guide: `.context/standards/README.md`
