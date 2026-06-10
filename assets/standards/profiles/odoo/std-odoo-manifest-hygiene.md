---
id: std-odoo-manifest-hygiene
description: Higiene do __manifest__.py — name obrigatório, version série-prefixada e license explícita
version: 1.0.0
source: devflow-default-odoo
applyTo: ["**/__manifest__.py", "**/__openerp__.py"]
activation: on-demand
relatedAdrs: []
enforcement:
  linter: machine/std-odoo-manifest-hygiene.js
---
## Princípios

- Todo módulo Odoo declara um `__manifest__.py` (ou o legado `__openerp__.py`) com um dict Python contendo, no mínimo, `name`, `version` e `license` — são os metadados que o instalador e o App Store leem.
- A `version` segue o formato **série-prefixada de 5 segmentos** `<série>.<major>.<minor>.<patch>.<build>` (ex.: `18.0.1.0.0`). Os dois primeiros segmentos amarram o módulo à série do Odoo; os três últimos são o semver interno do módulo. Sem o prefixo de série, o gerenciador de updates não consegue ordenar migrações corretamente.
- A `license` é declarada **explicitamente** (ex.: `LGPL-3`, `AGPL-3`, `OPL-1`). Omitir a licença deixa o módulo num limbo legal e o pylint-odoo trata como `license-allowed` em falha.
- Em módulos publicados pela OCA, `author` deve incluir `"Odoo Community Association (OCA)"` — requisito do check `manifest-required-author`.
- A lista `data` é ordenada por dependência de carga: arquivos de **security** (grupos, `ir.model.access.csv`, regras) antes de **views**, senão a instalação quebra por referência a grupos ainda inexistentes.
- Não use chaves depreciadas (ex.: `active`, `description` como caminho de arquivo) nem o nome legado `__openerp__.py` em código novo — mantenha-o apenas por compatibilidade com módulos antigos.

## Anti-patterns

| Errado | Corrija para |
|---|---|
| `'version': '1.0.0'` (3 segmentos, sem série) | `'version': '18.0.1.0.0'` (série-prefixada, 5 segmentos) |
| Dict de manifest sem chave `'name'` | Declare `'name': 'Nome do Módulo'` (obrigatória) |
| Dict de manifest sem chave `'license'` | Declare `'license': 'LGPL-3'` (ou `AGPL-3`/`OPL-1`) explicitamente |
| `version` ausente | Adicione `'version'` série-prefixada; sem ela o update manager não versiona o módulo |
| Módulo OCA sem `Odoo Community Association (OCA)` em `author` | Inclua a OCA na string de `author` |
| `data` com views antes de security | Liste security (`ir.model.access.csv`, grupos, regras) antes das views |
| Novo módulo nomeado `__openerp__.py` | Use `__manifest__.py`; reserve `__openerp__.py` para legado |

## Linter

`machine/std-odoo-manifest-hygiene.js` (Node, sem deps). Recebe o caminho do arquivo em `argv[2]`. Gate por basename: só processa `__manifest__.py` ou `__openerp__.py` — qualquer outro arquivo resulta em `exit 0` (não é manifest). Checa três regras no conteúdo do dict:

1. **`name` ausente** → flag (obrigatória).
2. **`version` mal-formada** → flag quando o valor não casa `^\d+\.\d+\.\d+\.\d+\.\d+$` (5 segmentos série-prefixados). Se `version` estiver ausente, emite o flag brando "manifest sem 'version'".
3. **`license` ausente** → flag (declare explicitamente).

Violação imprime `VIOLATION: ...` e sai com `exit 1`; manifest limpo sai com `exit 0`. As regras de **author OCA**, ordenação de `data` e chaves depreciadas são human-review (não automatizadas) — confira na revisão de PR.

## Referência

- [Odoo 18 — Module manifest](https://www.odoo.com/documentation/18.0/developer/reference/backend/module.html) — formato do manifest e da `version`.
- [OCA/pylint-odoo](https://github.com/OCA/pylint-odoo) — checks `manifest-required-author`, `manifest-required-key`, `license-allowed`, `manifest-version-format`.
