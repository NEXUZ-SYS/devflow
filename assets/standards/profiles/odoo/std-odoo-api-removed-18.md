---
id: std-odoo-api-removed-18
description: Símbolos de view (XML) removidos ou renomeados na série Odoo 18
version: 1.0.0
source: devflow-default-odoo
appliesFrom: "18"
appliesUntil: null
applyTo: ["**/*.xml"]
activation: on-demand
relatedAdrs: []
enforcement:
  linter: machine/std-odoo-api-removed-18.js
---
## Princípios

- A partir da série **18**, as views nunca usam a tag `<tree>` nem o atributo `attrs=` — ambos deixaram de existir.
- **A faixa é o contrato, e aqui ela é o ponto inteiro.** `<tree>` é **correto** no Odoo 17; a renomeação para `<list>` é do 18. Estas duas regras rodando sem faixa num projeto 17 produziram **47 falso-positivos em 589 arquivos** — o defeito que originou o escopo de versão. `appliesFrom: "18"` é o que impede isso.
- A visibilidade condicional, antes expressa em `attrs="{'invisible': [...]}"`, agora é inline: `invisible="..."`, `readonly="..."`, `required="..."` com expressões Python diretas sobre os campos.
- `attrs` costuma esconder domínios não-triviais: ao migrar, releia a expressão em vez de transcrevê-la.

## Anti-patterns

| Errado | Certo |
|---|---|
| `<tree string="Pedidos">` | `<list string="Pedidos">` |
| `<field name="x" attrs="{'invisible': [('state','=','draft')]}"/>` | `<field name="x" invisible="state == 'draft'"/>` |
| `<field name="y" attrs="{'readonly': [('locked','=',True)]}"/>` | `<field name="y" readonly="locked"/>` |

## Linter

`./machine/std-odoo-api-removed-18.js` — recebe `filePath` em `process.argv[2]`, emite `VIOLATION: ...` e sai com 1. Só inspeciona `.xml`; **não** resolve a série do projeto.

## Referência

- Substitui a metade XML de `std-odoo-version-api-hygiene`, que misturava regras de 17 e de 18 num arquivo só.
