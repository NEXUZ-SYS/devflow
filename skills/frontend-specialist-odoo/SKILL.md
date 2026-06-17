---
type: skill
name: frontend-specialist-odoo
description: >
  Odoo frontend development specialist (camada L1 — framework genérico) covering
  Odoo 12 through 18: the legacy widget system (web.widget, odoo.define/require,
  Backbone POS, .extend()/.include()) on Odoo 12, 13 and 14; OWL 1.x on 15 and 16;
  OWL 2.x on 17; OWL 3.x on 18. Covers OWL components, QWeb templates, registries,
  services, hooks, patching, POS (Point of Sale) customization, receipt rendering,
  and frontend module migration across all 12–18 series. Use this skill when creating,
  modifying, extending, or debugging Odoo frontend code — including OWL components,
  QWeb XML templates, JavaScript modules, custom field widgets, client actions, systray
  items, view controllers/renderers, service definitions, hook usage, patching existing
  components, legacy widgets, POS screens, receipt templates, or asset bundle
  configuration. Also trigger when migrating frontend JS between Odoo series (legacy
  odoo.define/Backbone → OWL, OWL1 → OWL2 → OWL3).
  Do NOT use for Python-only backend development, QWeb report templates (server-side),
  or Odoo configuration/administration tasks. For backend Odoo development, use the
  odoo-development skill instead. For Brazilian fiscal localization (NFC-e/DANFE) use
  odoo-l10n-br; for a company-specific module hierarchy use the matching L3 overlay
  skill (gated by profile).
skillSlug: frontend-specialist-odoo
phases: [P, R, E, V, C]
generated: 2026-02-19
updated: 2026-06-17
status: filled
scaffoldVersion: "2.0.0"
mode: manual
priority: high
autoActivate: true
---


# Odoo Frontend Development Specialist (L1 — framework genérico, Odoo 12–18)

Esta skill é a **camada L1** (framework genérico, sem acoplamento a projeto) para
desenvolvimento de frontend Odoo, cobrindo **todas as séries de 12 a 18**:

| Série | Framework de UI | Sistema de módulos | Extensão | Referência |
|---|---|---|---|---|
| **12** | Widgets (`web.widget`) + Backbone (POS) | `odoo.define`/`require` | `.extend()` / `.include()` | `references/legacy-widgets-12to14.md` |
| **13** | Widgets + Backbone (POS) | `odoo.define`/`require` | `.extend()` / `.include()` | `references/legacy-widgets-12to14.md` |
| **14** | Widgets + Backbone (POS) | `odoo.define`/`require` | `.extend()` / `.include()` | `references/legacy-widgets-12to14.md` |
| **15** | OWL 1.x (POS ainda Backbone) | `odoo.define` (transição) | `Registries.Component.extend()` | `references/owl-components.md` |
| **16** | OWL 2.x | ambos (transicional) | `extend()` / `patch()` | `references/owl-components.md` |
| **17** | OWL 2.x | `@odoo-module` only | `patch()` | `references/owl-components.md` |
| **18** | OWL 3.x | imports ES6 | `patch()` only | `references/owl-components.md` |

> **Em 12–14** o frontend usa o **sistema de widgets legado** (não OWL) — leia
> `references/legacy-widgets-12to14.md` antes de mexer em código dessas séries. **Em
> 15–18** use OWL. A travessia entre paradigmas é uma migração explícita
> (`references/migration-frontend.md`).

## Grounding (fontes versionadas)

Para confirmar comportamento de uma série específica, consulte sempre a fonte versionada
em vez de assumir:

- **Documentação oficial por série:** `odoo.com/documentation/NN.0/developer` (ex.:
  `odoo.com/documentation/18.0/developer`, `.../12.0/developer`).
- **docs-mcp-server:** `mcp__docs-mcp-server__search_docs` (lib `odoo-NN`, ex.: `odoo-18`,
  `odoo-12`) e `mcp__docs-mcp-server__find_version` para descobrir o que está indexado.
  Séries não indexadas (atualmente 13/14/15/16) → marcar como não confirmado e indexar
  via `/devflow:scrape-stack-batch`.
