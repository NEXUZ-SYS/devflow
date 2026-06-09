---
id: std-odoo-qweb-escaping
description: Escaping anti-XSS em templates QWeb — sem t-raw nem t-esc; saída sempre via t-out, com HTML confiável só por markupsafe.Markup
version: 1.0.0
source: devflow-default-odoo
applyTo: ["**/*.xml", "**/static/src/**/*.xml"]
activation: on-demand
relatedAdrs: []
enforcement:
  linter: machine/std-odoo-qweb-escaping.js
---
## Princípios

- Toda saída dinâmica em QWeb passa por `t-out`, que escapa o conteúdo por padrão — é a única diretiva de saída suportada no Odoo 18 e a defesa primária contra XSS
- `t-raw` foi **removido** no QWeb moderno: ele injetava o valor sem escaping e é uma porta direta de XSS — substitua por `t-out`
- `t-esc` está **deprecado** desde o Odoo 18: embora escape, foi unificado em `t-out` — mantê-lo é dívida que quebra na migração
- Renderizar HTML intencional (e-mails, snippets) só com conteúdo **confiável** marcado via `markupsafe.Markup` no servidor; `t-out` respeita o `Markup` e não re-escapa — nunca embrulhe entrada de usuário em `Markup`
- Herança de template via `t-inherit` SEMPRE com prefixo de módulo no id (`addon.Template`), nunca o nome curto — id sem namespace colide entre addons e torna a ordem de aplicação imprevisível
- Estenda templates por `xpath` cirúrgico, jamais por substituição integral — redefinir o template inteiro descarta a herança a montante e silencia customizações de outros módulos

## Anti-patterns

| Errado | Corrija para |
|---|---|
| `<span t-raw="record.note"/>` | `<span t-out="record.note"/>` |
| `<div t-esc="value"/>` | `<div t-out="value"/>` |
| `t-out="Markup(user_input)"` (HTML de entrada não confiável) | `t-out="user_input"` (deixe escapar) ou sanitize antes |
| `<t t-inherit="my_template">` (id sem prefixo de módulo) | `<t t-inherit="addon.my_template">` |
| Redefinir o template inteiro para mudar um nó | `xpath` apontando só o nó a alterar |

## Linter

`machine/std-odoo-qweb-escaping.js` — gate por extensão (só processa `.xml`; demais arquivos saem com exit 0). Usa regex tolerante a espaço (`\bt-raw\s*=`, `\bt-esc\s*=`) e dedup por `Set` (cada tipo conta uma vez por arquivo). Checks:

1. **`t-raw=`** (estático) — flag qualquer atributo `t-raw=` (removido/desencorajado; risco direto de XSS; usar `t-out`).
2. **`t-esc=`** (estático) — flag qualquer atributo `t-esc=` (deprecado no Odoo 18; usar `t-out`).

Em **human-review** (não lintável, fica só nesta prosa):

3. HTML intencional só via `markupsafe.Markup` sobre conteúdo confiável — distinguir markup legítimo de entrada de usuário embrulhada exige contexto semântico.
4. `t-inherit` sempre com prefixo de módulo (`addon.Template`) — validar o namespace correto depende do manifesto do addon.
5. Herança via `xpath`, não substituição integral do template — detectar redefinição abusiva exige comparar com o template-base original.

## Referência

- Odoo 18 — QWeb Templates (`t-out`; `t-raw` removido; `t-esc` deprecado): https://www.odoo.com/documentation/18.0/developer/reference/frontend/qweb.html
- Odoo 18 — Security in Odoo (XSS; `t-raw`/HTML só para conteúdo confiável; `markupsafe.Markup`): https://www.odoo.com/documentation/18.0/developer/reference/backend/security.html
