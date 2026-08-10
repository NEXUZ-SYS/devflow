# Frontend Migration Guide — Odoo 15 to 18

## Overview

Migrating Odoo POS frontend code from 15 to 18 involves three major shifts:
1. **Module system**: `odoo.define()` + `require()` → `@odoo-module` + ES6 imports
2. **Component extension**: `Registries.Component.extend()` → `patch()`
3. **Data models**: Backbone.js → OWL reactive (`useState`)

This reference provides side-by-side patterns for each migration concern.

## Version Jump Summary

| Aspect | Odoo 15 | Odoo 16 | Odoo 17 | Odoo 18 |
|--------|---------|---------|---------|---------|
| Module system | `odoo.define()` | Both (transitional) | `@odoo-module` only | ES6 imports |
| Component ext | `Registries.Component.extend()` | Both | `patch()` preferred | `patch()` only |
| Models | Backbone.js | Backbone.js | Transitional | OWL reactive |
| View attrs | `attrs={'invisible': [...]}` | Same | Deprecated | `invisible="expr"` |
| POS bundle | `point_of_sale.assets` + `web.assets_qweb` | Same | Transitional | `point_of_sale._assets_pos` |
| Template ext | `t-inherit` + `t-inherit-mode` | Same | Same | `t-inherit` + XPath |
| OWL version | OWL 1.x | OWL 2.x | OWL 2.x | OWL 3.x |

## 1. Module System Migration

### Odoo 15 (Legacy)

```javascript
odoo.define('my_pos_module.PaymentScreen', function (require) {
    'use strict';

    const Registries = require('point_of_sale.Registries');
    const PaymentScreen = require('point_of_sale.PaymentScreen');
    const { useListener } = require('web.custom_hooks');

    const CustomPaymentScreen = (PaymentScreen) =>
        class extends PaymentScreen {
            setup() {
                super.setup();
                useListener('click-validate', this.onValidate);
            }

            async _afterOrderSync(syncedOrderBackendIds) {
                await super._afterOrderSync(...arguments);
                // custom fiscal logic
            }
        };

    Registries.Component.extend(PaymentScreen, CustomPaymentScreen);
    return CustomPaymentScreen;
});
```

### Odoo 18 (Modern)

```javascript
/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { PaymentScreen } from "@point_of_sale/app/screens/payment_screen/payment_screen";

patch(PaymentScreen.prototype, {
    setup() {
        super.setup(...arguments);
        // useListener is gone — use t-on-click in template or onMounted
    },

    async _afterOrderSync(syncedOrderBackendIds) {
        await super._afterOrderSync(...arguments);
        // custom fiscal logic
    },
});
```

### Import Path Mapping

| Odoo 15 `require()` | Odoo 18 `import` |
|---------------------|------------------|
| `require('point_of_sale.Registries')` | Not needed (use `patch` instead) |
| `require('point_of_sale.PaymentScreen')` | `import { PaymentScreen } from "@point_of_sale/app/screens/payment_screen/payment_screen"` |
| `require('point_of_sale.ProductScreen')` | `import { ProductScreen } from "@point_of_sale/app/screens/product_screen/product_screen"` |
| `require('point_of_sale.ReceiptScreen')` | `import { ReceiptScreen } from "@point_of_sale/app/screens/receipt_screen/receipt_screen"` |
| `require('point_of_sale.TicketScreen')` | `import { TicketScreen } from "@point_of_sale/app/screens/ticket_screen/ticket_screen"` |
| `require('point_of_sale.PosComponent')` | Not needed (use `Component` from OWL) |
| `require('point_of_sale.models')` | `import { PosOrder } from "@point_of_sale/app/models/pos_order"` |
| `require('web.custom_hooks')` | `import { ... } from "@web/core/utils/hooks"` |
| `require('@web/core/registry')` | `import { registry } from "@web/core/registry"` |

### Module Header

```javascript
// Odoo 15 — AMD-like wrapper
odoo.define('module.name', function (require) {
    'use strict';
    // ...
    return ExportedValue;
});

// Odoo 18 — ES6 module with header tag
/** @odoo-module **/
import { ... } from "...";
export class MyComponent extends Component { ... }
```

## 2. Component Extension Migration

### Odoo 15: `Registries.Component.extend()`

```javascript
// Factory function pattern — returns arrow function returning class
const CustomScreen = (OriginalScreen) =>
    class extends OriginalScreen {
        mounted() {
            super.mounted();
            // custom logic
        }
    };

Registries.Component.extend(PaymentScreen, CustomScreen);
```

