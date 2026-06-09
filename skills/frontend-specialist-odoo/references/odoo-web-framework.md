# Odoo 18 Web Framework Reference

## Registries

Registries are ordered key/value maps that serve as the main extension points of the Odoo web client. The framework looks up registries to find components, services, and other definitions.

### Registry API

```javascript
import { registry } from "@web/core/registry";

// Get a sub-registry (created on the fly if it doesn't exist)
const fieldRegistry = registry.category("fields");

// Add
fieldRegistry.add("my_field", MyFieldComponent);
fieldRegistry.add("my_field", MyFieldComponent, { sequence: 10 }); // with ordering
fieldRegistry.add("my_field", MyFieldComponent, { force: true });  // override existing

// Get
const component = fieldRegistry.get("my_field");
const maybeComponent = fieldRegistry.get("my_field", null); // default value

// Remove
fieldRegistry.remove("my_field");

// Iterate
for (const [key, value] of fieldRegistry.getEntries()) { ... }
```

### Key Registries

| Category | Purpose | What to Register |
|---|---|---|
| `fields` | Field widgets for form/list/kanban views | `{ component, supportedTypes, ... }` |
| `views` | View types (kanban, list, form...) | View definition object |
| `actions` | Client actions | OWL Component class |
| `services` | Service definitions | `{ dependencies, start }` object |
| `systray` | Navbar systray items | OWL Component class |
| `main_components` | Always-visible components | `{ Component, props }` |
| `user_menuitems` | User menu dropdown items | `(env) => ({ description, callback })` |
| `effects` | Visual effects (e.g., rainbow man) | Effect provider function |
| `command_categories` | Command palette categories | Category definitions |
| `command_provider` | Command palette providers | Provider functions |
| `error_handlers` | Custom error handlers | Error handler functions |

## Services

Services are long-lived singletons that provide features to components. They form a dependency injection system.

### Defining a Service

```javascript
import { registry } from "@web/core/registry";

const myService = {
    // Other services this service depends on
    dependencies: ["notification", "orm", "rpc"],

    // Called at startup; return value is the service's public API
    start(env, { notification, orm, rpc }) {
        let counter = 0;

        return {
            getCount() {
                return counter;
            },
            async fetchAndNotify(model) {
                const records = await orm.searchRead(model, [], ["name"]);
                counter += records.length;
                notification.add(`Found ${records.length} records`);
                return records;
            },
        };
    },
};

registry.category("services").add("my_service", myService);
```

### Using a Service in a Component

```javascript
import { useService } from "@web/core/utils/hooks";

class MyComponent extends Component {
    setup() {
        this.notification = useService("notification");
        this.orm = useService("orm");
        this.action = useService("action");
        this.rpc = useService("rpc");
        this.myService = useService("my_service");
    }

    async onButtonClick() {
        await this.myService.fetchAndNotify("res.partner");
    }
}
```

### Important Built-in Services

#### ORM Service
```javascript
const orm = useService("orm");

// Read
await orm.read("res.partner", [1, 2, 3], ["name", "email"]);

// Search + Read
await orm.searchRead("res.partner", [["is_company", "=", true]], ["name"], {
    limit: 10,
    offset: 0,
    order: "name",
});

// Web Search Read (includes group/length info)
await orm.webSearchRead("res.partner", domain, fields, { limit: 80 });

// Create
const id = await orm.create("res.partner", { name: "New Partner" });

// Write
await orm.write("res.partner", [id], { email: "new@email.com" });

// Unlink
await orm.unlink("res.partner", [id]);

// Call a model method
await orm.call("res.partner", "my_method", [args], { kwargs });
```

#### Action Service
```javascript
const action = useService("action");

// Execute an action by XML ID
await action.doAction("module.action_xmlid");

// Execute with additional context
await action.doAction("module.action_xmlid", {
    additionalContext: { default_field: value },
});

// Client action programmatically
await action.doAction({
    type: "ir.actions.client",
    tag: "my_client_action",
    params: { key: "value" },
});

// Open a form view
await action.doAction({
    type: "ir.actions.act_window",
    res_model: "res.partner",
    res_id: 1,
    views: [[false, "form"]],
});
```

#### Notification Service
```javascript
const notification = useService("notification");

notification.add("Simple message");
notification.add("Success!", { type: "success", sticky: false });
notification.add("Error occurred", {
    type: "danger",
    title: "Error",
    sticky: true,
    buttons: [{
        name: "Retry",
        onClick: () => { ... },
    }],
});
```

#### RPC Service
```javascript
const rpc = useService("rpc");

// For custom routes (non-model RPCs)
const result = await rpc("/my_module/my_route", { param1: "value" });
```

#### Dialog Service
```javascript
const dialog = useService("dialog");
// Used with ConfirmationDialog, etc.
```

