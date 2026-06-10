---
id: std-odoo-owl-patterns
description: Componentes OWL idiomáticos (Odoo 18) — setup() em vez de constructor() e extensão de core por patch(), não herança
version: 1.1.0
source: devflow-default-odoo
applyTo: ["**/static/src/**/*.js"]
activation: on-demand
relatedAdrs: []
enforcement:
  linter: machine/std-odoo-owl-patterns.js
---
## Princípios

- A inicialização de um componente OWL vai em `setup()`, não no `constructor()`: o `setup` é chamado pelo framework com `props` e `env` já injetados e é o ponto onde se registram os lifecycle hooks; o `constructor` da classe é detalhe interno do OWL e sobrescrevê-lo arrisca quebrar o contrato de construção
- O ciclo de vida é declarado por hooks dentro de `setup()` — `onWillStart` (carga assíncrona antes do primeiro render), `onMounted` (após inserção no DOM), `onWillUnmount` (antes da remoção) — e não por métodos sobrescritos na classe
- O template do componente é referenciado por `static template = "addon.Nome"`, sempre com o prefixo do addon, para casar com o `t-name` registrado no bundle de assets e evitar colisão de nomes entre módulos
- Para estender um componente do core, use `patch()` sobre o protótipo, não herança de classe (`extends`): a herança cria uma classe nova que não substitui a registrada, enquanto o `patch` altera o componente que o Odoo realmente instancia
- Ao patchear um método, chame o original via `super.method(...)` usando method-notation (`method() { ... super.method() ... }`) — a sintaxe `function () {}` ou arrow não liga o `super` ao protótipo patcheado e perde a cadeia
- Services são registrados em `registry.category("services").add("name", def)` e consumidos dentro de `setup()` via `useService("name")`, mantendo a injeção de dependência do framework em vez de imports diretos de singletons

## Anti-patterns

| Errado | Corrija para |
|---|---|
| `class W extends Component { constructor() { super(...arguments); this.x = 1; } }` | `class W extends Component { setup() { this.x = 1; } }` |
| `class MyDialog extends Dialog { ... }` (estender core por herança) | `patch(Dialog.prototype, { ... })` |
| `patch(X.prototype, { foo: function () { ... } })` | `patch(X.prototype, { foo() { ...; super.foo(); } })` |
| Patchear `constructor` de um componente do core | Patchear `setup` (ponto de extensão idiomático) |
| Lógica de boot em `constructor()` / `mounted()` sobrescrito | `setup(){ onWillStart(...); onMounted(...); }` |
| `static template = "Nome"` (sem prefixo de addon) | `static template = "addon.Nome"` |

GOOD — componente OWL idiomático:

```js
/** @odoo-module **/
import { Component, onWillStart } from "@odoo/owl";
class MyWidget extends Component {
    static template = "my_addon.MyWidget";
    setup() {
        onWillStart(async () => { /* carga assíncrona */ });
    }
}
```

GOOD — estender o core por patch com `super` em method-notation:

```js
/** @odoo-module **/
import { patch } from "@web/core/utils/patch";
import { Dialog } from "@web/core/dialog/dialog";
patch(Dialog.prototype, {
    setup() {
        super.setup();
        /* extensão */
    },
});
```

## Linter

`machine/std-odoo-owl-patterns.js` — gate por extensão (só processa `.js`; demais arquivos saem com exit 0). Check estático:

1. **`constructor()` em componente OWL** (estático) — flag quando o arquivo contém `extends Component` E `constructor(`. Heurística simples e de baixo falso-positivo: a presença de ambos indica um componente OWL inicializando no construtor em vez de `setup()`. Um `constructor(` em arquivo sem `extends Component` (ex. um service, um helper) NÃO é flagado.

Em **human-review** (não lintável, fica só nesta prosa):

2. Estender o core via `patch()` e não por herança de classe — distinguir uma subclasse legítima de uma tentativa de override do componente registrado exige contexto do registry.
3. Chamar o original com `super.method()` em method-notation (não `function () {}` nem arrow) — verificar o binding do `super` depende de análise sintática do corpo do patch.
4. Nunca patchear `constructor`; patchear `setup` — identificar o alvo do patch exige resolver o argumento de `patch()`.
5. `static template = "addon.Nome"` com prefixo de addon — validar o prefixo correto depende do nome do módulo e do `t-name` registrado nos assets.
6. Lifecycle via hooks (`onWillStart`/`onMounted`/`onWillUnmount`) dentro de `setup()` — distinguir um hook de um método homônimo exige contexto semântico.
7. Service via `registry.category("services").add(...)` e consumo por `useService("name")` — validar o par registro/consumo exige rastrear o `name` entre arquivos.

**Gate de série-alvo (desde v1.1.0):** OWL é Odoo **16+**. O linter lê a série do `version` no `__manifest__.py` mais próximo e se auto-suprime (exit 0) quando a série é **< 16** — em módulos `≤15` o frontend era Backbone/widget, sem componentes OWL. Sem manifest, roda normalmente.

## Referência

- Odoo 18 — OWL Components (frontend reference): https://www.odoo.com/documentation/18.0/developer/reference/frontend/owl_components.html
- Odoo 18 — Patching code (frontend reference): https://www.odoo.com/documentation/18.0/developer/reference/frontend/patching_code.html
