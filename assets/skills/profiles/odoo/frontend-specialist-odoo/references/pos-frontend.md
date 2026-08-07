# POS Frontend Reference — Odoo 18+

## POS Architecture Overview

The Odoo 18 Point of Sale is a single-page OWL application loaded via the `point_of_sale._assets_pos` bundle. All components are OWL 2.x+ — Backbone models are gone.

### Component Hierarchy

```
POS Chrome (main container)
+-- ProductScreen (default start screen)
|   +-- ProductList, NumericInput, ControlButtons
+-- PaymentScreen (payment processing)
|   +-- PaymentMethodButtons, PaymentLines
+-- TicketScreen (order history, reprint)
|   +-- OrderList, OrderRow, ControlButtons
+-- ReceiptScreen (receipt display/print)
|   +-- OrderReceipt (QWeb template)
+-- Other screens (PartnerListScreen, etc.)
```

### Import Paths

```javascript
// Core POS components
import { ProductScreen } from "@point_of_sale/app/screens/product_screen/product_screen";
import { PaymentScreen } from "@point_of_sale/app/screens/payment_screen/payment_screen";
import { TicketScreen } from "@point_of_sale/app/screens/ticket_screen/ticket_screen";
import { ReceiptScreen } from "@point_of_sale/app/screens/receipt_screen/receipt_screen";

// POS models
import { PosOrder } from "@point_of_sale/app/models/pos_order";
import { PosOrderline } from "@point_of_sale/app/models/pos_order_line";

// POS utilities
import { registry } from "@web/core/registry";
import { patch } from "@web/core/utils/patch";
import { useService } from "@web/core/utils/hooks";
```

## Asset Bundle

### Bundle: `point_of_sale._assets_pos`

In Odoo 18, ALL POS frontend files go in a single bundle. Unlike Odoo 15 where XML went separately in `web.assets_qweb`.

```python
# __manifest__.py
{
    'name': 'My POS Extension',
    'version': '18.0.1.0.0',
    'depends': ['point_of_sale'],
    'assets': {
        'point_of_sale._assets_pos': [
            # JS components and patches
            'my_module/static/src/js/**/*.js',
            # QWeb templates (component + receipt)
            'my_module/static/src/xml/**/*.xml',
            # Stylesheets
            'my_module/static/src/scss/**/*.scss',
            'my_module/static/src/css/**/*.css',
        ],
    },
}
```

**Critical notes:**
- Use `point_of_sale._assets_pos` (with underscore prefix)
- Do NOT use `point_of_sale.assets` (Odoo 15 name) — silently ignored
- Do NOT use `web.assets_qweb` for POS XML — use `_assets_pos`
- All JS files MUST have `/** @odoo-module **/` header
- After manifest changes: restart server + upgrade module

### Asset Operations

```python
# Insert before a specific file
('before', 'point_of_sale/static/src/target.js', 'my_module/static/src/my_file.js'),

# Insert after a specific file
('after', 'point_of_sale/static/src/target.js', 'my_module/static/src/my_file.js'),

# Remove a file from the bundle
('remove', 'point_of_sale/static/src/unwanted.js'),

# Replace a file
('replace', 'point_of_sale/static/src/old.js', 'my_module/static/src/new.js'),
```

## POS Screens

### Screen Navigation

```javascript
// Navigate to a screen
this.pos.showScreen('PaymentScreen');

// Navigate with props
this.pos.showScreen('ReceiptScreen', {
    order: currentOrder,
});
```

### Extending a Screen

```javascript
/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { PaymentScreen } from "@point_of_sale/app/screens/payment_screen/payment_screen";
import { onMounted, useState } from "@odoo/owl";

patch(PaymentScreen.prototype, {
    setup() {
        super.setup(...arguments);
        this.customState = useState({ nfceProcessed: false });

        onMounted(() => {
            // DOM available here
        });
    },

    async validateOrder(isForceValidate) {
        // Pre-validation (e.g., fiscal checks)
        const result = await super.validateOrder(isForceValidate);
        // Post-validation (e.g., NFC-e emission)
        return result;
    },
});
```

### Registering a New Screen

```javascript
/** @odoo-module **/

import { Component, useState } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";

export class MyCustomScreen extends Component {
    static template = "my_module.MyCustomScreen";

    setup() {
        this.pos = useService("pos");
        this.state = useState({ data: [] });
    }
}

registry.category("pos_screens").add("MyCustomScreen", MyCustomScreen);
```

## POS Models (Frontend)

### Architecture

In Odoo 18, POS models use **native JavaScript objects with `useState()` reactivity**. Backbone.js is completely removed.

### Accessing Models

