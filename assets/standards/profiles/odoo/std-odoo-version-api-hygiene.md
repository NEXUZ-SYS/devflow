---
id: std-odoo-version-api-hygiene
description: Nunca emitir símbolo de API removido/renomeado no Odoo alvo (migração NXZ para 17/18)
version: 1.0.0
source: devflow-default-odoo
applyTo: ["**/*.py", "**/*.xml"]
activation: on-demand
relatedAdrs: []
enforcement:
  linter: machine/std-odoo-version-api-hygiene.js
---
## Princípios

- O alvo de migração NXZ é Odoo **17/18**: o código novo nunca emite símbolos de API que foram removidos ou renomeados nessas versões — falhar cedo no commit é mais barato que descobrir no upgrade do servidor.
- **Nuance de versão (leia antes de "corrigir" às cegas):** todos os símbolos cobertos por este standard são **válidos no Odoo 12** e só foram **removidos/renomeados no 17/18**. Este linter é orientado ao alvo de migração; não é um erro absoluto. Se você mantém um módulo que permanece em 12, esses símbolos continuam corretos lá — não ative este standard nesse módulo.
- ORM: `count=True` em `search()` virou método dedicado `search_count()`; `name_get()` foi substituído pelo campo computado `_compute_display_name`; `invalidate_cache()` virou `invalidate_recordset()` (e variantes de model/registry); os decorators `@api.one`/`@api.multi` foram removidos (todo método opera sobre recordset por padrão); `_columns`/`_defaults` são da API pré-8.0 e não existem mais.
- Views: a tag `<tree>` foi renomeada para `<list>` no 17+; o atributo `attrs="..."` (e o irmão `states="..."`) foi removido no 18 — a visibilidade/readonly condicional agora é expressa inline (`invisible="..."`, `readonly="..."`, `required="..."`) com expressões Python diretas sobre os campos.
- Migração é aditiva e auditável: ao portar um módulo de 12 para 17/18, trate cada símbolo flagado como item de checklist de upgrade, não como busca-e-substitui mecânico — `name_get` custom pode carregar lógica de display que precisa migrar para o computed, e `attrs` pode esconder domínios que precisam virar expressão inline.

## Anti-patterns

Coluna **Versão** indica onde o símbolo errado ainda é válido. Em todos os casos ele é **removido/renomeado no Odoo 17/18** (o alvo NXZ).

### Python (`.py`)

| Errado | Corrija para | Versão (válido em → removido em) |
|---|---|---|
| `self.search(domain, count=True)` | `self.search_count(domain)` | ≤12 → 17/18 |
| `def name_get(self):` | `def _compute_display_name(self):` (`display_name` computado) | ≤16 → 17+ |
| `self.invalidate_cache()` | `self.invalidate_recordset()` | ≤13 → 17/18 |
| `@api.one` / `@api.multi` | remover o decorator (método opera sobre recordset) | ≤12 → 17/18 |
| `_columns = {...}` | declarar `fields.X(...)` como atributos de classe | pré-8.0 → 17/18 |
| `_defaults = {...}` | usar `default=` em cada `fields.X(...)` | pré-8.0 → 17/18 |

### XML (`.xml`)

| Errado | Corrija para | Versão (válido em → removido em) |
|---|---|---|
| `<tree string="x">` | `<list string="x">` | ≤16 → 17+ |
| `<field name="x" attrs="{'invisible': [...]}"/>` | `<field name="x" invisible="not active"/>` (expressão inline) | ≤17 → 18 |

## Linter

`machine/std-odoo-version-api-hygiene.js` — gate por extensão: roda os checks `.py` em arquivos `.py`, os checks `.xml` em arquivos `.xml`, e sai com exit 0 para qualquer outra extensão. Dedup via `Set` (cada símbolo é reportado uma vez). Em violação emite uma linha `VIOLATION: ...` e exit 1.

**Atenção à nuance de versão:** o linter sinaliza esses símbolos como obsoletos **para o alvo Odoo 17/18**. Num módulo que permanece em 12 eles são corretos — não rode este standard sobre código 12. O perfil ativa este standard apenas em módulos marcados para migração.

Checks `.py`:

1. `.search(...)` contendo `count=True` → use `search_count()`.
2. `def name_get(` → removido no 17+, use `_compute_display_name`.
3. `.invalidate_cache(` → use `invalidate_recordset()`.
4. `@api.one` ou `@api.multi` (com word boundary) → removidos.
5. `_columns =` ou `_defaults =` → API legada pré-8.0.

Checks `.xml`:

6. `<tree` abertura de tag (regex `/<tree[\s>]/`, que não confunde com `<treeview>` nem com atributos que contenham "tree") → renomeado para `<list>` no 17+.
7. `attrs=` ou `attrs =` em elemento → removido no 18 (use `invisible="..."`, `readonly="..."` etc. inline).

## Referência

- Odoo 18 — ORM API reference (`search_count`, `display_name`, `invalidate_recordset`): https://www.odoo.com/documentation/18.0/developer/reference/backend/orm.html
- OCA pylint-odoo — checks `deprecated-*` (símbolos de API descontinuados por versão): https://github.com/OCA/pylint-odoo
- Origem interna NXZ — `skills/odoo-development` e `agents/odoo-specialist.md` (alvo de migração 17/18; padrões de port de POS e localização brasileira).
