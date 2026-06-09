# Odoo 18 Module Structure & Assets Reference

## Module File Structure

```
my_module/
├── __manifest__.py              # Module metadata + asset bundle declarations
├── __init__.py                  # Python imports
├── models/                      # Python models
│   ├── __init__.py
│   └── my_model.py
├── views/                       # Server-side views (XML)
│   ├── my_model_views.xml       # Form/tree/kanban view architectures
│   ├── menu.xml                 # Menu items and actions
│   └── templates.xml            # Website/portal templates (owl-component tags)
├── security/
│   └── ir.model.access.csv
├── data/
│   └── data.xml
├── static/                      # Frontend assets (JS, CSS, XML templates)
│   └── src/
│       ├── components/          # Reusable OWL components
│       │   ├── my_component.js
│       │   ├── my_component.xml
│       │   └── my_component.scss
│       ├── fields/              # Custom field widgets
│       │   ├── my_field.js
│       │   └── my_field.xml
│       ├── views/               # Custom view types or extensions
│       │   ├── custom_kanban.js
│       │   └── custom_kanban.xml
│       ├── client_actions/      # Client actions
│       │   ├── dashboard.js
│       │   └── dashboard.xml
│       ├── services/            # Custom services
│       │   └── my_service.js
│       └── scss/                # Stylesheets
│           └── style.scss
└── i18n/                        # Translations
    └── pt_BR.po
```

## Asset Bundles

Odoo organizes frontend assets into bundles. Each bundle is a collection of JS, CSS, and XML template files that are loaded together.

### Key Bundles

| Bundle | When Loaded | Use For |
|---|---|---|
| `web.assets_backend` | Web client (backend) | Most custom components, field widgets, views, services |
| `web.assets_frontend` | Portal and website | Public-facing OWL components |
| `web._assets_core` | Core framework | Never add to this directly |
| `web.assets_common` | Both backend + frontend | Shared utilities |
| `point_of_sale._assets_pos` | Point of Sale | POS customizations |

### Declaring Assets in __manifest__.py

```python
{
    'name': 'My Module',
    'version': '18.0.1.0.0',
    'depends': ['web'],
    'assets': {
        # Backend: web client components, widgets, services
        'web.assets_backend': [
            # Glob pattern — includes all files recursively
            'my_module/static/src/**/*',
        ],

        # OR more granular control:
        'web.assets_backend': [
            # Specific files
            'my_module/static/src/components/my_component.js',
            'my_module/static/src/components/my_component.xml',
            'my_module/static/src/components/my_component.scss',

            # Directory glob
            'my_module/static/src/fields/**/*',

            # Include another bundle
            ('include', 'my_module.my_custom_bundle'),

            # Remove a file from the bundle (useful for overrides)
            ('remove', 'web/static/src/some_file.js'),

            # Insert before a specific file
            ('before', 'web/static/src/target.js', 'my_module/static/src/override.js'),

            # Insert after a specific file
            ('after', 'web/static/src/target.js', 'my_module/static/src/addition.js'),

            # Replace a file
            ('replace', 'web/static/src/old.js', 'my_module/static/src/new.js'),
        ],

        # Frontend: portal/website components
        'web.assets_frontend': [
            'my_module/static/src/portal_component/**/*',
        ],
    },
}
```

### Important Notes on Assets

1. **Glob patterns** (`**/*`) include `.js`, `.xml`, `.scss`, `.css` files automatically.
2. **File ordering matters**: Files are loaded in the order they appear. Dependencies must come first.
3. **After changing assets**: You must **restart the server** AND **upgrade the module** for changes to take effect.
4. **Debug mode**: Use `?debug=assets` in URL to load unminified files for debugging.
5. **XML templates** in `static/src/` are QWeb templates for OWL components — NOT server-side views.

## JavaScript Module System

Odoo uses its own module system that extends ES modules. Files in asset bundles are automatically wrapped.

### Importing Odoo Modules

```javascript
// Core framework
import { Component, useState, xml } from "@odoo/owl";

// Odoo web modules (anything in web/static/src/)
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { memoize } from "@web/core/utils/functions";
import { KeepLast } from "@web/core/utils/concurrency";

// View-related
import { standardFieldProps } from "@web/views/fields/standard_field_props";
import { FormController } from "@web/views/form/form_controller";
import { KanbanController } from "@web/views/kanban/kanban_controller";
import { kanbanView } from "@web/views/kanban/kanban_view";
import { Layout } from "@web/search/layout";

// Other modules (replace @web with @module_name)
import { SomeComponent } from "@sale/components/some_component";
```

### Module Path Convention

The `@web` prefix maps to `web/static/src/`. For other modules:
- `@sale` → `sale/static/src/`
- `@stock` → `stock/static/src/`
- `@my_module` → `my_module/static/src/`

### Exporting

```javascript
// Named export (preferred)
export class MyComponent extends Component { ... }
export function myUtil() { ... }

// Components registered in registries don't need explicit exports
// unless other modules need to import and extend them
```

