---
type: skill
name: frontend-specialist-odoo
description: >
  Odoo 18 frontend development specialist covering OWL components, QWeb templates,
  registries, services, hooks, patching, POS (Point of Sale) customization, receipt
  rendering, and module migration from Odoo 15 to 18. Covers both generic OWL/web
  client development AND NXZ-specific POS patterns (DANFE NFC-e, fiscal hooks,
  bridge modules). Use this skill when creating, modifying, extending, or debugging
  Odoo frontend code — including OWL components, QWeb XML templates, JavaScript modules,
  custom field widgets, client actions, systray items, view controllers/renderers,
  service definitions, hook usage, patching existing components, POS screens, receipt
  templates, or asset bundle configuration. Also trigger when migrating Odoo 15 POS
  JavaScript (odoo.define, Registries.Component.extend, Backbone models) to Odoo 18
  (ES modules, patch(), OWL reactive models).
  Do NOT use for Python-only backend development, QWeb report templates (server-side),
  or Odoo configuration/administration tasks. For backend Odoo development, use the
  odoo-development skill instead.
skillSlug: frontend-specialist-odoo
phases: [P, R, E, V, C]
generated: 2026-02-19
updated: 2026-02-24
status: filled
scaffoldVersion: "2.0.0"
mode: manual
priority: high
autoActivate: true
---


# Odoo 18+ Frontend Development Specialist

This skill provides authoritative guidance for developing Odoo 18+ frontend code using the OWL component framework and the Odoo web client architecture, with special focus on POS (Point of Sale) customization and migration from Odoo 15.

> **Before writing any code**, read the relevant reference file(s) in `references/` based on what the user needs. Each reference covers a specific domain in depth.

## When to Read Which Reference

| User Need | Reference File |
|---|---|
| Creating OWL components, lifecycle, reactivity, props, templates | `references/owl-components.md` |
| Services, registries, hooks, patching, client actions, field widgets | `references/odoo-web-framework.md` |
| Module structure, asset bundles, manifest, XML templates | `references/module-and-assets.md` |
| **POS screens, receipt rendering, POS models, POS extension** | `references/pos-frontend.md` |
| **Migrating JS from Odoo 15 to 18 (odoo.define → ES modules)** | `references/migration-frontend-15to18.md` |

## Cross-References

| Topic | Skill/Resource |
|---|---|
| Backend Python (models, ORM, fiscal) | `@.context/skills/odoo-development/SKILL.md` |
| NFC-e emission flow, SEFAZ integration | `@.context/skills/odoo-development/SKILL.md` sec. 7 |
| Test patterns (unit, E2E, RPC) | `@.context/skills/odoo-development/SKILL.md` sec. 10 |
| Gotchas from napkin | `.claude/napkin.md` |

## Architecture Overview

The Odoo 18 web client is a single-page application built on **OWL** (Odoo Web Library), a ~20kb reactive component framework inspired by React and Vue. All new frontend development must use OWL — the legacy widget system is deprecated.

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

## NXZ Project Context

### Module Hierarchy (Frontend)

```
point_of_sale (Odoo base)
+-- l10n_br_pos (OCA: CPF/CNPJ, fiscal JSON, PaymentScreen hooks)
|   +-- nxz_l10n_br_pos (NXZ bridge: tax computation, _afterOrderSync)
|   |   +-- l10n_br_pos_nfce (OCA: NFC-e base)
|   |       +-- nxz_l10n_br_pos_nfce (NXZ: DANFE receipt, NfceProcessor, print CSS)
+-- nxz_vouchers_pos (NXZ: coupon/voucher system)
+-- nxz_pos_product_company (NXZ: product filtering)
```

### Bridge Module Pattern (MANDATORY)

NXZ follows strict OCA/NXZ separation:
- **OCA modules** (`l10n_br_pos`, `l10n_br_pos_nfce`): Keep faithful to OCA migration, no NXZ features
- **NXZ bridge modules** (`nxz_l10n_br_pos`, `nxz_l10n_br_pos_nfce`): Extend OCA via `_inherit` in Python, `patch()` in JS (Odoo 18)

### Current Frontend State

**Odoo 18 migration COMPLETE (Phase 3).** All 5 POS modules rewritten to OWL 3:
- `l10n_br_pos`: 5 JS + 2 XML (fiscal maps, PaymentScreen, TicketScreen)
- `l10n_br_pos_nfce`: 1 JS (PosPayment patch)
- `nxz_l10n_br_pos`: 2 JS (tax computation, _postPushOrderResolve hook)
- `nxz_vouchers_pos`: 3 JS + 1 XML (coupon system)
- `nxz_l10n_br_pos_nfce`: 4 JS + 1 XML + 1 CSS (DANFE receipt, NfceProcessor)

**Key architectural changes from 15→18:**
- `odoo.define()` → `/** @odoo-module */` + ES6 imports
- `Registries.Component.extend()` → `patch(Component.prototype, {...})`
- `models.Order.extend()` → `patch(PosOrder.prototype, {...})`
- `_afterOrderSync` → native `_postPushOrderResolve` hook
- `_export_for_ui` → `_load_pos_data_fields` (Python)
- `models.load_models()` / `models.load_fields()` → `pos.load.mixin` (Python)
- `this.rpc({model, method})` → `this.pos.data.call(model, method, args)`
- `showPopup("ErrorPopup")` → `this.dialog.add(AlertDialog, {})`
- `this.env.pos` → `this.pos = usePos()`
- ReprintReceiptScreen/Button REMOVED → TicketScreen handles reprinting
- Moment.js → Luxon DateTime

See `references/migration-frontend-15to18.md` for complete migration guide.

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
