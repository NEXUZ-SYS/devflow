# Sistema de Widgets Legado — Odoo 12 a 14

> **Aplicabilidade:** este guia cobre o frontend **legacy** das séries **Odoo 12, 13 e
> 14** — anterior à adoção do OWL como framework padrão (15+). Em 12–14, a UI do web
> client e do POS é construída com o sistema de **Widgets** (`web.widget`), o sistema de
> classes próprio do Odoo (`web.Class` com `.extend()`/`.include()`) e o módulo AMD-like
> `odoo.define`/`require`. O POS (12–14) usa modelos **Backbone.js**.
>
> **Grounding:** Javascript Reference oficial por série —
> `odoo.com/documentation/12.0/developer/reference/javascript_reference.html`,
> `.../13.0/...`, `.../14.0/...`. Consulte também
> `mcp__docs-mcp-server__search_docs` (lib `odoo-12`; séries 13/14 podem não estar
> indexadas — ver nota no fim).

## 1. Sistema de Módulos (`odoo.define` / `require`)

Em Odoo 12–14 o carregamento de JS usa um sistema de módulos próprio (inspirado em AMD),
definido em `addons/web/static/src/js/boot.js`. Cada módulo é declarado com
`odoo.define(name, fn)`:

```javascript
// arquivo a.js
odoo.define('module.A', function (require) {
    "use strict";
    var A = /* ... */;
    return A;
});

// arquivo b.js
odoo.define('module.B', function (require) {
    "use strict";
    var A = require('module.A');   // dependência resolvida pelo extrator de require()
    var B = /* algo que usa A */;
    return B;
});
```

Pontos-chave:
- O **nome do módulo** deve ser único; a convenção é `<addon>.<Descrição>` (ex.: `web.Widget`).
- As **dependências** são extraídas automaticamente das chamadas `require(...)`; também
  podem ser declaradas explicitamente como segundo argumento:
  `odoo.define('m.Something', ['web.ajax'], function (require) { ... })`.
- Um módulo pode ser **assíncrono** retornando uma `Promise`/deferred — o sistema espera
  resolver antes de registrar.
- **Dependências circulares não são suportadas.**

Este sistema permanece em 13 e 14. A migração para `/** @odoo-module **/` + `import` ES6
começa no 15 e se consolida no 17/18 (ver `references/migration-frontend.md`).

## 2. Sistema de Classes (`web.Class`, `.extend()`, `.include()`)

Odoo foi escrito antes de classes ES6 estarem disponíveis, então usa um sistema de
classes próprio (`web.Class`, inspirado em John Resig), base de praticamente todo o
código legacy 12–14.

### Criar subclasse — `.extend()`

```javascript
var Class = require('web.Class');

var Animal = Class.extend({
    init: function () {        // init é o construtor
        this.x = 0;
        this.hunger = 0;
    },
    move: function () { this.x += 1; this.hunger += 1; },
});
```

### Herança e `_super`

Ao chamar um método, o framework religa `_super` ao método pai. Use
`this._super.apply(this, arguments)` para chamar a implementação herdada:

```javascript
var Dog = Animal.extend({
    move: function () {
        this.bark();
        this._super.apply(this, arguments);
    },
    bark: function () { console.log('woof'); },
});
```

### Mixins

`.extend()` aceita vários argumentos e os combina (não há herança múltipla, mas há
compartilhamento de comportamento):

```javascript
var DanceMixin = { dance: function () { console.log('dancing'); } };
var Hamster = Animal.extend(DanceMixin, { sleep: function () {} });
```

### Patch de classe existente — `.include()`

Para modificar uma classe **in place** (afetando instâncias presentes e futuras) — o
equivalente legacy ao `patch()` do OWL moderno:

```javascript
var Hamster = require('web.Hamster');

Hamster.include({
    sleep: function () {
        this._super.apply(this, arguments);
        console.log('zzzz');
    },
});
```

> `.include()` é a forma como um addon estende um widget/classe definido em outro addon
> no mundo 12–14. No Odoo 15+ isto vira `patch(Class.prototype, {...})`.

## 3. Widgets (`web.widget`)

A classe `Widget` (`web.Widget`, em `widget.js`) é o bloco de construção da UI em 12–14.
Quase tudo na interface é controlado por um widget. Recursos:
- relações pai/filho (`PropertiesMixin`) com destruição automática de filhos;
- ciclo de vida gerenciado;
- renderização automática via **QWeb**;
- utilitários de interação com o DOM (`this.$el`, `this.$(...)`).

```javascript
var Widget = require('web.Widget');

var Counter = Widget.extend({
    template: 'some.template',     // template QWeb (declarado na chave 'qweb' do manifest)
    events: {                      // delegação de eventos jQuery
        'click button': '_onClick',
    },
    init: function (parent, value) {
        this._super(parent);       // parent: usado p/ destruição e propagação de eventos
        this.count = value;
    },
    _onClick: function () {
        this.count++;
        this.$('.val').text(this.count);
    },
});

// uso:
var counter = new Counter(this, 4);
counter.appendTo(".some-div");     // renderiza e insere no DOM
```

```xml
<!-- template QWeb correspondente (arquivo declarado em 'qweb' no __manifest__.py) -->
<div t-name="some.template">
    <span class="val"><t t-esc="widget.count"/></span>
    <button>Increment</button>
</div>
```

### Ciclo de vida do Widget (12–14)

Sequência usual: `init` → `willStart` → `[Rendering]` → `start` → `destroy`.

| Hook | Quando | Observação |
|---|---|---|
| `init(parent)` | construtor, **síncrono** | inicializa estado base; recebe `parent` |
| `willStart()` | antes da renderização | retorna deferred/Promise; ainda **sem** DOM root |
| `start()` | após inserir no DOM | `this.$el` disponível |
| `destroy()` | ao remover | destrói filhos automaticamente |

