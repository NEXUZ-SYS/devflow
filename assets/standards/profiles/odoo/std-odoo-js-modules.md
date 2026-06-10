---
id: std-odoo-js-modules
description: Módulos JS no padrão ES (Odoo 16+) — sem odoo.define() autogerado nem require() AMD legado
version: 1.1.0
source: devflow-default-odoo
applyTo: ["**/static/src/**/*.js"]
activation: on-demand
relatedAdrs: []
enforcement:
  linter: machine/std-odoo-js-modules.js
---
## Princípios

- A partir do Odoo 16, todo JS de frontend é um módulo ES nativo: o módulo é declarado pela primeira linha `/** @odoo-module **/` e usa `import`/`export`, não o invólucro `odoo.define()` autogerado das versões 15 e anteriores
- Imports devem usar os paths de namespace do Odoo (`@web/...`, `@point_of_sale/...`) — o transpilador do servidor resolve esses aliases para os módulos reais em tempo de carga dos assets
- Nunca traga dependências por `require()` no estilo AMD: o `var x = require('web.core')` (atribuição) e a assinatura `function (require)` do define legado pertencem ao mundo pré-16 e não convivem com o módulo ES
- Prefira a API de frontend moderna (`registry`, services, hooks, OWL) acessada por `import`; o código legado AMD costuma arrastar acoplamentos e jQuery que o padrão ES já substitui
- O comentário `/** @odoo-module **/` é o gatilho que transforma o arquivo em módulo ES — sua ausência (fora de `/static/src`, onde a convenção é dispensada) faz o Odoo tratar o arquivo como script global

## Anti-patterns

| Errado | Corrija para |
|---|---|
| `odoo.define('web.Foo', function (require) { ... });` | `/** @odoo-module **/` + `import { ... } from "@web/..."` |
| `var rpc = require('web.rpc');` | `import { rpc } from "@web/core/network/rpc_service";` |
| `function (require) { ... }` (assinatura do define legado) | Módulo ES com `import` no topo |
| Acesso a dependências via AMD/`require` | `import { registry } from "@web/core/registry";` |

GOOD — módulo ES idiomático:

```js
/** @odoo-module **/
import { registry } from "@web/core/registry";
export const x = 1;
```

## Linter

`machine/std-odoo-js-modules.js` — gate por extensão (só processa `.js`; demais arquivos saem com exit 0). Checks:

1. **`odoo.define()` legado** (estático) — flag qualquer chamada `odoo.define(` (formato autogerado das versões antigas; código novo usa módulo ES).
2. **`require()` AMD legado** (estático) — flag o padrão de require AMD: atribuição `= require(` OU a assinatura do define legado `function (require)`. NÃO flaga `import` ES nem `require` de Node fora desse padrão (deduplicado via `Set`).

Em **human-review** (não lintável, fica só nesta prosa):

3. Primeira linha `/** @odoo-module **/` quando exigido (fora de `/static/src`) — exige conhecer a convenção de path do arquivo.
4. Imports ES6 com paths de namespace (`@web/...`, `@point_of_sale/...`) — validar o alias correto depende do mapa de assets do módulo.
5. Sem jQuery `$` no código novo — distinguir uso legítimo de legado exige contexto semântico.

**Gate de série-alvo (desde v1.1.0):** ES modules são Odoo **16+**. O linter lê a série do `version` no `__manifest__.py` mais próximo e se auto-suprime (exit 0) quando a série é **< 16** — em módulos `≤15` o `odoo.define()`/`require()` AMD eram o padrão. Sem manifest, roda normalmente.

## Referência

- Odoo 18 — JavaScript Modules (frontend reference): https://www.odoo.com/documentation/18.0/developer/reference/frontend/javascript_modules.html