- **OWL framework:** repositório oficial `github.com/odoo/owl` (componentes, hooks,
  reatividade, versões OWL 1.x/2.x/3.x).

> **Before writing any code**, read the relevant reference file(s) in `references/` based on what the user needs. Each reference covers a specific domain in depth.

## When to Read Which Reference

| User Need | Reference File |
|---|---|
| **Legacy frontend on Odoo 12, 13, 14 (web.widget, odoo.define, Backbone POS, .extend()/.include())** | `references/legacy-widgets-12to14.md` |
| Creating OWL components, lifecycle, reactivity, props, templates (15–18) | `references/owl-components.md` |
| Services, registries, hooks, patching, client actions, field widgets | `references/odoo-web-framework.md` |
| Module structure, asset bundles, manifest, XML templates | `references/module-and-assets.md` |
| **POS screens, receipt rendering, POS models, POS extension** | `references/pos-frontend.md` |
| **Migrating frontend across series (12→18 overview)** | `references/migration-frontend.md` |
| **Detailed 15→18 POS migration (odoo.define → ES modules, Backbone → OWL)** | `references/migration-frontend-15to18.md` |

## Cross-References

| Topic | Skill/Resource |
|---|---|
| Backend Python (models, ORM, testing, API por versão) | `odoo-development` skill (L1) |
| Brazilian fiscal localization (OCA localization stack, NFC-e/NF-e, DANFE, SEFAZ) | `odoo-l10n-br` skill (L2) |
| Company module hierarchy, bridge modules, project POS overlay | L3 overlay skill (gated por profile) |
| Gotchas from napkin | `.claude/napkin.md` |

> **Camadas:** esta skill é **L1** (genérica). Conteúdo de **localização BR** (fluxo
> NFC-e, DANFE, integração SEFAZ) vive em `odoo-l10n-br` (L2). Hierarquia de módulos e
> padrões de bridge de um projeto específico (ex.: uma stack POS proprietária) vivem no
> **overlay de empresa (L3)**, uma skill gated por profile. Variáveis de ambiente do
> projeto (paths, DBs, portas) vivem no `.context/` do projeto, nunca nesta skill.

## Architecture Overview

The Odoo web client is a single-page application. The UI framework **depends on the
series**:

- **Odoo 12**, **Odoo 13** and **Odoo 14** — built on the **legacy widget system**
  (`web.widget`), the Odoo class system (`.extend()`/`.include()`) and
  `odoo.define`/`require`. The POS uses **Backbone.js** models. See
  `references/legacy-widgets-12to14.md`.
- **Odoo 15–18** — built on **OWL** (Odoo Web Library), a ~20kb reactive component
  framework inspired by React and Vue (OWL 1.x in 15/16, 2.x in 17, 3.x in 18). On these
  series all new frontend development uses OWL; the legacy widget system is deprecated.

The OWL-focused architecture below applies to **Odoo 15–18**. For 12–14, use the widget
patterns in the legacy reference instead.

### Core Building Blocks

```
+-------------------------------------------------+
|  WebClient (root OWL app)                       |
|  +- NavBar                                      |
|  +- ActionContainer (renders views/actions)     |
|  +- MainComponentsContainer                     |
+-------------------------------------------------+
|  Extension Points:                              |
|  +- Registries (fields, views, actions, pos...) |
|  +- Services (DI system, useService hook)       |
|  +- Hooks (reusable lifecycle logic)            |
|  +- Patching (modify existing components)       |
+-------------------------------------------------+
```

### POS Architecture (Odoo 18)

