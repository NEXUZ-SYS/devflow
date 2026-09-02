---
id: std-odoo-api-removed-17
description: Símbolos da API Python removidos ou renomeados na série Odoo 17
version: 1.0.0
source: devflow-default-odoo
appliesFrom: "17"
appliesUntil: null
applyTo: ["**/*.py"]
activation: on-demand
relatedAdrs: []
enforcement:
  linter: machine/std-odoo-api-removed-17.js
---
## Princípios

- A partir da série **17**, o código Python nunca emite símbolos de API que foram removidos ou renomeados — falhar no commit é mais barato que descobrir no upgrade do servidor.
- **A faixa é o contrato.** Este standard declara `appliesFrom: "17"`: num módulo que permanece em 12 ou 15 os símbolos abaixo continuam **corretos**, e o standard simplesmente não se aplica. O linter não decide isso — quem decide é a faixa, avaliada contra a série resolvida do projeto.
- ORM: `count=True` em `search()` virou o método dedicado `search_count()`; `name_get()` foi substituído pelo campo computado `_compute_display_name`; `invalidate_cache()` virou `invalidate_recordset()`; os decorators `@api.one`/`@api.multi` foram removidos (todo método opera sobre recordset por padrão); `_columns`/`_defaults` são da API pré-8.0.
- Migração é aditiva e auditável: trate cada símbolo flagado como item de checklist de upgrade, não como busca-e-substitui — um `name_get` custom pode carregar lógica de display que precisa migrar para o computed.

## Anti-patterns

| Errado | Certo |
|---|---|
| `self.env["res.partner"].search([], count=True)` | `self.env["res.partner"].search_count([])` |
| `def name_get(self): return [(r.id, r.name) for r in self]` | `@api.depends("name")`<br>`def _compute_display_name(self): ...` |
| `self.invalidate_cache()` | `self.invalidate_recordset()` |
| `@api.multi`<br>`def action_confirm(self):` | `def action_confirm(self):` — recordset é o padrão |
| `_columns = {"name": fields.char()}` | `name = fields.Char()` |
| `_defaults = {"state": "draft"}` | `state = fields.Selection(..., default="draft")` |

## Linter

`./machine/std-odoo-api-removed-17.js` — recebe `filePath` em `process.argv[2]`, emite `VIOLATION: ...` e sai com 1. Só inspeciona `.py`; **não** resolve a série do projeto.

## Referência

- Substitui a metade Python de `std-odoo-version-api-hygiene`, que misturava regras de 17 e de 18 num arquivo só.
