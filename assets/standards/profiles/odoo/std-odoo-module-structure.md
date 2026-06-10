---
id: std-odoo-module-structure
description: Estrutura/layout canônico do módulo Odoo — README.rst obrigatório e models fora da raiz, em models/
version: 1.0.0
source: devflow-default-odoo
applyTo: ["**/__manifest__.py", "**/__openerp__.py"]
activation: on-demand
relatedAdrs: []
enforcement:
  linter: machine/std-odoo-module-structure.js
---
## Princípios

- Um módulo Odoo é um **diretório** ancorado por um `__manifest__.py` (ou o legado `__openerp__.py`). O layout interno é convencional: cada concern vive no seu subdiretório canônico — `models/`, `views/`, `security/`, `controllers/`, `static/`, `wizards/`, `data/`, `tests/`. Manter essa estrutura é o que torna um módulo legível para qualquer dev Odoo e compatível com as ferramentas da comunidade.
- **Models nunca ficam na raiz do módulo.** Toda definição de `models.Model`/`models.TransientModel`/`models.AbstractModel` vai para um arquivo dentro de `models/` (ou `wizards/` no caso de TransientModel de assistente). A raiz hospeda apenas o manifest e o `__init__.py` de topo.
- A **cadeia de import** segue a árvore de diretórios: o `__init__.py` de topo importa os subpacotes (`from . import models`, `from . import controllers`); cada subpacote tem o próprio `__init__.py` importando seus arquivos (`from . import foo`). Sem essa cadeia, o código simplesmente não carrega.
- Todo módulo traz um **`README.rst`** na raiz descrevendo propósito, configuração e uso. A OCA exige reStructuredText (`.rst`), não Markdown — é o formato que o renderizador do App Store e o `pylint-odoo` (check `missing-readme`, C8112) esperam.
- As regras de acesso (`ir.model.access.csv`) vivem em **`security/`** e são declaradas antes das views no `data` do manifest, pois views podem referenciar grupos definidos ali.

## Anti-patterns

| Errado | Corrija para |
|---|---|
| Módulo sem `README.rst` na raiz | Adicione um `README.rst` (reStructuredText) descrevendo o módulo |
| `README.md` no lugar de `README.rst` | Renomeie/converta para `README.rst` — a OCA exige reStructuredText |
| `class Foo(models.Model)` num `.py` da raiz do módulo (ex.: `foo.py`) | Mova a definição para `models/foo.py` e importe-a via `models/__init__.py` |
| Wizard `TransientModel` solto na raiz | Coloque em `wizards/` (ou `models/`) com cadeia de import correta |
| `__init__.py` de topo sem importar os subpacotes | `from . import models` / `from . import controllers` no `__init__.py` raiz |
| `models/` sem `__init__.py` importando seus arquivos | Cada subpacote importa seus módulos (`from . import foo`) |
| `ir.model.access.csv` fora de `security/` | Mantenha as regras de acesso em `security/` e carregue-as antes das views |

## Linter

`machine/std-odoo-module-structure.js` (Node, sem deps). Recebe o caminho do arquivo em `argv[2]`. **Gate por basename:** só processa `__manifest__.py` ou `__openerp__.py` — qualquer outro arquivo resulta em `exit 0` (não é âncora de módulo). Como o manifest mora na raiz do módulo, o linter usa `dirname(filePath)` como diretório do módulo e inspeciona seu conteúdo via `readdirSync`/`existsSync`. Dois checks **estáticos**:

1. **README ausente ou em formato errado** — se não existe `README.rst` no diretório do módulo, emite `módulo sem README.rst`; se existe `README.md` mas não `.rst`, emite `use README.rst em vez de README.md`.
2. **Model na raiz** — para cada `.py` no topo do módulo (exceto `__init__.py` e `__manifest__.py`/`__openerp__.py`), lê o conteúdo; se contém `models.Model`, `models.TransientModel` ou `models.AbstractModel`, emite `model definido na raiz (<arquivo>) — mova para models/`.

Violação imprime `VIOLATION: ...` e sai com `exit 1`; módulo conforme sai com `exit 0`. Erros de IO (`readdir`/`readFile`) são tolerados (não geram flag). As demais regras são **human-review** (não automatizadas) — confira na revisão de PR:

- **Diretórios canônicos** presentes e nomeados corretamente (`models/`, `views/`, `security/`, `controllers/`, `static/`, `wizards/`, `data/`, `tests/`).
- **Cadeia de import** completa: `__init__.py` de topo importa `models`/`controllers`; cada subpacote importa seus próprios arquivos.
- **`ir.model.access.csv` em `security/`** e carregado antes das views na lista `data` do manifest.

## Referência

- [Odoo 18 — Module structure & manifest](https://www.odoo.com/documentation/18.0/developer/reference/backend/module.html) — layout canônico do módulo, diretórios e cadeia de import.
- [OCA/pylint-odoo](https://github.com/OCA/pylint-odoo) — check `missing-readme` (C8112): a OCA exige `README.rst` em todo módulo.
