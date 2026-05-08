---
type: adr
name: adr-ruff-backend
description: ruff 0.9.x como linter e formatter unificado de Python na camada Backend
scope: organizational
source: local
stack: ruff 0.9.x
category: principios-codigo
status: Aprovado
version: 1.0.0
created: 2026-05-08
supersedes: []
refines: []
protocol_contract: null
decision_kind: firm
summary: ""
---

# ADR — ruff 0.9.x na Camada Backend

- **Data:** 2026-05-08
- **Status:** Aprovado
- **Escopo:** Organizacional
- **Stack:** ruff
- **Categoria:** Princípios de Código

## Contexto

Camada Backend: Python 3.13 + FastAPI 0.135 + Pydantic 2.10 + uv, monolito modular em Cloud Run com 6 bounded contexts. Stack legada flake8 + isort + black + pylint + pyupgrade exige 5 ferramentas, configs duplicadas, AST recompilado N vezes, pipeline lento em CI. Plugin sprawl dificulta evolução. Necessário ferramenta única, rápida (Rust), Python 3.13-aware, com format + lint + import-sort + autofix, integração com Pydantic 2 e FastAPI, e feedback loop AI-first em pre-commit.

## Decisão

Adotar **ruff 0.9.x** como ferramenta única de lint + format de Python na camada Backend. Substitui flake8 + isort + black + pylint + pyupgrade + autoflake + pydocstyle. Configuração centralizada em `pyproject.toml` na raiz, com overrides por bounded context. Regras: `E`, `F`, `I`, `B`, `UP`, `N`, `S`, `ASYNC`, `RUF`, `PL`, `TID` (tidy imports para boundary entre contexts). Format via `ruff format` (Black-compatible). Single-binary distribuído via uv, AST único compartilhado entre lint e format.

## Alternativas Consideradas

- **flake8 + isort + black + pylint (status quo)** — ecossistema maduro, porém 5 ferramentas, lento, configs redundantes.
- **black + isort + flake8** — subset, ainda dual-tool, sem regras avançadas de pylint.
- **pylint sozinho** — análise profunda, mas sem format e lento em codebase grande.
- **mypy** — type-check, complementar (não substitui lint/format) — manter em paralelo.
- **ruff 0.9.x** ✓ — Rust-native, 10-100x mais rápido, AST único, drop-in replacement, autofix robusto, suporte first-class a Pydantic 2 e FastAPI patterns.

## Consequências

**Positivas**
- Single-tool: 1 binário, 1 config (`[tool.ruff]` em `pyproject.toml`).
- Performance 10-100x flake8+pylint+black em codebase grande.
- Autofix seguro (`ruff check --fix`) acelera refactor mecânico.
- Regras `TID` reforçam boundary entre bounded contexts.
- Cobertura de pyupgrade habilita migrações Python 3.13 contínuas.

**Negativas**
- Cobertura de pylint não 100% — algumas regras de design ainda ausentes.
- Plugin ecosystem fechado (Rust) vs. flake8 plugins Python.
- Migração exige remover devDeps legadas e revisar regras equivalentes.

**Riscos aceitos**
- Regras pylint específicas (design-checks tipo `R0915`) parcialmente cobertas — aceitável; complementar com mypy + revisão humana.
- Lock-in em config proprietária — TOML declarativo facilita migração reversa.

## Guardrails

- SEMPRE rodar `ruff check --fix && ruff format` em pre-commit.
- SEMPRE declarar `[tool.ruff]` em `pyproject.toml` raiz; overrides por bounded context via `[tool.ruff.lint.per-file-ignores]`.
- SEMPRE habilitar `select = ["E", "F", "I", "B", "UP", "N", "S", "ASYNC", "RUF", "PL", "TID"]`.
- SEMPRE `target-version = "py313"`.
- NUNCA coexistir com black, isort, flake8, pylint, autoflake no mesmo workspace.
- NUNCA suprimir regras com `# noqa` sem código + motivo (`# noqa: B008  # FastAPI Depends`).
- QUANDO cruzar boundary entre bounded contexts, ENTÃO regra `TID252` bloqueia import relativo cross-context.

## Enforcement

- [ ] Code review: bloqueia `# noqa` sem motivo + reintrodução de black/flake8/isort.
- [ ] Lint: `ruff check --no-fix` no CI; `ruff format --check`; falha quebra pipeline.
- [ ] Pre-commit: hook `ruff` em modo fix + `ruff format`.
- [ ] Teste: pytest + ruff check em CI; cobertura mínima de regras `S` (security) no svc-finance.
- [ ] Gate PREVC: `uv run ruff check && uv run ruff format --check` obrigatório antes do merge.

## Evidências / Anexos

**Fontes oficiais:**
- [ruff Documentation](https://docs.astral.sh/ruff/)
- [ruff Rules Reference](https://docs.astral.sh/ruff/rules/)
- [ruff Configuration](https://docs.astral.sh/ruff/configuration/)
- [PEP 8 — Style Guide for Python Code](https://peps.python.org/pep-0008/)
- [PEP 621 — Storing project metadata in pyproject.toml](https://peps.python.org/pep-0621/)

```toml
# pyproject.toml
[tool.ruff]
target-version = "py313"
line-length = 100
extend-exclude = [".venv", "build", "dist"]

[tool.ruff.lint]
select = ["E", "F", "I", "B", "UP", "N", "S", "ASYNC", "RUF", "PL", "TID"]
ignore = ["E501"]  # line-length handled by formatter

[tool.ruff.lint.flake8-tidy-imports.banned-api]
"svc_sales.*" = { msg = "cross-context import; usar Pub/Sub event" }

[tool.ruff.lint.per-file-ignores]
"tests/**" = ["S101", "PLR2004"]

[tool.ruff.format]
quote-style = "double"
indent-style = "space"
```
