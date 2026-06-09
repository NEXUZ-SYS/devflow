---
id: std-odoo-i18n
description: Disciplina de tradução em Odoo — _() recebe literal e placeholders lazy, nunca interpolação ansiosa
version: 1.0.0
source: devflow-default-odoo
applyTo: ["**/*.py"]
activation: on-demand
relatedAdrs: []
enforcement:
  linter: machine/std-odoo-i18n.js
---
## Princípios

- O argumento de `_()` (e `_lt()`) é sempre um **literal de string estático** — é o que o extrator `xgettext`/`babel` enxerga em build-time para alimentar o `.pot`. Qualquer interpolação aplicada dentro da chamada quebra a extração.
- Interpolação acontece **depois** da tradução, via placeholders nomeados lazy: `_("Saldo de %(nome)s: %(valor)s", nome=p.name, valor=v)`. O `%` fica dentro da string traduzível; a aplicação é responsabilidade do runtime de tradução, não do seu código.
- Prefira placeholders **nomeados** (`%(nome)s`) a posicionais (`%s`): a ordem das variáveis pode mudar de um idioma para outro, e o nome dá contexto ao tradutor.
- Nunca passe f-string, `.format()`, `%` aplicado ou concatenação `+` para `_()` — todos resolvem a string antes da extração, deixando o `.pot` com o texto da língua-fonte literal (ou pior, com `{}`/`%s` crus) e impossibilitando a tradução.
- Não traduza **definições de field** (`string=`, `help=`, `selection=`): o Odoo já extrai e traduz esses metadados automaticamente via ORM. Envolvê-los em `_()` é redundante e pode causar dupla tradução. (human-review)
- Em Odoo 18+, prefira `self.env._(...)` ao `_` importado de `odoo.tools.translate` quando houver `self` em escopo — o método de ambiente resolve o idioma do contexto corrente sem import global. (human-review)

## Anti-patterns

| Errado | Corrija para |
|---|---|
| `_(f"Partner {p.name} bloqueado")` | `_("Partner %(name)s bloqueado", name=p.name)` |
| `_("Total: %s" % total)` | `_("Total: %(total)s", total=total)` |
| `_("x {}".format(y))` | `_("x %(y)s", y=y)` |
| `_("prefixo " + nome)` | `_("prefixo %(nome)s", nome=nome)` |
| `_(field.string)` / `_()` em `string=`/`help=` | Deixar o ORM extrair; não envolver em `_()` |
| `from odoo.tools.translate import _` em 18+ com `self` disponível | `self.env._("...")` |

## Linter

`machine/std-odoo-i18n.js` opera line-/content-based sobre arquivos `.py` (gate por extensão; demais arquivos passam com exit 0). Falha (`VIOLATION` + exit 1) quando detecta dentro de uma chamada `_(...)`:

1. **f-string** — `_(f"..."` ou `_(f'...'`.
2. **`.format()`** — `_( ... .format(` antes do fechamento.
3. **interpolação `%` ansiosa** — literal de string seguido de ` % ` aplicado fora da string (não confunde com o placeholder lazy `%(n)s`, que vive dentro da string, nem com literais como `"100% concluído"`).
4. **concatenação `+`** — `_("..." +`.

Não sinaliza `_("texto simples")` nem `_("x %(n)s", n=v)`. As regras human-review (definição de field, `self.env._()`) não são lintáveis — ficam para revisão de código.

## Referência

- OCA pylint-odoo — checks `translation-fstring-interpolation`, `translation-format-interpolation`, `translation-not-lazy`, `translation-required`: https://github.com/OCA/pylint-odoo
- Odoo 17.0 Coding Guidelines (seção Symbols and Conventions / Translations): https://www.odoo.com/documentation/17.0/contributing/development/coding_guidelines.html