```javascript
setup() {
    this.pos = useService("pos");

    // Current order
    const order = this.pos.get_order();

    // All loaded orders
    const orders = this.pos.models["pos.order"];

    // Order lines
    const lines = order.get_orderlines();

    // Payment lines
    const payments = order.get_paymentlines();
}
```

### Loading Custom Fields into POS

**Backend (Python) — declare fields to load:**

```python
class PosOrder(models.Model):
    _inherit = 'pos.order'

    nfce_document_number = fields.Char()
    nfce_document_key = fields.Char()

    def _load_pos_data_fields(self, config_id):
        """Add custom fields to POS session data."""
        result = super()._load_pos_data_fields(config_id)
        result.extend(['nfce_document_number', 'nfce_document_key'])
        return result
```

**Frontend (JavaScript) — use custom fields:**

```javascript
/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { PosOrder } from "@point_of_sale/app/models/pos_order";

patch(PosOrder.prototype, {
    export_for_printing(baseUrl, headerData) {
        const result = super.export_for_printing(baseUrl, headerData);
        result.nfce_document_number = this.nfce_document_number || "";
        result.nfce_document_key = this.nfce_document_key || "";
        return result;
    },
});
```

### Syncing Custom Fields to POS (Odoo 18)

**`_export_for_ui` was REMOVED in Odoo 18.** Use `_load_pos_data_fields` instead:

```python
class PosOrder(models.Model):
    _inherit = 'pos.order'

    @api.model
    def _load_pos_data_fields(self, config_id):
        """Add custom fields to POS data loading."""
        fields = super()._load_pos_data_fields(config_id)
        fields += ['nfce_document_number', 'nfce_document_key',
                    'nfce_authorization_protocol']
        return fields
```

For custom models (non-core), **inherit `pos.load.mixin`** to enable data loading:

```python
class FiscalMap(models.Model):
    _name = 'l10n_br_pos.product_fiscal_map'
    _inherit = ['l10n_br_fiscal.document.line.mixin', 'pos.load.mixin']

    @api.model
    def _load_pos_data_fields(self, config_id):
        return ['id', 'product_tmpl_id', 'cfop_code', 'icms_percent', ...]

    @api.model
    def _load_pos_data_domain(self, data):
        config_id = data['pos.config']['data'][0]['id']
        return [('pos_config_id', '=', config_id)]
```

## Receipt Rendering

### Data Flow

```
POS Order → export_for_printing() → receipt data object → OrderReceipt template → HTML
```

### Customizing Receipt Data

```javascript
/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { PosOrder } from "@point_of_sale/app/models/pos_order";

patch(PosOrder.prototype, {
    export_for_printing(baseUrl, headerData) {
        const result = super.export_for_printing(baseUrl, headerData);
        // Add custom data for receipt template
        result.fiscal_note = this.fiscal_note || "";
        result.qrcode_base64 = this.qrcode_base64 || "";
        return result;
    },
});
```

### Receipt Data Structure

```javascript
{
    name: "Order 00001",
    date: "2026-02-23 10:30:00",
    company: { name, vat, email, phone, ... },
    cashier: "Admin User",
    orderlines: [{ product_name, qty, price, ... }],
    paymentlines: [{ name, amount }],
    total_with_tax: 100.00,
    total_without_tax: 85.00,
    // Custom fields added via export_for_printing()
}
```

### Extending Receipt Template

```xml
<?xml version="1.0" encoding="UTF-8"?>
<templates xml:space="preserve">
    <t t-name="my_module.OrderReceipt"
       t-inherit="point_of_sale.OrderReceipt"
       t-inherit-mode="extension">

        <!-- Add after order data section -->
        <xpath expr="//div[hasclass('pos-receipt-order-data')]" position="after">
            <div class="fiscal-info" t-if="receipt.fiscal_note">
                <br/>
                <div style="text-align:center; font-weight:bold;">Informacao Fiscal</div>
                <div t-esc="receipt.fiscal_note"/>
            </div>
        </xpath>

    </t>
</templates>
```

### Replacing Receipt Conditionally

A common pattern is to conditionally replace the standard receipt with a custom one
(e.g. a fiscal/localized receipt) while falling back to the default `OrderReceipt`:

```xml
<t t-name="my_module.ReceiptScreen"
   t-inherit="point_of_sale.ReceiptScreen"
   t-inherit-mode="extension">
    <xpath expr="//OrderReceipt" position="replace">
        <t t-if="isCustomReceipt and customData">
            <div class="custom-receipt">
                <!-- Custom receipt content -->
                <t t-call="my_module.CustomReceiptBody"/>
            </div>
        </t>
        <t t-else="">
            <OrderReceipt order="currentOrder" t-ref="order-receipt"/>
        </t>
    </xpath>
</t>
```

### Print CSS for Thermal Receipts

