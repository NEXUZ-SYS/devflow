---
id: std-odoo-orm-discipline
description: Acesso a dados sempre via ORM — sem SQL cru para CRUD, sem interpolação em queries e sem commit cru
version: 1.0.0
source: devflow-default-odoo
applyTo: ["**/*.py"]
activation: on-demand
relatedAdrs: []
enforcement:
  linter: machine/std-odoo-orm-discipline.js
---
## Princípios

- Nunca bypasse o ORM para CRUD: use `create`/`write`/`unlink`/`search`/`read` em vez de `INSERT`/`UPDATE`/`DELETE`/`SELECT` cru — o ORM aplica regras de acesso, constraints e computed fields
- Nunca dê commit cru no cursor (`cr.commit()`); o Odoo gerencia a transação por request — um commit manual quebra atomicidade e rollback
- SQL cru, quando inevitável (leitura agregada de alta performance), só com `cr.execute("... %s", (params,))` parametrizado — jamais com f-string, `.format()`, `%` ou concatenação `+` na string da query
- Em overrides de `create`/`write`/`unlink`, sempre chame `super()` e retorne o resultado — quebrar a cadeia silencia a lógica de módulos a montante
- Nunca faça monkey-patch da classe base do ORM; estenda via herança Odoo (`_inherit`) para manter a ordem de carga e a rastreabilidade
- Trate `recordset` como imutável de transação: deixe o ORM decidir flush/commit; nunca force persistência manual

## Anti-patterns

| Errado | Corrija para |
|---|---|
| `cr.execute("... WHERE name='%s'" % name)` | `cr.execute("... WHERE name=%s", (name,))` |
| `cr.execute(f"SELECT {col} FROM t")` | Mapeie a coluna por allowlist e parametrize os valores |
| `cr.execute("... id={}".format(id))` | `cr.execute("... id=%s", (id,))` |
| `cr.execute("... '" + name + "'")` | `cr.execute("... %s", (name,))` |
| `self.env.cr.commit()` no fluxo de request | Deixe o ORM commitar no fim da transação |
| `INSERT/UPDATE/DELETE` cru para CRUD | `record.create(...)` / `record.write(...)` / `record.unlink()` |
| `def create(...)` sem `super()` | `res = super().create(vals); ...; return res` |
| Monkey-patch da classe base do ORM | Herança Odoo via `_inherit` |

## Linter

`machine/std-odoo-orm-discipline.js` — gate por extensão (só processa `.py`; demais arquivos saem com exit 0). Checks:

1. **SQL injection em `.execute()`** (estático) — flag se a chamada `.execute(` usa f-string (`f"..."`), `.format(`, operador `%` sobre literal de string, ou concatenação `+` de literal. Placeholder parametrizado (`"... %s", (ids,)`) NÃO é flagado — é o jeito correto.
2. **Commit cru** (estático) — flag qualquer `cr.commit()` / `self.env.cr.commit()` / `self._cr.commit()`.

Em **human-review** (não lintável, fica só nesta prosa):

3. Nunca SQL cru para operações de CRUD (use o ORM) — distinguir leitura agregada legítima de CRUD disfarçado exige contexto semântico.
4. Sempre `super()` em overrides de `create`/`write`/`unlink` retornando o resultado.
5. Nunca monkey-patch da classe base do ORM; estenda via `_inherit`.

## Referência

- Odoo 12 — Coding Guidelines (Never bypass the ORM / Never commit the transaction): https://www.odoo.com/documentation/12.0/reference/guidelines.html
- Odoo 17 — Security in Odoo (SQL injection): https://www.odoo.com/documentation/17.0/developer/reference/backend/security.html
- OCA pylint-odoo — checks `sql-injection` (E8103) e `invalid-commit` (E8102): https://github.com/OCA/pylint-odoo
