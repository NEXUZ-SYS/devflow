---
id: std-pydantic
description: Pydantic 2.10.x como schema validation runtime Python da camada Backend (HTTP boundary, eventos, configs)
version: 1.0.0
applyTo: ["**/*.py"]
relatedAdrs: ["adr-pydantic-backend"]
enforcement:
  linter: standards/machine/std-pydantic.js
weakStandardWarning: true
---
# Standard: pydantic
## Princípios
Adotar **Pydantic 2.10.x** como biblioteca exclusiva de **validação runtime** e **definição de schemas** da camada Backend. Modelos vivem em `svc-<context>/schemas/` (locais) e em `packages/contracts` (compartilhados, pareados com YAML). FastAPI usa `BaseModel` para request/response. Eventos Pub/Sub validados com `model_validate_json` na borda do subscriber. Configs via `pydantic-settings` lendo Secret Manager + env. JSON Schema exportado via `model_json_schema()` para contract-tests com o BFF.
## Anti-patterns
| Errado | Certo |
|---|---|
| expor `BaseModel` interno como response sem schema dedicado (separar `*Read` / `*Create` / `*Update`). | Aplicar a alternativa explicitada na ADR (Decisão / Enforcement) |
| usar `Any` em campo público; preferir `union` discriminada ou `Literal`. | Aplicar a alternativa explicitada na ADR (Decisão / Enforcement) |
## Linter
`./machine/std-pydantic.js` verifica:

1. bloqueia `Any`, `extra="allow"` em DTO público, response com modelo interno.
2. `ruff` regras `PYI`, `B`, `RUF`; `mypy --strict` com plugin `pydantic.mypy`.
3. `pytest` com fixtures `factory-boy` por modelo crítico; casos válidos + inválidos.
4. Build CI: export de `model_json_schema()` comparado a snapshot; diff exige aprovação.
5. Gate PREVC: contract diff revisado; bump major em `packages/contracts` quando breaking.

Output em formato `VIOLATION: <regra> (<file>:<line>) — <correção sugerida>` per SI-4 contract.
## Referência
ADRs derivadas:
- adr-pydantic-backend (`010-adr-pydantic-backend-v1.0.0.md`)
Fontes oficiais (consolidadas das ADRs):

**Fontes oficiais:**
- [Pydantic v2 Docs](https://docs.pydantic.dev/2.10/)
- [Pydantic GitHub](https://github.com/pydantic/pydantic)
- [pydantic-core (Rust)](https://github.com/pydantic/pydantic-core)
- [pydantic-settings](https://docs.pydantic.dev/latest/concepts/pydantic_settings/)
- [FastAPI + Pydantic](https://fastapi.tiangolo.com/python-types/#pydantic-models)
Authoring guide: `.context/standards/README.md`
