---
id: std-odoo-code-hygiene
description: Higiene de código Python em addons Odoo — sem print() cru e HTTP sempre com timeout
version: 1.0.0
source: devflow-default-odoo
applyTo: ["**/*.py"]
activation: on-demand
relatedAdrs: []
enforcement:
  linter: machine/std-odoo-code-hygiene.js
---
## Princípios

- Nunca use `print()` para diagnóstico em addons Odoo; instancie um logger por módulo (`_logger = logging.getLogger(__name__)`) e registre via `_logger.debug/info/warning/error`
- Toda chamada HTTP de saída (`requests.get/post/put/delete/patch/request/head`) declara `timeout=` explícito; sem ele, um endpoint lento trava o worker do Odoo indefinidamente
- O rótulo `string=` de um campo só existe para divergir do nome inferido; se for igual ao label automático do campo, é redundante e deve ser removido
- Cada módulo Python termina com o comentário de modeline `# vim:` que a OCA padroniza, mantendo consistência de formatação entre contribuidores
- Imports dentro de um addon usam caminho relativo (`from . import models`); caminho absoluto acopla ao nome de instalação do addon e quebra ao renomear o diretório

## Anti-patterns

| Errado | Corrija para |
|---|---|
| `print("debug")` | `_logger.info("debug")` (logger por módulo) |
| `requests.get(url)` | `requests.get(url, timeout=10)` |
| `requests.post(url, json=data)` | `requests.post(url, json=data, timeout=5)` |
| `name = fields.Char(string="Name")` (redundante) | `name = fields.Char()` (label já inferido) |
| `from odoo.addons.meu_addon import models` (absoluto interno) | `from . import models` (relativo) |
| Arquivo sem modeline | Acrescentar `# vim:expandtab:smartindent:tabstop=4:softtabstop=4:shiftwidth=4:` no fim |

## Linter

`machine/std-odoo-code-hygiene.js` é gate de `.py` (ignora qualquer outra extensão com exit 0). Lê o arquivo linha a linha, **descarta o trecho de comentário** (tudo após `#`) antes de avaliar — então `print(x)` ou `requests.get(url)` mencionados em comentário não violam. Checa por linha:

- **print() cru**: regex `/(^|[^.\w])print\s*\(/` — ignora `pprint(` e `obj.print(` (precedidos por `.` ou caractere de palavra).
- **requests sem timeout**: linha que casa `requests.<verbo>(` e **não** contém `timeout=` na mesma linha. Heurística *line-based*: chamadas quebradas em múltiplas linhas ficam para revisão humana.

Mensagens iguais são deduplicadas (via `Set`): três `print()` no mesmo arquivo geram uma única entrada na lista. Violações → `VIOLATION: ...` em stdout e exit 1.

Itens de revisão humana (não automatizados): `string=` redundante igual ao nome do campo, ausência de modeline `# vim:` e imports absolutos internos ao addon.

## Referência

- [OCA/pylint-odoo](https://github.com/OCA/pylint-odoo) — checks `print-used` (W8116), `external-request-timeout` (E8106) e `attribute-string-redundant` (W8113)