```css
/* Receipt container sizing */
.custom-receipt { width: 280px; margin: 0 auto; font-family: Arial, sans-serif; font-size: 11px; }
.receipt-80mm { width: 280px; }
.receipt-57mm { width: 200px; }

/* Print media — only override sizing, NOT visibility */
@media print {
    .custom-receipt { width: 100% !important; }
}

/* Dynamic @page size (injected via JS) */
/* NOTE: Odoo POS handles visibility. Only set page size + margins */
```

**Dynamic CSS injection (JS pattern):**

```javascript
mounted() {
    const style = document.createElement("style");
    style.id = "custom-print-page-size";
    style.textContent = `
        @page { size: 80mm 297mm; margin: 2mm 4mm 2mm 2mm; }
        @media print { .pos-receipt { width: 100% !important; } }
    `;
    document.head.appendChild(style);
}

willUnmount() {
    const style = document.getElementById("custom-print-page-size");
    if (style) style.remove();
}
```

**NEVER** override `visibility` in `@media print` — Odoo POS already handles print isolation with `body * { visibility: hidden }` + selective visibility for receipt container.

## POS Control Buttons

### Adding a Button to ProductScreen (Odoo 18)

```javascript
/** @odoo-module **/

import { Component } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";

export class MyControlButton extends Component {
    static template = "my_module.MyControlButton";

    setup() {
        this.pos = useService("pos");
    }

    async onClick() {
        // Button action
    }
}

registry.category("pos_available_widgets").add("my_control_button", MyControlButton);
```

```xml
<t t-name="my_module.MyControlButton">
    <button class="btn btn-light control-button" t-on-click="onClick">
        <i class="fa fa-star me-1"/>
        <span>My Button</span>
    </button>
</t>
```

## POS RPC Calls

### Calling Backend Methods from POS

```javascript
// Using orm service
const orm = useService("orm");

// Call a model method
const result = await orm.call("pos.order", "get_danfe_pos_data", [[orderId]]);

// Search and read
const orders = await orm.searchRead("pos.order", [["state", "=", "paid"]], ["name", "amount_total"]);

// Using rpc service (for custom routes)
const rpc = useService("rpc");
const data = await rpc("/my_module/custom_endpoint", { param: "value" });
```

## Generic Cross-Module POS Patterns

These are reusable, framework-level patterns. Project- or localization-specific overlays
(e.g. Brazilian fiscal receipts / DANFE NFC-e, vendor bridge modules) are documented in
the layered skills — see the **Cross-References** section of the parent `SKILL.md`
(`odoo-l10n-br` for BR fiscal, the company L3 overlay skill for a project-specific
module hierarchy).

### Hook-Based Extension Architecture (sync hooks)

A common cross-module pattern is to react after an order is synced to the backend. The
extension point evolved across versions:

```
# Odoo 15 — custom hook defined by a base module:
base_pos_module     → defines _afterOrderSync() hook (often empty)
extension_module    → implements hook: sets backendId, triggers a post-sync action

# Odoo 18 — native hook on PaymentScreen:
PaymentScreen       → provides _postPushOrderResolve(order, order_server_ids)
extension_module    → patches _postPushOrderResolve: sets backendId, triggers action
```

**NOTE:** `_afterOrderSync` was typically a *custom* hook in Odoo 15. Odoo 18 provides
`_postPushOrderResolve` as a **native** extension point, removing the need for an
intermediate custom hook.

### Getter-Based Template Context

Expose conditionals/data to the template via getters on the patched class:

```javascript
// Use getters for template conditionals
get isCustomReceipt() {
    const order = this.pos.get_order();
    return order && order.custom_document_number;
}

get customReceiptData() {
    const order = this.pos.get_order();
    return order?.custom_receipt_data || null;
}
// Template: <t t-if="isCustomReceipt and customReceiptData">
```

### Reusable Sub-Templates (t-call)

Factor a receipt body into a reusable QWeb sub-template and `t-call` it from multiple
screens:

```xml
<!-- Define reusable body -->
<t t-name="my_module.CustomReceiptBody">
    <div class="receipt-header" t-att-class="'receipt-' + (customReceiptData.paper_width or '80mm')">
        <!-- Receipt content -->
    </div>
</t>

<!-- Call from multiple screens -->
<t t-call="my_module.CustomReceiptBody"/>
```

## Source Documentation

- POS Development: https://www.odoo.com/documentation/18.0/developer/reference/frontend/framework_overview.html
- OWL Components: https://www.odoo.com/documentation/18.0/developer/reference/frontend/owl_components.html
- Patching: https://www.odoo.com/documentation/18.0/developer/reference/frontend/patching_code.html
- Asset Bundles: https://www.odoo.com/documentation/18.0/developer/reference/frontend/assets.html
