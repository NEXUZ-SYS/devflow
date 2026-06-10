---
id: std-odoo-naming-conventions
description: Nomenclatura Odoo — sufixo relacional (_id/_ids) nos campos e prefixo _compute_ nos métodos de cálculo
version: 1.0.0
source: devflow-default-odoo
applyTo: ["**/models/**/*.py"]
activation: on-demand
relatedAdrs: []
enforcement:
  linter: machine/std-odoo-naming-conventions.js
---
## Princípios

- Campo `Many2one` sempre termina em `_id` (singular) — ex.: `partner_id`, `order_id` — porque carrega um único registro relacionado por seu id
- Campos `One2many` e `Many2many` sempre terminam em `_ids` (plural) — ex.: `line_ids`, `tag_ids` — porque carregam um recordset de múltiplos ids
- Método de campo calculado leva o prefixo `_compute_` e casa com o nome do campo: `total = fields.Float(compute='_compute_total')` ↔ `def _compute_total(self)`
- Métodos auxiliares de campo seguem o mesmo padrão de prefixo: `_search_<campo>` para `search=`, `_inverse_<campo>` para campos editáveis calculados, `_default_<campo>` para defaults
- `_name` do modelo é singular e pontilhado no namespace do módulo: `sale.order`, `res.partner.bank` — nunca plural nem com `_` no lugar do `.`
- `_description` sempre presente e legível por humano — o ORM emite warning sem ele
- Classe Python em `CamelCase` derivada do `_name`: `sale.order` → `class SaleOrder(models.Model)`
- Ações de servidor/botão usam o prefixo `action_`: `def action_confirm(self)` — é a convenção que o web client espera para chamadas via botão
- XML ids de registros referenciam o campo com `_` simples; o nome técnico interno de campos relacionais no XML (12) vs ES module nos assets (17/18) acompanha a versão alvo do módulo

## Anti-patterns

| Errado | Corrija para |
|---|---|
| `partner = fields.Many2one('res.partner')` | `partner_id = fields.Many2one('res.partner')` |
| `lines = fields.One2many('x', 'y')` | `line_ids = fields.One2many('x', 'y')` |
| `tags = fields.Many2many('t')` | `tag_ids = fields.Many2many('t')` |
| `@api.depends('a')` + `def compute_total(self)` | `@api.depends('a')` + `def _compute_total(self)` |
| `_name = 'sale_orders'` | `_name = 'sale.order'` (singular, pontilhado) |
| modelo sem `_description` | sempre declarar `_description = 'Sale Order'` |
| `class sale_order(models.Model)` | `class SaleOrder(models.Model)` (CamelCase) |
| `def confirm(self)` para botão | `def action_confirm(self)` |

## Linter

`machine/std-odoo-naming-conventions.js` — gate por extensão (só processa `.py`; demais arquivos saem com exit 0) e line-based para baixo falso-positivo. Checks **estáticos** (enforçados):

1. **Sufixo `_id` em `Many2one`** — linha `<nome> = fields.Many2one(` cujo `<nome>` não termina em `_id` é flagada. Nome que já termina em `_id` (ex.: `related_id`) não é flagado.
2. **Sufixo `_ids` em `One2many`/`Many2many`** — linha `<nome> = fields.One2many(` / `fields.Many2many(` cujo `<nome>` não termina em `_ids` é flagada.
3. **Prefixo `_compute_` no método de compute** — quando `@api.depends(` é seguido (pulando decorators encadeados) de um `def <nome>(` cujo `<nome>` não começa com `_compute_`, é flagado.

A mensagem de violação inclui o nome do campo/método ofensor.

Em **human-review** (não lintável, fica só nesta prosa — exige contexto semântico que regex de linha não cobre com segurança):

4. `_name` singular e pontilhado (`sale.order`, não `sale_orders`).
5. `_description` sempre presente.
6. Classe Python em `CamelCase` derivada do `_name`.
7. XML id com `_` simples e nome técnico de campo conforme a versão alvo (12 vs 17/18).
8. Prefixo `action_` para ações de servidor/botão; `_search_`/`_inverse_`/`_default_` para os métodos auxiliares de campo correspondentes.

## Referência

- Odoo 12 — Coding Guidelines (sufixo `_id`/`_ids`, prefixos de método, modelo singular): https://www.odoo.com/documentation/12.0/reference/guidelines.html
- Odoo 18 — Coding Guidelines: https://www.odoo.com/documentation/18.0/contributing/development/coding_guidelines.html
- OCA pylint-odoo — checks `method-compute`, `method-search`, `method-inverse`: https://github.com/OCA/pylint-odoo