```
+-------------------------------------------------+
|  POS Chrome Component (main container)          |
|  +- ProductScreen (product selection)           |
|  +- PaymentScreen (payment processing)          |
|  +- TicketScreen (order management/reprint)     |
|  +- ReceiptScreen (receipt display/print)       |
+-------------------------------------------------+
|  POS Data Layer:                                |
|  +- pos.store (session/config, useService)      |
|  +- pos.order (OWL reactive, NOT Backbone)      |
|  +- pos.order.line (line items)                 |
|  +- pos.payment (payment records)               |
+-------------------------------------------------+
|  Asset Bundle: point_of_sale._assets_pos        |
|  (JS + XML + SCSS all in same bundle)           |
+-------------------------------------------------+
```

### Key Principles

1. **OWL-first**: All new code uses OWL components with ES6 classes. Never create legacy widgets.
2. **Registry-driven extensibility**: Register components in the appropriate registry (`fields`, `views`, `actions`, `services`, `systray`, `pos_screens`) — the framework discovers them automatically.
3. **Services as DI**: Business logic lives in services. Components access services via `useService("service_name")`.
4. **Patching over forking**: Extend existing behavior with `patch()` instead of copy-pasting components.
5. **QWeb templates**: XML-based templates with `t-` directives. Support inheritance via `t-inherit` + XPath.
6. **Asset bundles**: JS/CSS/XML files are organized in asset bundles declared in `__manifest__.py`.

## Migration Across Series (resumo)

Os saltos de paradigma entre séries — **legacy → OWL1 (12–14 → 15)**, **OWL1 → OWL2
(15/16 → 17)** e **OWL2 → OWL3 (17 → 18)** — são tratados em
`references/migration-frontend.md` (visão geral 12→18). O salto 15→18 do POS, o mais
denso, tem detalhamento side-by-side em `references/migration-frontend-15to18.md`.

Mapeamentos centrais do salto 15 → 18 (POS):

- `odoo.define()` → `/** @odoo-module */` + ES6 imports
- `Registries.Component.extend()` → `patch(Component.prototype, {...})`
- `models.Order.extend()` (Backbone) → `patch(PosOrder.prototype, {...})` (OWL reativo)
- `_export_for_ui` → `_load_pos_data_fields` (Python)
- `models.load_models()` / `models.load_fields()` → `pos.load.mixin` (Python)
- `this.rpc({model, method})` → `this.pos.data.call(model, method, args)`
- `showPopup("ErrorPopup")` → `this.dialog.add(AlertDialog, {})`
- `this.env.pos` → `this.pos = usePos()`
- ReprintReceiptScreen/Button REMOVIDOS → TicketScreen cuida da reimpressão
- Moment.js → Luxon DateTime

> Projetos com hierarquia de módulos própria (ex.: stacks POS com módulos bridge sobre
> OCA) devem documentar essa hierarquia no **overlay de empresa (L3)** e no `.context/`
> do projeto — não nesta camada L1.

## Quick Reference: Common Patterns

### Creating a Component

```javascript
/** @odoo-module **/
import { Component, useState } from "@odoo/owl";

export class MyComponent extends Component {
    static template = "my_module.MyComponent";
    static props = {
        title: { type: String },
        onSave: { type: Function, optional: true },
    };

    setup() {
        this.state = useState({ count: 0 });
    }

    increment() {
        this.state.count++;
    }
}
```

```xml
<?xml version="1.0" encoding="UTF-8"?>
<templates xml:space="preserve">
    <t t-name="my_module.MyComponent">
        <div class="my-component">
            <h3 t-esc="props.title"/>
            <span t-esc="state.count"/>
            <button t-on-click="increment">+1</button>
        </div>
    </t>
</templates>
```

### Patching an Existing Component (Odoo 18)

```javascript
/** @odoo-module **/
import { patch } from "@web/core/utils/patch";
import { FormController } from "@web/views/form/form_controller";

patch(FormController.prototype, {
    setup() {
        super.setup(...arguments);
        // Add custom logic
    },
});
```

### Extending a POS Screen (Odoo 18)

```javascript
/** @odoo-module **/
import { patch } from "@web/core/utils/patch";
import { PaymentScreen } from "@point_of_sale/app/screens/payment_screen/payment_screen";

patch(PaymentScreen.prototype, {
    async validateOrder(isForceValidate) {
        // Custom pre-validation
        const result = await super.validateOrder(isForceValidate);
        // Custom post-validation (e.g., NFC-e emission)
        return result;
    },
});
```