## QWeb XML Template Files

### Template File Structure

```xml
<?xml version="1.0" encoding="UTF-8"?>
<templates xml:space="preserve">

    <!-- Component template -->
    <t t-name="my_module.MyComponent">
        <div class="o_my_component">
            <span t-esc="props.title"/>
        </div>
    </t>

    <!-- Another template in the same file -->
    <t t-name="my_module.AnotherComponent">
        <div>...</div>
    </t>

    <!-- Template inheritance -->
    <t t-name="my_module.ExtendedForm" t-inherit="web.FormView">
        <xpath expr="//div[@class='o_form_statusbar']" position="after">
            <div class="o_custom_banner">Custom Banner</div>
        </xpath>
    </t>

</templates>
```

### Naming Convention

Template names follow: `module_name.ComponentName`

This MUST match the `static template` property in the component class:
```javascript
class MyComponent extends Component {
    static template = "my_module.MyComponent";  // matches t-name
}
```

## OWL Components on Portal/Website

To use OWL on public-facing pages (portal/website):

### 1. Register in public_components registry

```javascript
// my_module/static/src/portal_component/my_component.js
import { Component } from "@odoo/owl";
import { registry } from "@web/core/registry";

class MyPortalWidget extends Component {
    static template = "my_module.MyPortalWidget";
    static props = {};
}

registry.category("public_components").add(
    "my_module.MyPortalWidget",
    MyPortalWidget
);
```

### 2. Add to web.assets_frontend bundle

```python
'assets': {
    'web.assets_frontend': [
        'my_module/static/src/portal_component/**/*',
    ],
}
```

### 3. Add owl-component tag in server template

```xml
<template id="my_module.portal_page" inherit_id="portal.portal_my_home">
    <xpath expr="//*[hasclass('o_portal_my_home')]" position="before">
        <owl-component name="my_module.MyPortalWidget"/>
    </xpath>
</template>
```

**Caution**: Portal OWL components cause layout shift — the page renders server-side first, then OWL mounts. Only use when strong interactivity is needed.

## Standalone OWL Application

For completely custom pages outside the web client:

### 1. Root Component

```javascript
// my_module/static/src/standalone_app/root.js
import { Component } from "@odoo/owl";

export class Root extends Component {
    static template = "my_module.Root";
    static props = {};
}
```

### 2. App Setup

```javascript
// my_module/static/src/standalone_app/app.js
import { mountComponent } from "@web/env";
import { Root } from "./root";

mountComponent(Root, document.body);
```

### 3. Custom Asset Bundle

```python
'assets': {
    'my_module.assets_standalone_app': [
        ('include', 'web._assets_helpers'),
        'web/static/src/scss/pre_variables.scss',
        'web/static/lib/bootstrap/scss/_variables.scss',
        ('include', 'web._assets_bootstrap'),
        ('include', 'web._assets_core'),
        'my_module/static/src/standalone_app/**/*',
    ],
}
```

### 4. Controller

```python
from odoo.http import request, route, Controller

class MyController(Controller):
    @route("/my_module/standalone_app", auth="public")
    def standalone_app(self):
        return request.render(
            'my_module.standalone_app',
            {'session_info': request.env['ir.http'].get_frontend_session_info()},
        )
```

## SCSS/CSS Best Practices

### SCSS in Odoo

```scss
// Use Odoo/Bootstrap variables
.o_my_component {
    color: $o-main-text-color;
    background: $o-view-background-color;
    border: 1px solid $border-color;
    padding: $spacer;

    &__header {
        font-size: $font-size-lg;
        font-weight: $font-weight-bold;
    }

    &--active {
        background: $o-action;
        color: white;
    }
}
```

### CSS Class Conventions

- Odoo components use `o_` prefix: `o_my_component`, `o_kanban_view`
- BEM-like naming within components: `o_my_component__header`
- Use Bootstrap utility classes when possible
- Avoid global styles — scope within your component's root class

## Debugging Tips

1. **Debug mode with assets**: `?debug=assets` — unminified JS, sourcemaps
2. **OWL DevTools**: Browser extension for component tree inspection
3. **Browser DevTools**: Network tab shows loaded bundles
4. **Console**: `odoo.__DEBUG__` provides access to internal state
5. **Template errors**: Check browser console for QWeb rendering errors
6. **Asset not loading**: Verify `__manifest__.py` `assets` section, restart server, upgrade module

## Source Documentation

- Assets: https://www.odoo.com/documentation/18.0/developer/reference/frontend/assets.html
- JS Modules: https://www.odoo.com/documentation/18.0/developer/reference/frontend/javascript_modules.html
- Framework Overview: https://www.odoo.com/documentation/18.0/developer/reference/frontend/framework_overview.html
- Portal OWL: https://www.odoo.com/documentation/18.0/developer/howtos/frontend_owl_components.html
- Standalone OWL: https://www.odoo.com/documentation/18.0/developer/howtos/standalone_owl_application.html
