# Guia de Migração Frontend — Odoo 12 a 18

> **Escopo:** este guia cobre a evolução do frontend Odoo **ao longo de todas as séries
> 12–18**, não só o salto 15→18. Use-o para planejar uma migração e descobrir **o que
> muda em cada degrau**. O detalhamento exaustivo do salto 15→18 (POS) vive na sub-seção
> §4 e na referência dedicada `references/migration-frontend-15to18.md`.
>
> **Grounding:** guia oficial de migração OCA por série
> (`github.com/OCA/maintainer-tools/wiki`), Javascript Reference por versão
> (`odoo.com/documentation/NN.0/developer/reference/javascript_reference.html`),
> repositório OWL (`github.com/odoo/owl`) e
> `mcp__docs-mcp-server__search_docs` (lib `odoo-NN`).

## Linha do tempo do frontend (12 → 18)

| Série | Framework de UI | Sistema de módulos | Extensão | Modelos POS |
|---|---|---|---|---|
| **12** | Widgets (`web.widget`) | `odoo.define`/`require` | `.extend()` / `.include()` | Backbone.js |
| **13** | Widgets | `odoo.define`/`require` | `.extend()` / `.include()` | Backbone.js |
| **14** | Widgets | `odoo.define`/`require` | `.extend()` / `.include()` | Backbone.js |
| **15** | OWL 1.x (web client) + POS ainda Backbone | `odoo.define` (transição p/ ES) | `Registries.Component.extend()` | Backbone.js |
| **16** | OWL 2.x | ambos (transicional) | `Registries.Component.extend()` / `patch()` | Backbone.js |
| **17** | OWL 2.x | `@odoo-module` only | `patch()` | transicional |
| **18** | OWL 3.x | imports ES6 | `patch()` only | OWL reativo (`useState`) |

> Os três grandes degraus de migração: **legacy → OWL1 (12–14 → 15)**,
> **OWL1 → OWL2 (15/16 → 17)** e **OWL2 → OWL3 (17 → 18)**.

## 1. Degrau legacy → OWL1 (12–14 → 15)

Maior ruptura conceitual. O mundo de Widgets/Backbone (ver
`references/legacy-widgets-12to14.md`) dá lugar ao OWL no web client.

| Concern | 12–14 (legacy) | 15 (OWL 1.x) |
|---|---|---|
| Componente | `Widget.extend({ ... })` | `class extends Component` (`@odoo/owl`) |
| Estado/reatividade | `this.x` + `trigger('change')` | `useState({ ... })` |
| Ciclo de vida | métodos `init/willStart/start/destroy` | hooks dentro de `setup()` |
| Patch de classe | `Class.include({ ... })` | `Registries.Component.extend(Base, fn)` |
| Eventos | `events:` / `custom_events:` + `trigger_up` | `t-on-*` no template / `useBus` |
| Template | chave `qweb` no manifest | asset bundle |

```javascript
// 12–14 — Widget legacy
var Widget = require('web.Widget');
var MyW = Widget.extend({
    template: 'my.Tpl',
    events: { 'click button': '_onClick' },
    init: function (parent) { this._super(parent); this.count = 0; },
    _onClick: function () { this.count++; this.$('.val').text(this.count); },
});

// 15 — OWL 1.x
/** @odoo-module **/
import { Component, useState } from "@odoo/owl";
export class MyW extends Component {
    static template = "my.Tpl";
    setup() { this.state = useState({ count: 0 }); }
    increment() { this.state.count++; }
}
```

No **POS**, em 15 os modelos ainda são **Backbone** (`models.Order.extend`) — só o web
client virou OWL. A conversão completa dos modelos POS para OWL reativo acontece no 18.

## 2. Degrau OWL1 → OWL2 (15/16 → 17)

Consolidação do OWL e do sistema de módulos ES.

| Concern | 15/16 (OWL 1.x) | 17 (OWL 2.x) |
|---|---|---|
| Módulos | `odoo.define` (ou ambos no 16) | `/** @odoo-module **/` + `import` **obrigatório** |
| Extensão | `Registries.Component.extend()` | `patch(Base.prototype, { ... })` |
| Views XML | `<tree>` / `attrs={...}` | `<list>` / expressões inline (`invisible="..."`) |
| Popups POS | `showPopup("ErrorPopup", ...)` | em transição p/ `dialog.add(...)` |

> `<tree>` → `<list>` e a remoção de `attrs={...}` em favor de `invisible="expr"` começam
> a valer no **17** e são obrigatórios no **18**. Auditoria:
> `grep -rn '<tree' modules/` e `grep -rn 'attrs=' modules/` devem zerar em código 18.

## 3. Degrau OWL2 → OWL3 (17 → 18)

Refinamentos finais e a virada dos modelos POS para OWL reativo.

