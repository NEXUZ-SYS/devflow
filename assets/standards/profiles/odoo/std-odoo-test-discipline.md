---
id: std-odoo-test-discipline
description: Testes usam o framework de teste do Odoo — base de classe correta, sem unittest.TestCase cru e sem commit dentro do teste
version: 1.0.0
source: devflow-default-odoo
applyTo: ["**/tests/**/*.py"]
activation: on-demand
relatedAdrs: []
enforcement:
  linter: machine/std-odoo-test-discipline.js
---
## Princípios

- Escreva testes em cima do framework de teste do Odoo: herde de `odoo.tests.TransactionCase`, `SavepointCase`/`SingleTransactionCase`, `HttpCase` ou `TransactionCaseWithUserDemo` — nunca de `unittest.TestCase` cru, que não monta o `env`, o cursor de teste nem o rollback automático
- Deixe o framework gerenciar a transação: cada teste roda dentro de um savepoint que sofre rollback ao final — nunca chame `cr.commit()` dentro de um teste, pois isso vaza estado entre casos e quebra o isolamento
- Toda classe que contém métodos `def test_*` precisa de uma base do framework; classes utilitárias (sem `def test_`) podem herdar de `object` livremente
- Prepare dados compartilhados em `setUpClass` (criados uma vez por classe), não em `setUp` (recriado a cada teste) — mais rápido e alinhado ao ciclo do `TransactionCase`
- Marque a suíte com `@tagged('post_install', '-at_install')` quando o teste depende de todos os módulos já instalados
- Compare estado de registros com `assertRecordValues` em vez de ler campo a campo — a asserção é mais legível e cobre múltiplos registros de uma vez

## Anti-patterns

| Errado | Corrija para |
|---|---|
| `class TestX(unittest.TestCase):` | `class TestX(TransactionCase):` |
| `class TestX(object):` com `def test_*` | herde de uma base do framework (`TransactionCase`/`HttpCase`) |
| `class TestX:` (sem base) com `def test_*` | herde de uma base do framework |
| `self.env.cr.commit()` dentro de um teste | deixe o framework dar rollback no fim do teste |
| dados de fixture em `setUp` | use `setUpClass` para fixtures compartilhadas |
| ler campo a campo para asserção | `self.assertRecordValues(rec, [{...}])` |

## Linter

`machine/std-odoo-test-discipline.js` — gate por extensão (só processa `.py`; demais arquivos saem com exit 0). Implementação line-based com bloco de classe delimitado por indentação. Checks:

1. **Herança de `unittest.TestCase`** (estático) — flag qualquer `class X(unittest.TestCase)` (regex `/class\s+\w+\s*\(\s*unittest\.TestCase\s*\)/`). Use uma base do framework de teste do Odoo.
2. **Commit dentro de teste** (estático) — flag qualquer `cr.commit(` / `self.env.cr.commit(` / `self._cr.commit(` no arquivo de teste. O framework controla transação e rollback.
3. **Classe de teste sem base do framework** (bloco por indentação) — para cada `class X(BASES):`, examina o corpo (até a próxima `class`/dedent ou fim do arquivo); se houver `def test_*` e `BASES` não incluir nenhuma de `{TransactionCase, SingleTransactionCase, SavepointCase, HttpCase, TransactionCaseWithUserDemo, common.TransactionCase, common.HttpCase}`, flag com o nome da classe. Classe utilitária **sem** `def test_*` não é flagada.

Mensagens são deduplicadas e incluem o nome da classe envolvida.

Em **human-review** (não lintável, fica só nesta prosa):

4. Marcar a suíte com `@tagged('post_install', '-at_install')` quando aplicável.
5. Garantir que `tests/test_*.py` esteja importado em `tests/__init__.py` (senão o Odoo nem descobre o teste).
6. Fixtures compartilhadas em `setUpClass`, não em `setUp`.
7. Usar `assertRecordValues` para comparar estado de registros.

## Referência

- Odoo 18 — Testing Odoo (framework de teste, classes-base `TransactionCase`/`HttpCase`, `@tagged`, descoberta via `tests/__init__.py`): https://www.odoo.com/documentation/18.0/developer/reference/backend/testing.html
