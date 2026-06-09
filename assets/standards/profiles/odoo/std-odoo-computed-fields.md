---
id: std-odoo-computed-fields
description: Computed fields sempre com @api.depends, iterando 'for record in self' e sem write() no corpo
version: 1.0.0
source: devflow-default-odoo
applyTo: ["**/models/**/*.py"]
activation: on-demand
relatedAdrs: []
enforcement:
  linter: machine/std-odoo-computed-fields.js
---
## Princípios

- Todo método `_compute_<x>` declara `@api.depends(...)` com TODOS os campos lidos no cálculo — inclusive dotted paths (`@api.depends('line_ids.price_subtotal')`); sem isso o ORM não sabe quando recalcular e o valor fica obsoleto
- Itere sempre `for record in self:` e atribua em `record.<campo>` — um compute pode receber um recordset com N registros; atribuir direto em `self.<campo>` quebra ou silencia em multi-record
- Compute calcula e atribui, nunca persiste: jamais chame `.write(...)` dentro de um `_compute_`; o ORM grava o resultado da atribuição sozinho, e um `write()` no compute gera recursão/efeitos colaterais
- Marque `store=True` quando o campo é pesquisado (`search`), agrupado ou ordenado — sem store o valor não existe na tabela e filtros/`order` ficam caros ou impossíveis
- Para campos `store=True`, garanta que `@api.depends` lista exatamente os gatilhos de recálculo; uma dependência faltante deixa dado persistido divergente do cálculo
- `@api.depends_context` complementa (cache por contexto), mas não substitui `@api.depends` — só faz sentido junto de um `@api.depends` que liste os campos de dados

## Anti-patterns

| Errado | Corrija para |
|---|---|
| `def _compute_total(self):` sem decorator | `@api.depends('a', 'b')` acima do `def` |
| `self.total = self.a + self.b` (atribui em `self`) | `for record in self: record.total = record.a + record.b` |
| `@api.depends('line_ids')` quando lê `line_ids.price` | `@api.depends('line_ids.price')` (dotted path completo) |
| `.write({...})` dentro de `_compute_` | Apenas `record.<campo> = ...`; o ORM persiste |
| Campo computed usado em `search`/`order` sem `store` | `fields.X(compute='_compute_x', store=True)` |
| `@api.depends_context(...)` sozinho num compute de dados | Adicione também `@api.depends(...)` com os campos lidos |

## Linter

`machine/std-odoo-computed-fields.js` — gate por extensão (só processa `.py`; demais arquivos saem com exit 0). Varre cada `def _compute_<x>(self...)` por análise de linhas (split em array) e blocos por indentação. Checks:

1. **compute sem `@api.depends`** (estático) — olha as linhas não-vazias imediatamente acima do `def` (pilha de decorators); se nenhuma é `@api.depends`, flag. `@api.depends_context` sozinho não satisfaz.
2. **compute sem `'for record in self'`** (estático) — no corpo do método (até o próximo `def` no mesmo nível de indentação ou fim do arquivo), se há atribuição `self.<campo> =` / `record.<campo> =` MAS nenhuma linha com `for ... in self` → flag. Um loop `for ... in self:` satisfaz.
3. **`write()` dentro de `_compute_`** (estático) — flag qualquer `.write(` no corpo do compute.

A mensagem distingue os métodos pelo nome (`_compute_total: ...`).

Em **human-review** (não lintável, fica só nesta prosa):

4. `store=True` quando o campo é pesquisado/agrupado/ordenado — exige conhecer as views e domínios que consomem o campo.
5. `@api.depends` deve listar TODOS os campos lidos no cálculo, inclusive dotted paths — validar completude exige análise semântica do corpo do método.

## Referência

- Odoo 18 — ORM / Computed fields (`@api.depends` + `for record in self`): https://www.odoo.com/documentation/18.0/developer/reference/backend/orm.html
- OCA pylint-odoo — checks `method-compute` (C8108) e `no-write-in-compute` (E8135): https://github.com/OCA/pylint-odoo