| Concern | 17 (OWL 2.x) | 18 (OWL 3.x) |
|---|---|---|
| Modelos POS | transicional | **OWL reativo** (Backbone removido) |
| Bundle POS | transicional | `point_of_sale._assets_pos` (JS+XML+SCSS juntos) |
| Carga de dados POS | `models.load_models()` (JS) | `pos.load.mixin` + `_load_pos_data_fields` (Python) |
| Sync de campos | `_export_for_ui` | **removido** → `_load_pos_data_fields` |
| RPC no POS | `this.rpc({...})` | `this.pos.data.call(model, method, args)` |
| Datas | Moment.js | Luxon `DateTime` |
| `this.el` | disponível | usar `useRef` / `document.querySelector` |

## 4. Detalhe do salto 15 → 18 (POS) — sub-seção

O caminho 15→18 do POS é o mais detalhado porque concentra simultaneamente os degraus §2
e §3. O guia completo, com patterns lado-a-lado para **cada concern** (sistema de módulos,
extensão de componente, modelos Backbone→OWL, templates, asset bundles, ciclo de vida,
eventos, RPC, botões de controle, popups/diálogos, hooks de sync, componentes removidos,
e mudanças de API Python POS-relevantes), está em:

- **`references/migration-frontend-15to18.md`** — referência dedicada, side-by-side.

Resumo dos mapeamentos centrais 15 → 18:

| 15 | 18 |
|---|---|
| `odoo.define()` | `/** @odoo-module **/` + imports ES6 |
| `require('...')` | `import { ... } from "..."` |
| `Registries.Component.extend(Base, fn)` | `patch(Base.prototype, { ... })` |
| `models.Order.extend({ ... })` | `patch(PosOrder.prototype, { ... })` |
| `this._super(...arguments)` | `super.method(...arguments)` |
| métodos de ciclo de vida | hooks (`onMounted`, ...) dentro de `setup()` |
| `useListener` | `t-on-click` no template / `useBus` |
| `this.rpc({model, method, args})` | `this.pos.data.call(model, method, args)` |
| `showPopup("ErrorPopup", ...)` | `this.dialog.add(AlertDialog, { ... })` |
| `this.env.pos` | `this.pos = usePos()` |
| `_export_for_ui` | `_load_pos_data_fields` (Python) |
| Moment.js | Luxon `DateTime` |
| `point_of_sale.assets` + `web.assets_qweb` | `point_of_sale._assets_pos` |

## 5. Checklist de migração (qualquer degrau)

### Código
- [ ] Sistema de módulos correto para a série de destino (`odoo.define` em 12–14;
      `@odoo-module` + ES em 17/18).
- [ ] Extensão pelo mecanismo da série (`.include()` / `Registries...extend()` / `patch()`).
- [ ] `super`/`_super` consistente com o sistema de classes.
- [ ] Modelos POS no paradigma da série (Backbone até 17; OWL reativo no 18).
- [ ] Ciclo de vida convertido (métodos → hooks em `setup()` ao entrar no OWL).

### Manifest
- [ ] Bundle de assets correto (`point_of_sale._assets_pos` no 18).
- [ ] XML no mesmo bundle do JS no 18 (sai de `web.assets_qweb`).
- [ ] `version` atualizada para a série de destino (`NN.0.x.x.x`).

### Templates
- [ ] `<tree>` → `<list>` (17+).
- [ ] `attrs={...}` → expressões inline (`invisible="..."`) (18).
- [ ] `t-inherit` com prefixo de módulo completo; sem `owl="1"` em extensões.
- [ ] `t-key` em todo `t-foreach`; `t-out` para HTML confiável.

### Testes
- [ ] Módulo instala sem erros na série de destino.
- [ ] POS carrega; telas e botões customizados funcionam.
- [ ] Recibos renderizam e imprimem corretamente.
- [ ] Campos customizados aparecem em telas que dependem de sync.

## ⚠️ Fatos não confirmados (séries não indexadas)

As linhas referentes a **12, 13 e 14** e detalhes incrementais 15→16→17 que não puderem
ser confirmados no store (atualmente só `odoo-12`, `odoo-17`, `odoo-18` indexados):
confirme via `mcp__docs-mcp-server__find_version`/`search_docs` (lib `odoo-NN`) e, se não
indexado, **indexar via `/devflow:scrape-stack-batch`** (séries `odoo-13`, `odoo-14`,
`odoo-15`, `odoo-16`) antes de afirmar esses pontos em produção.

## Fontes

- Guia de migração OCA: `github.com/OCA/maintainer-tools/wiki`
- OWL Framework: `github.com/odoo/owl`
- Patching Code (18): `odoo.com/documentation/18.0/developer/reference/frontend/patching_code.html`
- Framework Overview por série: `odoo.com/documentation/NN.0/developer/reference/frontend/framework_overview.html`