### Odoo 18: `patch()`

```javascript
import { patch } from "@web/core/utils/patch";
import { PaymentScreen } from "@point_of_sale/app/screens/payment_screen/payment_screen";

patch(PaymentScreen.prototype, {
    setup() {
        super.setup(...arguments);
        // Replaces mounted() — use onMounted() hook
        onMounted(() => {
            // custom logic
        });
    },
});
```

### Critical Rules for `patch()`

1. **Prototype for instance methods**: `patch(MyClass.prototype, {...})`
2. **Class for static methods**: `patch(MyClass, {...})`
3. **Method shorthand only**: `{ myMethod() { super.myMethod(); } }` — NOT `function()` or `() =>`
4. **Always call super in setup**: `super.setup(...arguments)`
5. **Cannot patch constructor**: Use `setup()` which IS patchable
6. **Returns unpatch**: `const unpatch = patch(...)` — useful for testing

### Super Calls

```javascript
// Odoo 15
this._super(...arguments);

// Odoo 18
super.methodName(...arguments);
```

## 3. Model Migration (Backbone → OWL)

### Odoo 15: Backbone Models

```javascript
var models = require('point_of_sale.models');

var _super_order = models.Order.prototype;
models.Order = models.Order.extend({
    initialize: function(attr, options) {
        // Defaults BEFORE super (critical — super calls init_from_JSON)
        this.nfce_document_number = null;
        this.danfe_data = null;
        _super_order.initialize.call(this, attr, options);
    },

    init_from_JSON: function(json) {
        _super_order.init_from_JSON.call(this, json);
        this.nfce_document_number = json.nfce_document_number || null;
        this.danfe_data = json.danfe_data || null;
    },

    export_as_JSON: function() {
        var json = _super_order.export_as_JSON.call(this);
        json.nfce_document_number = this.nfce_document_number;
        return json;
    },

    export_for_printing: function() {
        var receipt = _super_order.export_for_printing.call(this);
        receipt.nfce_document_number = this.nfce_document_number;
        return receipt;
    },
});
```

### Odoo 18: OWL Reactive Models

```javascript
/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { PosOrder } from "@point_of_sale/app/models/pos_order";

patch(PosOrder.prototype, {
    export_for_printing(baseUrl, headerData) {
        const result = super.export_for_printing(baseUrl, headerData);
        result.nfce_document_number = this.nfce_document_number || "";
        result.danfe_data = this.danfe_data || null;
        return result;
    },
});
```

**Backend fields loaded via `_load_pos_data_fields()` ONLY.** `_export_for_ui()` was removed in Odoo 18 — do NOT use it.

### Loading Extra Data Models

```python
# Odoo 18 — Custom models MUST inherit pos.load.mixin
class GiftVoucher(models.Model):
    _name = 'gift.voucher.pos'
    _inherit = ['gift.voucher.pos', 'pos.load.mixin']  # ← REQUIRED

    @api.model
    def _load_pos_data_fields(self, config_id):
        return ['id', 'name', 'code', 'discount_type', 'active']

    @api.model
    def _load_pos_data_domain(self, data):
        # Optional: filter records sent to POS terminal
        config_id = data['pos.config']['data'][0]['id']
        return [('active', '=', True)]
```

```javascript
// Odoo 18 — Frontend: access via this.pos.models
setup() {
    this.pos = usePos();  // NOT useService("pos")
    const vouchers = this.pos.models["gift.voucher.pos"];
    // .getAll() returns array, .get(id) returns single record
}
```

**Odoo 15 → 18 data loading comparison:**

```javascript
// Odoo 15 — models.load_models() (JS-driven)
models.load_models([{
    model: 'gift.voucher.pos',
    fields: ['id', 'name', 'code'],
    loaded: function(self, records) { self.vouchers = records; },
}]);

// Odoo 18 — pos.load.mixin (Python-driven)
// Backend: _load_pos_data_fields + _load_pos_data_domain
// Frontend: this.pos.models["gift.voucher.pos"] (automatic)
```

### CRITICAL: `_export_for_ui` Removed in Odoo 18

In Odoo 15, `_export_for_ui(order)` added custom fields to synced order data for TicketScreen:

```python
# Odoo 15 — DEPRECATED (do NOT use in 18)
def _export_for_ui(self, order):
    result = super()._export_for_ui(order)
    result['custom_field'] = order.custom_field
    return result
```

In Odoo 18, use `_load_pos_data_fields` instead — all listed fields are automatically loaded:

