# OWL Components Reference — Odoo 18+

## OWL Framework Fundamentals

OWL (Odoo Web Library) is the component framework used by Odoo 18+. It's a ~20kb reactive UI framework written in TypeScript, inspired by React and Vue. Current version shared across Odoo: **OWL 2.x** (see [github.com/odoo/owl](https://github.com/odoo/owl)).

Key characteristics:
- ES6 class-based components
- XML (QWeb) templates with `t-` directives
- Fine-grained reactivity via `useState`
- Hooks system (similar to React hooks)
- Asynchronous rendering with concurrent mode
- Virtual DOM under the hood

## Component Definition

### Basic Structure

```javascript
import { Component, useState } from "@odoo/owl";

export class MyComponent extends Component {
    // Template: reference to XML template name OR inline xml``
    static template = "my_module.MyComponent";

    // Sub-components used in template
    static components = { ChildComponent };

    // Props validation (enforced in dev mode)
    static props = {
        title: { type: String },
        count: { type: Number, optional: true },
        items: { type: Array },
        onUpdate: { type: Function, optional: true },
    };

    // Default prop values
    static defaultProps = {
        count: 0,
    };

    // Initialization (replaces constructor — MUST use setup, not constructor)
    setup() {
        this.state = useState({ value: 0 });
    }
}
```

### Why `setup()` Instead of Constructor

OWL components MUST use `setup()` for initialization. The constructor is handled internally by OWL and cannot be patched. The `setup()` method:
- Is called during component creation
- Has access to `this.props` and `this.env`
- Is the place to call hooks
- Can be patched by other modules

## Lifecycle

```
Component creation:
  setup()  →  willStart()  →  [render]  →  mounted()

Component update (props/state change):
  willUpdateProps()  →  willPatch()  →  [render]  →  patched()

Component destruction:
  willUnmount()  →  [destroy]
```

### Lifecycle Hooks (via owl imports)

```javascript
import { onWillStart, onMounted, onWillUnmount, onPatched, onWillPatch } from "@odoo/owl";

setup() {
    // Async work before first render (e.g., fetch data)
    onWillStart(async () => {
        this.data = await this.loadData();
    });

    // DOM is available — setup third-party libs, listeners
    onMounted(() => {
        this.observer = new ResizeObserver(...);
    });

    // Cleanup before destroy
    onWillUnmount(() => {
        this.observer.disconnect();
    });

    // After re-render due to state/props change
    onPatched(() => {
        console.log("Component re-rendered");
    });

    // Before re-render (access previous DOM state)
    onWillPatch(() => {
        this.previousScrollTop = this.el.scrollTop;
    });
}
```

## Reactivity

### useState

The core reactivity primitive. Wraps an object in a reactive proxy so OWL tracks which components depend on which properties.

```javascript
setup() {
    // Reactive state — changes trigger re-render
    this.state = useState({
        count: 0,
        items: [],
        nested: { value: "hello" },
    });
}

increment() {
    this.state.count++;  // triggers re-render
}

addItem(item) {
    this.state.items.push(item);  // array mutations are tracked
}
```

**Important**: Removing `useState` means changes won't trigger re-renders. The state object itself must be created with `useState` — you can't retroactively make an object reactive.

### Reactive Props

Props are automatically reactive. When a parent re-renders with new props, the child re-renders.

## Templates (QWeb)

### Core Directives