## Hooks (Odoo-specific)

Beyond the OWL built-in hooks, Odoo provides specialized hooks:

### useService
```javascript
import { useService } from "@web/core/utils/hooks";

setup() {
    this.orm = useService("orm");
}
```

### useAutofocus
```javascript
import { useAutofocus } from "@web/core/utils/hooks";

setup() {
    this.inputRef = useAutofocus();
}
// Template: <input t-ref="autofocus"/>
```

### useBus
```javascript
import { useBus } from "@web/core/utils/hooks";

setup() {
    // Auto-cleanup on unmount
    useBus(this.env.bus, "some-event", (event) => {
        console.log("Event received:", event.detail);
    });
}
```

### usePager
```javascript
import { usePager } from "@web/search/pager_hook";

setup() {
    usePager(() => ({
        offset: this.state.offset,
        limit: this.state.limit,
        total: this.state.total,
        onUpdate: ({ offset, limit }) => {
            this.state.offset = offset;
            this.state.limit = limit;
        },
    }));
}
```

### usePosition
```javascript
import { usePosition } from "@web/core/position_hook";

setup() {
    // Position a popper element relative to a reference
    usePosition(this.props.target, {
        popper: "popoverRef",
        position: "bottom-start",
    });
}
```

### useSpellCheck
```javascript
import { useSpellCheck } from "@web/core/utils/hooks";
// Enables/disables spell check on referenced elements
```

## Patching Code

Patching modifies objects or classes in-place. It's the primary way to extend existing Odoo components without forking.

### Patching a Component (Instance Methods)

```javascript
import { patch } from "@web/core/utils/patch";
import { FormController } from "@web/views/form/form_controller";

patch(FormController.prototype, {
    setup() {
        super.setup(...arguments);
        // Your additional setup
        this.myCustomData = useState({ extra: true });
    },

    async onClickSave() {
        // Custom pre-save logic
        console.log("About to save...");
        return super.onClickSave(...arguments);
    },
});
```

### Patching Static Properties

```javascript
patch(FormController, {
    myStaticFn() { ... },
});
```

### Patching a Simple Object

```javascript
const myObject = { fn() { return 1; } };

const unpatch = patch(myObject, {
    fn() {
        return super.fn() + 1;  // returns 2
    },
});

// Remove the patch later
unpatch();
```

### Critical Rules

1. **Prototype for methods**: `patch(MyClass.prototype, { ... })` — NOT `patch(MyClass, { ... })`
2. **`super` only in methods**: Arrow functions and `function()` syntax can't use `super`
3. **Apply early**: Patches should be at the top level of your module, not at runtime
4. **Cannot patch constructors**: Use `setup()` method instead
5. **Patch returns unpatch**: Useful for testing cleanup

## Custom Field Widgets

### Method 1: From Scratch

```javascript
// my_module/static/src/fields/my_field.js
import { Component } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { standardFieldProps } from "@web/views/fields/standard_field_props";

export class MyColorField extends Component {
    static template = "my_module.MyColorField";
    static props = { ...standardFieldProps };
    static supportedTypes = ["char"];

    get color() {
        return this.props.value || "#000000";
    }

    onChange(ev) {
        this.props.update(ev.target.value);
    }
}

registry.category("fields").add("color_picker", {
    component: MyColorField,
    supportedTypes: ["char"],
});
```

```xml
<!-- my_module/static/src/fields/my_field.xml -->
<?xml version="1.0" encoding="UTF-8"?>
<templates xml:space="preserve">
    <t t-name="my_module.MyColorField">
        <div class="d-flex align-items-center gap-2">
            <input type="color"
                   t-att-value="color"
                   t-att-disabled="props.readonly"
                   t-on-change="onChange"/>
            <span t-esc="color"/>
        </div>
    </t>
</templates>
```

Usage in view XML:
```xml
<field name="color_code" widget="color_picker"/>
```

### Method 2: Extending an Existing Widget

```javascript
import { registry } from "@web/core/registry";
import { BooleanField } from "@web/views/fields/boolean/boolean_field";

class LateOrderBooleanField extends BooleanField {
    static template = "my_module.LateOrderBooleanField";
}

registry.category("fields").add("late_order_boolean", {
    component: LateOrderBooleanField,
    supportedTypes: ["boolean"],
});
```

```xml
<t t-name="my_module.LateOrderBooleanField" t-inherit="web.BooleanField">
    <xpath expr="//CheckBox" position="after">
        <span t-if="props.value" class="text-danger fw-bold ms-2">
            ⚠ Late!
        </span>
    </xpath>
</t>
```

### standardFieldProps

These are the props every field widget receives from the view:

- `value` — current field value
- `update(newValue)` — function to update the value
- `readonly` — whether the field is read-only
- `record` — the record object
- `name` — field name
- `type` — field type in the model
- `id` — unique identifier for the field