```python
# Odoo 18 — CORRECT replacement
@api.model
def _load_pos_data_fields(self, config_id):
    fields = super()._load_pos_data_fields(config_id)
    fields += ['custom_field']
    return fields
```

## 4. Template Migration

### Template Extensions

```xml
<!-- Odoo 15 -->
<t t-name="my_module.ExtendedReceipt"
   t-inherit="point_of_sale.ReceiptScreen"
   t-inherit-mode="extension">
    <xpath expr="//OrderReceipt" position="replace">
        <!-- custom content -->
    </xpath>
</t>

<!-- Odoo 18 — same syntax, but no owl="1" attribute -->
<t t-name="my_module.ExtendedReceipt"
   t-inherit="point_of_sale.ReceiptScreen"
   t-inherit-mode="extension">
    <xpath expr="//OrderReceipt" position="replace">
        <!-- custom content -->
    </xpath>
</t>
```

### Critical Template Rules (both versions)

1. **`t-inherit` MUST have full module prefix**: `point_of_sale.ReceiptScreen` (NOT `ReceiptScreen`)
2. **Template extensions MUST NOT have `owl="1"`** attribute
3. **`t-key` is REQUIRED** in `t-foreach` loops
4. **`t-esc` escapes HTML** — use `t-out` for trusted HTML content

### XPath Positions

| Position | Effect |
|----------|--------|
| `before` | Insert before matched element |
| `after` | Insert after matched element |
| `inside` | Insert as last child of matched element |
| `replace` | Replace matched element entirely |
| `attributes` | Modify attributes of matched element |

### Gotcha: OWL xpath limitations (Odoo 15)

In Odoo 15, `hasclass()` and `contains(@class)` do NOT work reliably for regular HTML elements in OWL templates. They work for component elements (e.g., `//OrderReceipt`). For text changes on regular elements, use JavaScript DOM manipulation in lifecycle hooks.

## 5. Asset Bundle Migration

### Odoo 15

```python
# JS and CSS in one bundle, XML templates in another
"assets": {
    "point_of_sale.assets": [
        "my_module/static/src/js/**/*.js",
        "my_module/static/src/css/**/*.css",
    ],
    "web.assets_qweb": [
        "my_module/static/src/xml/**/*.xml",
    ],
}
```

### Odoo 18

```python
# Everything in one POS bundle
"assets": {
    "point_of_sale._assets_pos": [
        "my_module/static/src/js/**/*.js",
        "my_module/static/src/xml/**/*.xml",
        "my_module/static/src/scss/**/*.scss",
    ],
}
```

**Note the changes:**
- Bundle renamed: `point_of_sale.assets` → `point_of_sale._assets_pos`
- XML templates now go in the SAME bundle (not `web.assets_qweb`)
- SCSS preferred over CSS (both work)

## 6. Lifecycle Hook Migration

### Odoo 15 (OWL 1.x class methods)

```javascript
class MyComponent extends PosComponent {
    setup() { }           // initialization
    willStart() { }       // async before first render
    mounted() { }         // DOM available
    willPatch() { }       // before re-render
    patched() { }         // after re-render
    willUnmount() { }     // before destroy
}
```

### Odoo 18 (OWL 2.x/3.x hooks in setup)

```javascript
import { onWillStart, onMounted, onWillPatch, onPatched, onWillUnmount } from "@odoo/owl";

setup() {
    onWillStart(async () => { /* async init */ });
    onMounted(() => { /* DOM available */ });
    onWillPatch(() => { /* before re-render */ });
    onPatched(() => { /* after re-render */ });
    onWillUnmount(() => { /* cleanup */ });
}
```

**Key difference**: In Odoo 18, lifecycle hooks are **called inside `setup()`**, not defined as class methods.

## 7. Event Handling Migration

### Odoo 15: useListener

```javascript
const { useListener } = require('web.custom_hooks');

setup() {
    super.setup();
    useListener('click-validate', this.onValidate);
}
```

### Odoo 18: Template events + useBus

```javascript
// Direct event handling in template
// <button t-on-click="onValidate">Validate</button>

// Bus events
import { useBus } from "@web/core/utils/hooks";

setup() {
    useBus(this.env.bus, "some-event", (ev) => {
        this.handleEvent(ev.detail);
    });
}
```

## 8. RPC Migration

### Odoo 15