```xml
<!-- Output (escaped) -->
<span t-esc="state.count"/>

<!-- Output (unescaped HTML — use for trusted content only) -->
<div t-out="props.htmlContent"/>

<!-- Conditionals -->
<div t-if="state.isActive">Active</div>
<div t-elif="state.isPending">Pending</div>
<div t-else="">Inactive</div>

<!-- Loops (t-key is REQUIRED) -->
<ul>
    <li t-foreach="state.items" t-as="item" t-key="item.id">
        <span t-esc="item.name"/>
        <!-- Available variables: item_index, item_first, item_last, item_value -->
    </li>
</ul>

<!-- Dynamic attributes -->
<div t-att-class="state.isActive ? 'active' : 'inactive'"/>
<input t-att-value="state.inputValue"/>

<!-- Combined static + dynamic class -->
<div class="base-class" t-att-class="{ 'highlighted': state.isHighlighted }"/>

<!-- Event handling -->
<button t-on-click="onButtonClick">Click</button>
<button t-on-click="() => state.count++">Inline</button>
<input t-on-input="onInput" t-on-keydown="onKeyDown"/>

<!-- Refs (access DOM elements) -->
<input t-ref="myInput"/>
<!-- In setup(): const inputRef = useRef("myInput"); -->
<!-- Access: inputRef.el -->

<!-- Slots -->
<t t-slot="default"/>
<t t-slot="header" fallback="'Default Header'"/>

<!-- Sub-components -->
<ChildComponent title="'Hello'" count="state.count"/>

<!-- Dynamic component -->
<t t-component="dynamicComponentClass" t-props="dynamicProps"/>

<!-- Translation -->
<span t-esc="_t('Translatable string')"/>
```

### Template Inheritance

Odoo templates can inherit from other templates using `t-inherit` with XPath:

```xml
<?xml version="1.0" encoding="UTF-8" ?>
<templates xml:space="preserve">
    <!-- Inheriting and extending an existing template -->
    <t t-name="my_module.CustomBooleanField" t-inherit="web.BooleanField">
        <xpath expr="//CheckBox" position="after">
            <span t-if="props.value" class="text-danger">Late!</span>
        </xpath>
    </t>
</templates>
```

XPath positions: `before`, `after`, `inside`, `replace`, `attributes`.

### Inline Templates vs File Templates

```javascript
// Inline (for small components, prototyping)
import { xml } from "@odoo/owl";
static template = xml`<div>Hello <t t-esc="props.name"/></div>`;

// File-based (production — recommended)
static template = "my_module.MyComponent";
// Corresponding XML file must be in asset bundle
```

## Props System

### Validation Types

```javascript
static props = {
    name: String,                              // required string
    count: { type: Number, optional: true },   // optional number
    items: { type: Array },                    // required array
    config: { type: Object },                  // required object
    isActive: Boolean,                         // required boolean
    callback: Function,                        // required function
    node: { type: Element, optional: true },   // DOM element
    data: { type: [String, Number] },          // union type
    style: { validate: (s) => ["a","b"].includes(s) }, // custom validation
    "*": true,                                 // allow any additional props
};
```

### Passing Props in Templates

```xml
<!-- String literal (note: quotes inside quotes) -->
<Child title="'Hello World'"/>

<!-- Expression -->
<Child count="state.count" isActive="state.count > 0"/>

<!-- Event handler -->
<Child onUpdate.bind="handleUpdate"/>

<!-- Spread all props -->
<Child t-props="childProps"/>
```

## Hooks

### Built-in OWL Hooks

```javascript
import {
    useState,        // reactive state
    useRef,          // DOM element reference
    useEffect,       // side effects on reactive deps
    useExternalListener,  // auto-cleanup event listeners
    useComponent,    // access current component instance
    useEnv,          // access environment
    useSubEnv,       // create sub-environment
} from "@odoo/owl";
```

### useRef

```javascript
setup() {
    this.inputRef = useRef("myInput");
    onMounted(() => {
        this.inputRef.el.focus();  // .el gives the DOM element
    });
}
```

### useEffect

```javascript
setup() {
    this.state = useState({ searchTerm: "" });

    useEffect(
        () => {
            // Runs when dependencies change
            this.search(this.state.searchTerm);
            return () => {
                // Cleanup (optional)
            };
        },
        () => [this.state.searchTerm]  // dependencies
    );
}
```

### useExternalListener

```javascript
setup() {
    // Automatically removed on unmount
    useExternalListener(window, "resize", this.onResize.bind(this));
}
```

