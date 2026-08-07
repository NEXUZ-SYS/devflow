# Mudancas de ORM / backend por versao do Odoo (12 -> 18)

> Referencia de breaking changes do backend (ORM, Python, views) por salto de versao.
> Consolida o que estava espalhado na SKILL e adiciona os saltos 12->13 e 13->14.
>
> **Grounding (consulte antes de confiar na memoria):**
> - `mcp__docs-mcp-server__search_docs` lib `odoo-NN` (ex.: `odoo-12`, `odoo-17`, `odoo-18`).
>   Use `mcp__docs-mcp-server__find_version` para descobrir versoes indexadas.
> - `odoo.com/documentation/NN.0/developer` (release notes + ORM reference).
> - Fonte OCA: `github.com/oca` (repos `server-tools`, `server-auth`, `OpenUpgrade`).
> - **Status do indice docs-mcp (2026-06-17):** indexadas `odoo-12`, `odoo-17`, `odoo-18`.
>   As series `odoo-13`, `odoo-14`, `odoo-15`, `odoo-16` **nao** estao indexadas —
>   fatos exclusivos dessas series marcados com "nao confirmado" abaixo precisam de
>   `/devflow:scrape-stack-batch` antes de virarem fonte de verdade.

---

## Odoo 12 -> 13

> Grounding: `search_docs` lib `odoo-12` (confirma o estado de partida — `@api.multi`,
> `@api.one` ainda existem no 12); `odoo.com/documentation/13.0/developer` (release notes
> de 13 confirmam a remocao). `github.com/oca/OpenUpgrade` (scripts 12->13).

| Padrao | Odoo 12 | Odoo 13 | Notas |
|--------|---------|---------|-------|
| `@api.multi` | Decorador valido; metodo opera sobre recordset | **Removido** — metodos sao "multi" por padrao | No 13 todo metodo recebe `self` como recordset; remover o decorador. Confirmado: existe no 12 via `search_docs odoo-12`. ⚠️ remocao no 13 nao confirmada via docs-mcp (odoo-13 nao indexado) — fonte: release notes 13.0 + OpenUpgrade |
| `@api.one` | Decorador valido, **deprecated desde 9.0** | **Removido** | Substituir por loop explicito sobre `self` ou `self.ensure_one()`. Confirmado deprecated no 12 via `search_docs odoo-12` |
| `@api.cr` / `@api.model_cr` | Variantes de cursor explicito | Removidas | Migrar para o estilo "record" (env implicito) |
| `@api.returns` em metodos novos | Comum para compat old-API | Raramente necessario | A ponte old-API/new-API foi simplificada |
| `bin_size` / campos binarios | Comportamento legado | Ajustes de attachment | Verificar campos `Binary(attachment=True)` |

**Onchange / compute:** no 12 `@api.onchange` ja e o padrao moderno; no 13 a forma
nao muda, mas combine com `@api.depends` para logica que precisa rodar fora do form.
A recomendacao geral (12 e 13) e preferir **computed fields** a onchange quando o valor
deve persistir ou ser usado server-side.

---

## Odoo 13 -> 14

> Grounding: `odoo.com/documentation/14.0/developer`; `github.com/oca/OpenUpgrade`
> (scripts 13->14). ⚠️ odoo-13 e odoo-14 nao indexados no docs-mcp — indexar via
> `/devflow:scrape-stack-batch` para confirmar.

| Padrao | Odoo 13 | Odoo 14 | Notas |
|--------|---------|---------|-------|
| `@api.model_create_multi` | Disponivel | Recomendado para `create()` | `create()` passa a receber lista de dicts; retornar recordset |
| Assets via `__manifest__.py` `qweb`/`data` | Padrao antigo | Bundles `assets` introduzidos | Migracao gradual de assets; consolidada no 15+ |
| `attrs={'invisible': [...]}` em views | Valido | Valido | Dict-syntax ainda funciona (so deprecada no 17) |
| `name_get()` | Valido | Valido | Mantido ate 16; substituido por `_compute_display_name` no 17 |

---

## Odoo 14 -> 15

> Grounding: `odoo.com/documentation/15.0/developer`; `github.com/oca/OpenUpgrade`.
> ⚠️ odoo-15 nao indexado no docs-mcp.

| Padrao Odoo 14 | Padrao Odoo 15 | Notas |
|----------------|----------------|-------|
| `get_resource_path(module_path, resource)` | `get_resource_path(module_name, resource)` | Primeiro arg passa a ser o nome do modulo |
| `mrp.product.produce` wizard | `qty_producing` + `quantity_done` | Wizard removido no 15 |
| `message_post(subtype=)` | `message_post(subtype_xmlid=)` | Parametro renomeado |
| `super(ClassName, self)` | `super()` | Python 3 simplified super |
| `force_company` | `with_company(company)` | Contexto de empresa |
| `store=True` em `company_dependent` | Remover `store=True` | Conflito com `ir.property` |
| `ir.model.fields._get_id()` | `self.env['ir.model.fields'].search([...])` | Metodo removido no 15 |