```javascript
// Inside POS component (this.rpc available)
const result = await this.rpc({
    model: 'pos.order',
    method: 'get_danfe_pos_data',
    args: [[orderId]],
});

// From non-component class (pos reference)
const result = await this.pos.rpc({
    model: 'pos.order',
    method: 'prepare_nfce_vals',
    args: [[orderId], 'nfce'],
});
```

### Odoo 18

```javascript
// Inside POS component — use this.pos.data.call()
const result = await this.pos.data.call(
    "pos.order",
    "get_danfe_pos_data",
    [[orderId]]
);

// From non-component class (pass pos reference)
class FiscalDocumentProcessor {
    constructor(pos) { this.pos = pos; }
    async send_order(order) {
        const result = await this.pos.data.call(
            "pos.order", "prepare_fiscal_vals",
            [[order.backendId || order.id], "fiscal_doc"]
        );
    }
}
```

**IMPORTANT:** In POS context, use `this.pos.data.call()` (NOT `orm.call()`). The `orm` service works in backend views, but POS components should use the POS data layer.

## 9. POS Control Buttons Migration

### Odoo 15

```javascript
const PosComponent = require('point_of_sale.PosComponent');
const ProductScreen = require('point_of_sale.ProductScreen');
const Registries = require('point_of_sale.Registries');

class CouponButton extends PosComponent {
    setup() {
        super.setup();
        useListener('click', this.onClick);
    }
    async onClick() { /* ... */ }
}
CouponButton.template = 'my_vouchers_pos.CouponButton';

ProductScreen.addControlButton({
    component: CouponButton,
    condition: function() { return true; },
});
Registries.Component.add(CouponButton);
```

### Odoo 18

```javascript
/** @odoo-module **/

import { Component } from "@odoo/owl";
import { registry } from "@web/core/registry";

export class CouponButton extends Component {
    static template = "my_vouchers_pos.CouponButton";

    async onClick() { /* ... */ }
}

registry.category("pos_available_widgets").add("coupon_button", CouponButton);
```

## 10. POS Module Migration Checklist

For each POS module being migrated from 15 to 18:

### Code Changes

- [ ] Replace `odoo.define()` with `/** @odoo-module **/` + ES6 imports
- [ ] Replace `require('...')` with `import { ... } from "..."`
- [ ] Replace `Registries.Component.extend(Base, Fn)` with `patch(Base.prototype, {...})`
- [ ] Replace `this._super(...arguments)` with `super.method(...arguments)`
- [ ] Replace `models.Order.extend({...})` with `patch(PosOrder.prototype, {...})`
- [ ] Replace `init_from_JSON` / `export_as_JSON` with `_load_pos_data_fields` + `_export_for_ui`
- [ ] Replace lifecycle class methods with hook calls inside `setup()`
- [ ] Replace `useListener` with `t-on-click` or `useBus`
- [ ] Replace `this.rpc({model, method, args})` with `orm.call(model, method, args)`

### Manifest Changes

- [ ] Replace `point_of_sale.assets` with `point_of_sale._assets_pos`
- [ ] Move XML from `web.assets_qweb` to `point_of_sale._assets_pos`
- [ ] Update version to `18.0.x.x.x`

### Template Changes

- [ ] Remove `owl="1"` from template extensions
- [ ] Verify `t-inherit` has full module prefix
- [ ] Verify `t-key` on all `t-foreach` loops
- [ ] Replace `t-esc` with `t-out` where HTML output is needed

### Testing

- [ ] Module installs without errors
- [ ] POS loads and shows ProductScreen
- [ ] Custom buttons appear and function
- [ ] Receipts render correctly (standard + DANFE if applicable)
- [ ] Print preview shows correct paper size
- [ ] Synced orders in TicketScreen show custom fields

## Known Gotchas (from napkin)

| Gotcha | Odoo 15 Behavior | Odoo 18 Fix |
|--------|-------------------|-------------|
| `push_single_order` returns `[77]` not `[{id:77}]` | Same | Same — extract `id` from array |
| `_finalizeValidation` calls `showScreen` internally | Must override fully | Check if pattern changed in 18 |
| `order.backendId` not set after push | Manual extraction needed | Check if auto-populated in 18 |
| POS XML in wrong bundle → silently ignored | `web.assets_qweb` for XML | `point_of_sale._assets_pos` for ALL |
| `t-inherit` without module prefix → ignored | Prefix required | Same — always use full prefix |
| `@media print` visibility override breaks POS | Don't override visibility | Same — Odoo handles print isolation |
| `company_legal_name` not `company_name` | In DANFE data | Same — verify field names |
| Defaults after `super.initialize()` overwrite JSON | Set defaults BEFORE super | Different pattern in 18 (no Backbone) |