### Customizing POS Receipt (Odoo 18)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<templates xml:space="preserve">
    <t t-name="my_module.OrderReceipt"
       t-inherit="point_of_sale.OrderReceipt"
       t-inherit-mode="extension">
        <xpath expr="//div[hasclass('pos-receipt-order-data')]" position="after">
            <div class="custom-receipt-section">
                <t t-esc="receipt.my_custom_field"/>
            </div>
        </xpath>
    </t>
</templates>
```

### Asset Bundle Declaration (__manifest__.py)

```python
# Odoo 18 — backend components
{
    'assets': {
        'web.assets_backend': [
            'my_module/static/src/**/*',
        ],
    },
}

# Odoo 18 — POS components (ALL in same bundle)
{
    'assets': {
        'point_of_sale._assets_pos': [
            'my_module/static/src/js/**/*.js',
            'my_module/static/src/xml/**/*.xml',
            'my_module/static/src/scss/**/*.scss',
        ],
    },
}
```

## XML View Changes (Backend + Frontend)

When migrating to Odoo 18, these XML changes apply to both backend views and frontend templates:

- **`<tree>` → `<list>`**: Mandatory rename in all XML view definitions (Odoo 17+)
- **`attrs` dict → inline expressions**: `attrs={'invisible': [...]}` replaced by `invisible="expr"` (removed in 18)

See `references/migration-frontend-15to18.md` section 11 for full examples.

## Common Mistakes to Avoid

1. **Patching the class instead of the prototype**: Use `patch(MyClass.prototype, {...})` for instance methods, `patch(MyClass, {...})` for static methods only.
2. **Forgetting `super.setup()`**: When patching components, always call `super.setup(...arguments)` or the original lifecycle won't run.
3. **Using `function` syntax in patches**: The `super` keyword only works in method shorthand syntax, not in `function()` or arrow `() =>` syntax.
4. **Constructor patching**: You cannot patch constructors directly — Owl components use `setup()` for initialization, which IS patchable.
5. **Missing asset bundle registration**: Files in `static/src/` are not automatically included — they must be added to a bundle in `__manifest__.py`.
6. **Using `t-esc` for HTML content**: Use `t-out` for trusted HTML; `t-esc` escapes HTML entities.
7. **Wrong POS bundle**: In Odoo 18, ALL POS assets (JS+XML+CSS) go in `point_of_sale._assets_pos`. Do NOT use `web.assets_qweb` separately.
8. **Template `t-inherit` without module prefix**: Always use full name: `point_of_sale.ReceiptScreen` (not just `ReceiptScreen`).
9. **Adding `owl="1"` to template extensions**: Template extensions must NOT have `owl="1"` attribute.
10. **Overriding visibility in `@media print`**: Odoo POS already handles print visibility. Only override `width`, `margin`, `padding`, `@page`.

## Development Workflow

1. **Activate debug mode with assets**: In Odoo URL, add `?debug=assets` to get unminified JS for debugging.
2. **Install OWL Devtools**: Chrome extension available at [github.com/odoo/owl releases](https://github.com/odoo/owl/releases).
3. **POS module structure**:
   ```
   my_pos_module/
   +-- __manifest__.py          # assets in point_of_sale._assets_pos
   +-- __init__.py
   +-- models/                  # Python (pos.order, pos.config extensions)
   +-- static/
   |   +-- src/
   |       +-- js/              # OWL components, patches, services
   |       +-- xml/             # QWeb templates (component + receipt)
   |       +-- scss/            # Stylesheets (receipt print CSS)
   +-- views/                   # Backend views (pos.config form)
   ```
4. **Restart and upgrade**: After changing `__manifest__.py` assets, restart the server AND upgrade the module.
5. **Clear POS asset cache**: For POS changes, may need to clear `ir_attachment` cache for `point_of_sale` assets.