> Contraste com OWL (15+): lá os hooks (`onWillStart`, `onMounted`, ...) são chamados
> **dentro de `setup()`**, não definidos como métodos da classe.

### Sistema de eventos (12–14)

Há dois sistemas (`EventDispatcherMixin`, em `mixins.js`, incluído em `Widget`):
- **Base** (`on`/`off`/`once`/`trigger`) — bus simples. **Desencorajado**: a recomendação
  oficial é migrar `trigger` → `trigger_up`.
- **Estendido** (`trigger_up` + dicionário `custom_events`) — eventos "sobem" pela árvore
  de componentes (bubbling), via `OdooEvent` (`target`/`name`/`data`,
  `stopPropagation`/`is_stopped`).

```javascript
var MyWidget = Widget.extend({
    custom_events: { valuechange: '_onValueChange' },
    _onValueChange: function (event) { /* event.data.val */ },
});
// no filho: this.trigger_up('valuechange', { value: someValue });
```

## 4. Templates QWeb (client-side, 12–14)

- Templates do widget são QWeb XML declarados na chave **`qweb`** do `__manifest__.py`
  (≠ assets bundles do mundo moderno).
- Diretivas `t-` (`t-esc`, `t-if`, `t-foreach`, `t-att-*`, `t-call`).
- No widget, o contexto de template expõe `widget` (ex.: `<t t-esc="widget.count"/>`).

## 5. POS Legacy (Backbone) — 12 a 14

> **Grounding parcial:** o Javascript Reference oficial 12 confirma que o POS é uma SPA
> especializada que compartilha o framework JS comum (widgets/classes/`odoo.define`). Os
> **internals específicos do POS** (modelos Backbone, `Gui`, `Registries`, bundle
> `point_of_sale.assets`) **não estão totalmente documentados** no store indexado —
> ver nota ⚠️ no fim.

Características do POS 12–14:
- **Modelos Backbone.js** (`point_of_sale.models`): `models.Order`, `models.Orderline`,
  `models.Paymentline`, estendidos via `models.Order.extend({...})`. Reatividade via
  eventos Backbone (`this.trigger('change', ...)`), **não** via `useState`.
- **Padrão de override de modelo** — defaults definidos **antes** do `_super`
  (porque o `_super` chama `init_from_JSON`); persistência via
  `export_as_JSON` / `init_from_JSON` e dados de impressão via `export_for_printing`:

```javascript
var models = require('point_of_sale.models');
var _super_order = models.Order.prototype;

models.Order = models.Order.extend({
    initialize: function (attr, options) {
        this.my_field = null;                       // default ANTES do super
        _super_order.initialize.call(this, attr, options);
    },
    init_from_JSON: function (json) {
        _super_order.init_from_JSON.call(this, json);
        this.my_field = json.my_field || null;
    },
    export_as_JSON: function () {
        var json = _super_order.export_as_JSON.call(this);
        json.my_field = this.my_field;
        return json;
    },
});
```

- **Telas e popups** geridos por `Gui` (`point_of_sale.Gui`); chamadas como
  `this.gui.show_popup('error', {...})` / `this.showPopup(...)` conforme a série.
- **Botões de controle** registrados via APIs do POS legacy
  (`point_of_sale.Registries` / `addControlButton`) — começam a convergir para o padrão
  de registry moderno no 15.
- **Assets do POS** declarados no bundle `point_of_sale.assets` (e templates QWeb em
  bundle/chave separada) — renomeado e unificado em `point_of_sale._assets_pos` no 18.

A migração detalhada deste mundo Backbone (12–14) → OWL é tratada em
`references/migration-frontend.md`.

## 6. Quando usar este guia vs. OWL

| Série | Framework de UI | Referência |
|---|---|---|
| **12, 13, 14** | Widgets (`web.widget`) + Backbone (POS) | **este arquivo** |
| 15, 16 | OWL 1.x (transição) | `references/owl-components.md` |
| 17 | OWL 2.x | `references/owl-components.md` |
| 18 | OWL 3.x | `references/owl-components.md` |

> Em código que ainda vive em 12–14, **não** introduza OWL/`patch()`/ES modules — use
> `web.widget`, `.extend()`/`.include()` e `odoo.define`. A travessia para OWL é uma
> migração explícita (`references/migration-frontend.md`).

## ⚠️ Fatos não confirmados (12–14)

Os itens abaixo refletem padrões legacy amplamente usados, mas **não foram confirmados**
contra documentação oficial indexada (odoo-13 e odoo-14 não estão no store; os internals
de POS Backbone não aparecem no recorte indexado do odoo-12):

- nomes exatos de API do POS Backbone por série (`Gui.show_popup` vs `showPopup`,
  assinatura de `addControlButton`, estrutura de `point_of_sale.Registries`);
- nome exato do bundle de assets do POS em 12/13 vs 14;
- diferenças incrementais 12→13→14 no sistema de widgets/eventos.

Para confirmar: `mcp__docs-mcp-server__find_version` (lib `odoo-13`/`odoo-14`) e, se não
indexado, **indexar via `/devflow:scrape-stack-batch`** (séries `odoo-13`, `odoo-14`)
antes de afirmar esses detalhes em código de produção.

## Fontes

- Javascript Reference (12): `odoo.com/documentation/12.0/developer/reference/javascript_reference.html`
- Javascript Reference (13/14): `odoo.com/documentation/13.0/developer/...`, `.../14.0/...`
- QWeb (client-side, 12): `odoo.com/documentation/12.0/developer/reference/qweb.html`
- OWL Framework: `github.com/odoo/owl`