## 11. XML View Changes (Backend)

While this guide focuses on frontend JS migration, some XML changes are required in both backend views and frontend templates.

### `<tree>` → `<list>` (MANDATORY)

In Odoo 17+, the `<tree>` tag was renamed to `<list>`. This is a **required** change for all XML view definitions.

```xml
<!-- Odoo 15 -->
<record id="view_my_model_tree" model="ir.ui.view">
    <field name="arch" type="xml">
        <tree string="My Records">
            <field name="name"/>
            <field name="date"/>
        </tree>
    </field>
</record>

<!-- Odoo 18 -->
<record id="view_my_model_list" model="ir.ui.view">
    <field name="arch" type="xml">
        <list string="My Records">
            <field name="name"/>
            <field name="date"/>
        </list>
    </field>
</record>
```

**Audit command:** `grep -rn '<tree' modules/18.0/` — should return 0 matches in view definitions.

### `attrs` dict → inline expressions (MANDATORY)

The `attrs` dictionary syntax was deprecated in Odoo 17 and **removed** in Odoo 18.

```xml
<!-- Odoo 15 -->
<field name="qty" attrs="{'invisible': [('state', '!=', 'draft')], 'readonly': [('locked', '=', True)]}"/>

<!-- Odoo 18 -->
<field name="qty" invisible="state != 'draft'" readonly="locked"/>
```

**Note:** The inline expression uses Python-like syntax evaluated by the web client. `True`/`False` follow Python conventions.

## 12. Python Backend API Changes (POS-relevant)

These Python API changes affect POS modules migrating from 15 to 18:

### `_process_order` Signature Change

```python
# Odoo 15
@api.model
def _process_order(self, order, draft, existing_order):
    pos_session_id = order["data"].get("pos_session_id")
    order["data"]["to_invoice"] = True
    if not draft:
        self._send_nfce_after_invoice(order_id)
    return super()._process_order(order, draft, existing_order)

# Odoo 18 — 'draft' param REMOVED, order dict is FLAT (no ['data'] wrapper)
@api.model
def _process_order(self, order, existing_order):
    session_id = order.get("session_id")  # NOT order["data"]["pos_session_id"]
    order["to_invoice"] = True            # NOT order["data"]["to_invoice"]
    is_draft = order.get("state") == "draft"  # compute from order dict
    order_id = super()._process_order(order, existing_order)
    if not is_draft:
        self._send_nfce_after_invoice(order_id)
    return order_id
```

### `_prepare_invoice_line` → `_get_invoice_lines_values`

```python
# Odoo 15 — singular, called per line
def _prepare_invoice_line(self, order_line):
    vals = super()._prepare_invoice_line(order_line)
    vals.update(order_line._prepare_nfce_tax_dict())
    return vals

# Odoo 18 — new method, called from _prepare_invoice_lines (plural)
@api.model
def _get_invoice_lines_values(self, line_values, pos_order_line):
    vals = super()._get_invoice_lines_values(line_values, pos_order_line)
    tax_dict = pos_order_line._prepare_nfce_tax_dict()
    if tax_dict:
        vals.update(tax_dict)
    return vals
```

### `_export_for_ui` → `_load_pos_data_fields`

```python
# Odoo 15
def _export_for_ui(self, order):
    res = super()._export_for_ui(order)
    res["nfce_document_number"] = order.nfce_document_number or 0
    return res

# Odoo 18 — just declare the field list (data loading is automatic)
@api.model
def _load_pos_data_fields(self, config_id):
    fields = super()._load_pos_data_fields(config_id)
    fields += ["nfce_document_number", "nfce_document_key"]
    return fields
```

## 13. Popup/Dialog Migration

### Odoo 15

```javascript
const { Gui } = require('point_of_sale.Gui');

// Error popup
this.showPopup("ErrorPopup", {
    title: _t("Error"),
    body: _t("Invalid CPF/CNPJ"),
});

// Selection popup
const { confirmed, payload } = await this.showPopup("SelectionPopup", {
    title: "Choose option",
    list: [{ id: "opt1", label: "Option 1", item: "opt1" }],
});

// Text input popup
const { confirmed, payload } = await this.showPopup("TextInputPopup", {
    title: "Enter reason",
    placeholder: "Type here...",
});
```

### Odoo 18

