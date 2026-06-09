---
id: std-odoo-orm-performance
description: Evite N+1 e padrões de ORM custosos — sem chamada ORM dentro de loop, agregue com _read_group, busque em lote
version: 1.0.0
source: devflow-default-odoo
applyTo: ["**/*.py"]
activation: on-demand
relatedAdrs: []
enforcement:
  linter: machine/std-odoo-orm-performance.js
---
## Princípios

- Nunca dispare SQL dentro de um loop: `.search`, `.search_count`, `.read_group`, `._read_group` e `.browse` chamados a cada iteração geram o padrão N+1 — uma query por registro. Faça a leitura UMA vez em lote, antes do loop, e itere sobre o recordset resultante
- Busque em lote com `in self.ids` (ou a lista de ids relevante) em vez de `=` por id dentro do loop; um único `search([('order_id','in',self.ids)])` substitui N buscas individuais
- O ORM já faz **prefetch** automático: ao iterar `for record in self`, ler `record.<campo>` carrega o campo para TODO o recordset de uma vez. Não force `browse` registro a registro — isso quebra o prefetch e volta a N queries
- Para agregações (soma, contagem, média por grupo) use `_read_group`, que delega o trabalho ao banco, em vez de carregar todos os registros e somar em Python
- Para testes de pertencimento (`x in colecao`) repetidos dentro de um loop, converta a coleção para `set` uma vez antes do loop — `in` em lista é O(n), em set é O(1)
- Campos frequentemente pesquisados merecem índice (`index=True`, ou `index='trigram'` para busca textual); campos computed usados em `search`/`order` precisam de `store=True` para existirem na tabela

## Anti-patterns

| Errado | Corrija para |
|---|---|
| `for o in self: ...search([('order_id','=',o.id)])` | `lines = ...search([('order_id','in',self.ids)])` ANTES do loop |
| `for r in recs: p = ...browse(r.partner_id)` | `partners = ...browse(recs.mapped('partner_id'))` antes; itere o recordset |
| `for o in self: n = ...search_count([...])` no corpo | Conte uma vez em lote, ou agregue com `_read_group` |
| Somar em Python iterando todos os registros | `_read_group(domain, ['amount:sum'], ['group_field'])` |
| `if x in lista:` repetido dentro de loop | `s = set(lista)` antes do loop; teste `if x in s:` |
| Campo pesquisado sem índice | `fields.X(..., index=True)` (ou `index='trigram'`) |
| Computed usado em `search`/`order` sem `store` | `fields.X(compute='_compute_x', store=True)` |

## Linter

`machine/std-odoo-orm-performance.js` — gate por extensão (só processa `.py`; demais arquivos, incl. `.xml`/`.js`, saem com exit 0). Faz UM check estático parcial e deixa os demais como human-review.

**Check estático (lintável):**

1. **Query dentro de loop (N+1)** — localiza cada cabeçalho `for <x> in <y>:`, delimita o CORPO por indentação (até o primeiro dedent ≤ indentação do `for`) e procura no corpo uma chamada ORM que dispara SQL: `.search(`, `.search_count(`, `.read_group(`, `._read_group(` ou `.browse(`. Se encontrar, flag `chamada ORM (<método>) dentro de loop (N+1) — faça em lote fora do loop`. A mesma chamada FORA do for (antes ou depois, em indentação ≤ a do for) NÃO é flagada — esse é exatamente o padrão correto (busca em lote). O check é parcial: cobre o corpo do for por indentação (inclusive aninhamentos `if`/`for` mais internos), mas não resolve aliases nem fluxo de dados.

Em **human-review** (não lintável, fica só nesta prosa):

2. Usar `_read_group` para agregação no banco em vez de carregar registros e somar em Python — exige entender a intenção do cálculo.
3. Converter lista para `set` antes de testes `in` repetidos — exige rastrear o uso da coleção no loop.
4. `browse` em lote antes do loop (preservando o prefetch) em vez de `browse` por id dentro dele — exige análise de fluxo de dados.
5. `index=True` / `index='trigram'` em campo efetivamente pesquisado — exige conhecer os domínios e views que consomem o campo.
6. `store=True` em computed usado em `search`/`order` — exige conhecer as views e domínios consumidores.

## Referência

- Odoo 18 — Performance (N+1, prefetch, agregação no banco): https://www.odoo.com/documentation/18.0/developer/reference/backend/performance.html
- Odoo 18 — ORM / prefetch: https://www.odoo.com/documentation/18.0/developer/reference/backend/orm.html
