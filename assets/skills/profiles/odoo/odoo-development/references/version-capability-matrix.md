# Matriz de capacidades por versao do Odoo (12 -> 18)

> Feature / API -> faixa de versao em que se aplica. Use para decidir a syntax correta
> antes de escrever codigo. Sempre confirme contra a doc da versao target.
>
> **Grounding:** `mcp__docs-mcp-server__search_docs` lib `odoo-NN`;
> `odoo.com/documentation/NN.0/developer`; `github.com/oca`.
> Indice docs-mcp (2026-06-17): `odoo-12`, `odoo-17`, `odoo-18` indexados;
> `odoo-13`/`14`/`15`/`16` ⚠️ nao indexados — indexar via `/devflow:scrape-stack-batch`.

## Backend / ORM

| Feature / API | 12 | 13 | 14 | 15 | 16 | 17 | 18 |
|---------------|----|----|----|----|----|----|----|
| `@api.multi` decorador | sim | nao | nao | nao | nao | nao | nao |
| `@api.one` decorador | sim (deprecated) | nao | nao | nao | nao | nao | nao |
| Metodos "multi" por padrao | nao | sim | sim | sim | sim | sim | sim |
| `@api.model_create_multi` | nao | sim | sim | sim | sim | sim | sim (recomendado) |
| `name_get()` override | sim | sim | sim | sim | sim | nao | nao |
| `_compute_display_name()` | nao | nao | nao | nao | nao | sim | sim |
| `search(domain, count=True)` | sim | sim | sim | sim | sim | sim | nao |
| `search_count(domain)` | sim | sim | sim | sim | sim | sim | sim |
| `invalidate_cache()` | sim | sim | sim | sim | sim | sim | nao |
| `invalidate_recordset()` | nao | nao | nao | nao | nao | sim | sim |
| `type='product'` (produto estocavel) | sim | sim | sim | sim | sim | sim | nao |
| `type='consu'` + `is_storable=True` | nao | nao | nao | nao | nao | nao | sim |
| `move.quantity_done` | sim | sim | sim | sim | sim | nao | nao |
| `move.quantity` | nao | nao | nao | nao | nao | sim | sim |

## Views (XML)

| Feature | 12 | 13 | 14 | 15 | 16 | 17 | 18 |
|---------|----|----|----|----|----|----|----|
| `<tree>` tag | sim | sim | sim | sim | sim | sim (transicao) | nao |
| `<list>` tag | nao | nao | nao | nao | nao | sim | sim |
| `attrs={'invisible': [...]}` dict | sim | sim | sim | sim | sim | deprecado | nao |
| `invisible="expression"` inline | nao | nao | nao | nao | nao | sim | sim |

## Frontend (web client / POS)

> Detalhes em `frontend-specialist-odoo` (skill irma). Resumo de eras:

| Era de frontend | Versoes |
|-----------------|---------|
| Widgets legados + Backbone (`web.widget`, `odoo.define` classico) | 12, 13, 14 |
| OWL 1.x (hibrido com Backbone no POS) | 15, 16 |
| OWL 2.x, ES modules obrigatorios | 17 |
| OWL 3.x, POS sem Backbone (`pos.load.mixin`) | 18 |

## Python

| Requisito | 12 | 13 | 14 | 15 | 16 | 17 | 18 |
|-----------|----|----|----|----|----|----|----|
| Python minimo (aprox.) | 3.5+ | 3.6+ | 3.6+ | 3.7+ | 3.8+ | 3.10+ | 3.10+ |

> Versoes minimas de Python sao aproximadas; confirme no `odoo.com/documentation/NN.0`
> de cada serie (release notes / install).