## Client Actions

Client actions occupy the full area below the navbar. They're OWL components registered in the `actions` registry.

### Basic Client Action

```javascript
// my_module/static/src/client_action/my_action.js
import { Component, useState, onWillStart } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { Layout } from "@web/search/layout";

class MyDashboard extends Component {
    static template = "my_module.MyDashboard";
    static components = { Layout };

    setup() {
        this.orm = useService("orm");
        this.action = useService("action");
        this.state = useState({ data: [], loading: true });

        onWillStart(async () => {
            this.state.data = await this.orm.searchRead(
                "res.partner", [], ["name", "email"], { limit: 50 }
            );
            this.state.loading = false;
        });
    }

    openPartner(partnerId) {
        this.action.doAction({
            type: "ir.actions.act_window",
            res_model: "res.partner",
            res_id: partnerId,
            views: [[false, "form"]],
        });
    }
}

registry.category("actions").add("my_dashboard", MyDashboard);
```

Server-side declaration:
```xml
<record id="action_my_dashboard" model="ir.actions.client">
    <field name="name">My Dashboard</field>
    <field name="tag">my_dashboard</field>
</record>

<menuitem id="menu_my_dashboard"
          name="Dashboard"
          action="action_my_dashboard"
          parent="base.menu_management"/>
```

## Custom View Type

### Extending an Existing View

```javascript
import { KanbanController } from "@web/views/kanban/kanban_controller";
import { kanbanView } from "@web/views/kanban/kanban_view";
import { registry } from "@web/core/registry";

class CustomKanbanController extends KanbanController {
    static template = "my_module.CustomKanbanView";

    setup() {
        super.setup();
        // Custom logic
    }
}

export const customKanbanView = {
    ...kanbanView,
    Controller: CustomKanbanController,
};

registry.category("views").add("custom_kanban", customKanbanView);
```

Usage in view XML:
```xml
<kanban js_class="custom_kanban">
    ...
</kanban>
```

### View Architecture (Controller-Model-Renderer)

Odoo views follow a consistent pattern:
- **Controller**: Root component, manages layout and orchestration
- **Model**: Data management (fetch, update, domain handling)
- **Renderer**: Visual output, renders records

### Creating a New View from Scratch

```javascript
// View definition object
export const beautifulView = {
    type: "beautiful",
    display_name: "Beautiful",
    icon: "fa fa-star",
    Controller: BeautifulController,
    Renderer: BeautifulRenderer,
    Model: BeautifulModel,
    ArchParser: BeautifulArchParser,
    // ... other config
};

registry.category("views").add("beautiful", beautifulView);
```

## Systray Items

```javascript
import { Component } from "@odoo/owl";
import { registry } from "@web/core/registry";

class MySystrayItem extends Component {
    static template = "my_module.MySystrayItem";

    onClick() {
        // Handle click
    }
}

registry.category("systray").add("my_module.MySystrayItem", {
    Component: MySystrayItem,
}, { sequence: 50 });
```

```xml
<t t-name="my_module.MySystrayItem">
    <li class="o_nav_entry" t-on-click="onClick">
        <i class="fa fa-bell"/>
        <span class="badge">3</span>
    </li>
</t>
```

## Translations

```javascript
import { _t } from "@web/core/l10n/translation";

// In code
const message = _t("Hello, world!");

// With interpolation
const greeting = _t("Hello, %s!", userName);
```

In templates, strings are automatically translated. For dynamic content:
```xml
<span t-esc="_t('Translatable')"/>
```

## Bus (Event System)

```javascript
// Listen to global events
this.env.bus.addEventListener("ACTION_MANAGER:UI-UPDATED", (ev) => { ... });

// Trigger events
this.env.bus.trigger("MY_EVENT", { data: "payload" });
```

## Source Documentation

- Framework Overview: https://www.odoo.com/documentation/18.0/developer/reference/frontend/framework_overview.html
- Services: https://www.odoo.com/documentation/18.0/developer/reference/frontend/services.html
- Registries: https://www.odoo.com/documentation/18.0/developer/reference/frontend/registries.html
- Hooks: https://www.odoo.com/documentation/18.0/developer/reference/frontend/hooks.html
- Patching: https://www.odoo.com/documentation/18.0/developer/reference/frontend/patching_code.html
- JS Reference: https://www.odoo.com/documentation/18.0/developer/reference/frontend/javascript_reference.html
- Customize Field: https://www.odoo.com/documentation/18.0/developer/howtos/javascript_field.html
- Customize View: https://www.odoo.com/documentation/18.0/developer/howtos/javascript_view.html
- Client Actions: https://www.odoo.com/documentation/18.0/developer/howtos/javascript_client_action.html