---

## Odoo 15 -> 16

> Grounding: `odoo.com/documentation/16.0/developer`. ⚠️ odoo-16 nao indexado no docs-mcp.

| Area | Mudanca | Exemplo |
|------|---------|---------|
| Frontend | OWL 1.x -> OWL 2.x | `setup()` mantido, lifecycle hooks renomeados |
| JS imports | `require()` ainda funciona; `@module/path` introduzido | `const { useService } = require("@web/core/utils/hooks")` |
| Views | `attrs` dict ainda funciona | `attrs={'invisible': [...]}` OK |
| Python | Assets totalmente em bundles | Declarar em `assets` no manifest |

---

## Odoo 16 -> 17

> Grounding: `search_docs` lib `odoo-17`; `odoo.com/documentation/17.0/developer`.

| Area | Mudanca | Exemplo |
|------|---------|---------|
| Views | `attrs` dict **deprecado** | `attrs={'invisible': [...]}` -> `invisible="field == False"` |
| Views | `<tree>` -> `<list>` (transicao) | Rename de tag |
| Frontend | ES modules obrigatorios; `odoo.define()` deprecado | `/** @odoo-module **/` no topo |
| Python | `fields.Monetary` exige `currency_field` explicito | `currency_field='currency_id'` |
| ORM | `name_get()` -> `_compute_display_name()` | Computed field substitui o metodo |
| ORM | `_name_search()` -> `_search_display_name()` | Metodo renomeado |
| ORM | `search(domain, count=True)` -> `search_count(domain)` | `count=` removido de `search()` |

---

## Odoo 17 -> 18

> Grounding: `search_docs` lib `odoo-18`; `odoo.com/documentation/18.0/developer`.
> Fonte OCA: `github.com/oca/server-tools`, `github.com/oca/server-auth`.

### Mudancas semanticas (comportamento alterado)

| ID | Padrao | Antes (17) | Depois (18) | Notas |
|----|--------|-----------|-------------|-------|
| A1 | Product type storable | `type='product'` | `type='consu'` + `is_storable=True` | `'product'` removido do selection |
| A2 | Stock move quantity | `move.quantity_done` | `move.quantity` | Renomeado (ja no 17); `quantity_done` nao existe |
| A3 | Display name | `name_get()` | `_compute_display_name()` | Padrao OCA 18.0 |

### API breaking changes (metodo/campo removido)

| ID | Padrao | Antes | Depois (18) | Notas |
|----|--------|-------|-------------|-------|
| A4 | Name search | `_name_search()` | `_search_display_name()` | Metodo renomeado |
| A5 | XML view type | `<tree>` | `<list>` | Rename obrigatorio em todos os views |
| A6 | View attrs syntax | `attrs={'invisible': [...]}` | `invisible="f == V"` | Dict-syntax removida |
| A7 | Search count | `search(domain, count=True)` | `search_count(domain)` | `search_count()` nao aceita offset/limit/order |
| A8 | Cron numbercall | `<field name="numbercall">-1</field>` | (remover) | Campo removido de `ir.cron` |
| A9 | Magic fields | `_add_magic_fields()` | Class attributes (`_log_access`) | Metodo removido |
| A10 | QWeb cache clear | `ir.qweb.clear_caches()` | `registry.clear_all_caches()` | `ir.qweb` nao tem mais `clear_caches` |
| A11 | Cache invalidation | `invalidate_cache()` | `invalidate_recordset()` | Renomeado |
| A12 | Access check | `check_access_rights()` | `check_access()` | Deprecado |
| A13 | Create decorator | `@api.model` em `create()` | `@api.model_create_multi` | Deprecated no 18; retornar recordset |
| A14 | Hook signature | `post_init_hook(cr, registry)` | `post_init_hook(env)` | Assinatura mudou |

### Checklist de auditoria pos-migracao (grep)

```
grep -rn "count=True"      <modulos>/   # A7
grep -rn "quantity_done"   <modulos>/   # A2
grep -rn "type.*product"   <modulos>/   # A1
grep -rn "name_get"        <modulos>/   # A3/A4
grep -rn "<tree"           <modulos>/   # A5
grep -rn "attrs="          <modulos>/   # A6
grep -rn "numbercall"      <modulos>/   # A8
grep -rn "clear_caches"    <modulos>/   # A10
grep -rn "invalidate_cache" <modulos>/  # A11
```

> Regra: rodar a auditoria APOS cada grupo de modulos migrados, nao no final.