```javascript
import { AlertDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { SelectionPopup } from "@point_of_sale/app/utils/input_popups/selection_popup/selection_popup";
import { TextInputPopup } from "@point_of_sale/app/utils/input_popups/text_input_popup/text_input_popup";

setup() {
    this.dialog = useService("dialog");
}

// Error dialog
this.dialog.add(AlertDialog, {
    title: _t("Error"),
    body: _t("Invalid CPF/CNPJ"),
});

// Selection popup
this.dialog.add(SelectionPopup, {
    title: "Choose option",
    list: [{ id: "opt1", label: "Option 1", item: "opt1" }],
    getPayload: (selected) => { /* handle selection */ },
});

// Text input popup
this.dialog.add(TextInputPopup, {
    title: "Enter reason",
    placeholder: "Type here...",
    getPayload: (text) => { /* handle input */ },
});
```

## 14. POS Hook Migration

### `_afterOrderSync` → `_postPushOrderResolve`

```javascript
// Odoo 15 — custom hook defined in l10n_br_pos
async _afterOrderSync(syncedOrderBackendIds) {
    // Set backendId from sync response
    const orderId = syncedOrderBackendIds[0];
    const order = this.env.pos.get_order();
    order.backendId = typeof orderId === 'object' ? orderId.id : orderId;
    await order.document_send(this);
}

// Odoo 18 — native hook in PaymentScreen
async _postPushOrderResolve(order, order_server_ids) {
    const result = await super._postPushOrderResolve(...arguments);
    if (this.pos.config.simplified_document_type && order_server_ids?.length) {
        if (order && !order.backendId) {
            const serverOrder = order_server_ids[0];
            order.backendId = typeof serverOrder === "object"
                ? serverOrder.id : serverOrder;
        }
        if (order?.backendId) {
            await order.document_send(this);
        }
    }
    return result;
}
```

## 15. Removed POS Components in Odoo 18

| Odoo 15 Component | Odoo 18 Status | Migration |
|-------------------|----------------|-----------|
| `ReprintReceiptScreen` | **REMOVED** | TicketScreen handles reprinting via `print()` method |
| `ReprintReceiptButton` | **REMOVED** | Integrated as static button in TicketScreen |
| `OrderList` (separate component) | **REMOVED** | Merged into TicketScreen |
| `ErrorPopup`, `ConfirmPopup` | **REMOVED** | Use `AlertDialog`, `ConfirmationDialog` |
| `SelectionPopup` | Moved | `@point_of_sale/app/utils/input_popups/selection_popup/selection_popup` |
| `TextInputPopup` | Moved | `@point_of_sale/app/utils/input_popups/text_input_popup/text_input_popup` |

## 16. Miscellaneous Changes

### `this.el` Does Not Exist in OWL 3

```javascript
// Odoo 15 — this.el available in mounted()
mounted() {
    const btn = this.el.querySelector(".button.print");
    btn.textContent = "Imprimir DANFE";
}

// Odoo 18 — use document.querySelector or useRef
import { useRef, onMounted } from "@odoo/owl";
setup() {
    this.myRef = useRef("my-element");
    onMounted(() => {
        // Option 1: useRef
        const el = this.myRef.el;
        // Option 2: document query
        const btn = document.querySelector(".receipt-screen .btn-primary");
    });
}
```

### `moment.js` → `luxon.DateTime`

```javascript
// Odoo 15
const moment = require('web.time');
const now = moment.str_to_datetime(dateString);

// Odoo 18
import { DateTime } from "luxon";
import { serializeDate } from "@web/core/l10n/dates";
const now = DateTime.now();
const formatted = serializeDate(now);
```

### `usePos()` Hook (NOT `useService("pos")`)

```javascript
// WRONG — works in backend views but not recommended for POS
this.pos = useService("pos");

// CORRECT — dedicated POS hook
import { usePos } from "@point_of_sale/app/store/pos_hook";
setup() {
    this.pos = usePos();
}
```

### Glob Pattern for Assets (Recommended)

```python
# Odoo 18 — use glob instead of listing individual files
"assets": {
    "point_of_sale._assets_pos": [
        "my_module/static/src/**/*",  # catches JS + XML + CSS
    ],
}
```

## Source Documentation

- Odoo 18 Migration Guide: https://github.com/OCA/maintainer-tools/wiki/Migration-to-version-18.0
- OWL Framework: https://github.com/odoo/owl
- Patching Code: https://www.odoo.com/documentation/18.0/developer/reference/frontend/patching_code.html
- POS Development: https://www.odoo.com/documentation/18.0/developer/reference/frontend/framework_overview.html
