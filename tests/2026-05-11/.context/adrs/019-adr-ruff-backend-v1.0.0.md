---
type: adr
name: adr-ruff-backend
description: ruff 0.9.x como linter e formatter Python na camada Backend
scope: organizational
source: local
stack: ruff 0.9.x
category: principios-codigo
status: Aprovado
version: 1.0.0
created: 2026-05-11
supersedes: []
refines: []
protocol_contract: null
decision_kind: firm
summary: ""
---

# ADR — ruff 0.9.x como Lint + Format do Backend

- **Data:** 2026-05-11
- **Status:** Aprovado
- **Escopo:** Organizacional
- **Stack:** ruff 0.9.x
- **Categoria:** Princípios de Código

---

## Contexto

Backend Python 3.13 + FastAPI 0.135 + Pydantic 2.10, monolito modular em Cloud Run com 6 bounded contexts. Stack legada `flake8 + black + isort + pyupgrade + bandit` exige 5+ ferramentas, parsers múltiplos, configs duplicadas e tempo de lint > 20s em CI. Pre-commit lento cria fricção. AI-first multiplica volume de PRs; ferramenta lenta vira gargalo. Necessário: lint + format unificados, parser único, autofix determinístico, regras de import sort, pyupgrade automático, integração nativa com `uv`.

## Decisão

Adotar **ruff 0.9.x** como linter e formatter de Python no Backend. Substitui `flake8`, `black`, `isort`, `pyupgrade`, `pycodestyle`, `pyflakes`. Config canônica em `pyproject.toml` (`[tool.ruff]`). `line-length: 100`, `target-version: "py313"`. Regras habilitadas: `E`, `W`, `F`, `I`, `B`, `C4`, `UP`, `N`, `S`, `SIM`, `RUF`, `ASYNC`, `FAST` (FastAPI), `PT` (pytest). Per-file ignores para `tests/**` e `migrations/**`. `ruff format` substitui Black com 99%+ compatibilidade. Executado via `uv run ruff check --fix` e `uv run ruff format`.

```
pyproject.toml                          → [tool.ruff] + [tool.ruff.lint] + [tool.ruff.format]
services/svc-*/pyproject.toml           → extends via [tool.ruff] include
.pre-commit-config.yaml                 → ruff-pre-commit hook
```

## Alternativas Consideradas

- **flake8 + black + isort + pyupgrade + bandit** — ecossistema maduro; 5 ferramentas, configs duplicadas, lint lento, parsers redundantes.
- **pylint** — análise profunda; ordens de magnitude mais lento, ruidoso por padrão.
- **pyright (lint via type-check)** — type-checker, não substitui style/security lint.
- **flake8 + ruff (híbrido)** — duplicação desnecessária; ruff já cobre regras de flake8.
- **ruff 0.9.x** ✓ — linter + formatter unificados em Rust, parser único, 50-100× mais rápido, autofix determinístico, regras FastAPI/pytest nativas.

## Consequências

**Positivas**
- Lint + format em uma ferramenta → uma config, zero conflito
- Parser Rust único → 50-100× mais rápido que flake8/black
- Autofix determinístico (`ruff check --fix`)
- Regras `FAST` (FastAPI), `PT` (pytest), `ASYNC` (asyncio) nativas
- `pyupgrade` automático mantém código alinhado com `target-version`

**Negativas**
- Cobertura de regras menor que `pylint` em análise semântica profunda
- Plugins de terceiros do flake8 (ex: `flake8-django`) não portados 1:1
- Versão minor pode introduzir novas regras estáveis (necessita pin)

**Riscos aceitos**
- Regra ausente para caso específico → complementar com `mypy --strict` (type-check) ou plugin custom quando disponível

## Guardrails

- SEMPRE `ruff check --fix` + `ruff format` no pre-commit
- SEMPRE pinar versão de `ruff` em `pyproject.toml` com `~=` (minor lock)
- SEMPRE habilitar regras `S` (bandit), `B` (bugbear), `FAST` e `PT` no Backend
- NUNCA suprimir regra via `# noqa` sem código (`# noqa: F401` ok; `# noqa` cego não)
- NUNCA coexistir com `black`, `isort`, `flake8` ou `pyupgrade` instalados no projeto
- QUANDO regra recommended quebrar import, ENTÃO autofix primeiro; só ignorar após análise

## Enforcement

- [ ] Code review: rejeitar PR com `# noqa` sem código de regra explícito
- [ ] Lint: `uv run ruff check --no-fix` em workflow `backend-ci.yml` (status check obrigatório)
- [ ] Teste: pre-commit hook (`ruff-pre-commit` com `--fix` + `ruff-format`)
- [ ] Gate CI/PREVC: Validation phase exige `uv run ruff check` e `uv run ruff format --check` verdes

## Evidências / Anexos

**Fontes oficiais:** [ruff — Configuration](https://docs.astral.sh/ruff/configuration/) · [ruff — Rules](https://docs.astral.sh/ruff/rules/) · [ruff — Formatter](https://docs.astral.sh/ruff/formatter/)

```toml
# exemplo minimal — pyproject.toml com regras canônicas
[tool.ruff]
line-length = 100
target-version = "py313"

[tool.ruff.lint]
select = ["E", "W", "F", "I", "B", "C4", "UP", "N", "S", "SIM", "RUF", "ASYNC", "FAST", "PT"]
ignore = ["E501"]  # line-length já gerenciado pelo formatter

[tool.ruff.lint.per-file-ignores]
"tests/**/*.py" = ["S101", "S106"]  # assert + hardcoded passwords em fixtures

[tool.ruff.format]
quote-style = "double"
docstring-code-format = true
```