## Sub-Components

```javascript
import { ChildA } from "./child_a";
import { ChildB } from "./child_b";

class Parent extends Component {
    static template = "my_module.Parent";
    static components = { ChildA, ChildB };
}
```

```xml
<t t-name="my_module.Parent">
    <div>
        <ChildA title="'Section A'" items="state.items"/>
        <ChildB t-if="state.showB"/>
    </div>
</t>
```

### Dynamic Sub-Components

```xml
<t t-component="getComponentClass()" t-props="getComponentProps()"/>
```

## Slots

```xml
<!-- Parent usage -->
<Card>
    <t t-set-slot="header">
        <h3>Custom Header</h3>
    </t>
    <p>Default slot content</p>
    <t t-set-slot="footer">
        <button>Save</button>
    </t>
</Card>

<!-- Card component template -->
<div class="card">
    <div class="card-header">
        <t t-slot="header"/>
    </div>
    <div class="card-body">
        <t t-slot="default"/>
    </div>
    <div class="card-footer">
        <t t-slot="footer"/>
    </div>
</div>
```

## Odoo Built-in OWL Components

These are reusable components available from the `@web` module:

| Component | Import | Use |
|---|---|---|
| `Dropdown` | `@web/core/dropdown/dropdown` | Dropdown menus |
| `DropdownItem` | `@web/core/dropdown/dropdown_item` | Items inside dropdowns |
| `Notebook` | `@web/core/notebook/notebook` | Tabbed interface |
| `Pager` | `@web/core/pager/pager` | Pagination control |
| `CheckBox` | `@web/core/checkbox/checkbox` | Styled checkbox |
| `ColorList` | `@web/core/colorlist/colorlist` | Color picker |
| `SelectMenu` | `@web/core/select_menu/select_menu` | Select dropdown |
| `TagsList` | `@web/core/tags_list/tags_list` | Tag display list |
| `ActionSwiper` | `@web/core/action_swiper/action_swiper` | Mobile swipe actions |

### Example: Using Dropdown

```javascript
import { Dropdown } from "@web/core/dropdown/dropdown";
import { DropdownItem } from "@web/core/dropdown/dropdown_item";

class MyMenu extends Component {
    static template = "my_module.MyMenu";
    static components = { Dropdown, DropdownItem };
}
```

```xml
<Dropdown>
    <button class="btn btn-primary">Menu</button>
    <t t-set-slot="content">
        <DropdownItem onSelected="() => this.onSelect('a')">Option A</DropdownItem>
        <DropdownItem onSelected="() => this.onSelect('b')">Option B</DropdownItem>
    </t>
</Dropdown>
```

## Environment

Every component has access to `this.env`, which contains:
- `this.env.services` — all registered services
- `this.env.bus` — main application event bus
- `this.env.debug` — debug mode flag
- `this.env.isSmall` — responsive breakpoint flag
- `this.env.config` — action configuration

## Error Handling

```javascript
import { Component } from "@odoo/owl";

class ErrorBoundary extends Component {
    static template = xml`
        <t t-if="state.error">
            <div class="alert alert-danger">Something went wrong</div>
        </t>
        <t t-else="">
            <t t-slot="default"/>
        </t>
    `;

    setup() {
        this.state = useState({ error: false });
        onError((error) => {
            this.state.error = true;
            console.error(error);
        });
    }
}
```

## Portal

Render content in a different part of the DOM:

```xml
<div>
    <p>This is inside the component</p>
    <t t-portal="'body'">
        <div class="modal">This is rendered in document.body</div>
    </t>
</div>
```

## Source Documentation

- OWL Framework: https://github.com/odoo/owl
- Odoo OWL Components: https://www.odoo.com/documentation/18.0/developer/reference/frontend/owl_components.html
- OWL Tutorial: https://www.odoo.com/documentation/18.0/developer/tutorials/discover_js_framework/01_owl_components.html
