---
name: Odoo Development
description: Guia de desenvolvimento, migracao e manutencao de modulos Odoo (backend) — framework generico, pais-agnostico, cobrindo Odoo 12 a 18. ORM, views, POS por era, QWeb/reporting, REST, testes e mudancas de API por versao.
phases: [P, R, E, V, C]
mode: false
---

# Skill: Odoo Development — Core backend (L1)

## Objetivo

Guiar agentes AI no desenvolvimento, migracao e manutencao de modulos **Odoo**, focando
no **framework generico** — backend (Python/ORM), views (XML), POS por era, QWeb/reporting,
REST e testes. Esta e a **camada L1**: conhecimento reutilizavel em **qualquer projeto Odoo,
qualquer pais**, cobrindo as series **12, 13, 14, 15, 16, 17 e 18**. Consolida padroes
confirmados, breaking changes por versao e fluxos de trabalho validados em producao.

### Camadas relacionadas

Esta skill nao cobre localizacao por pais nem customizacoes de uma empresa especifica.
Para esses temas, use as camadas dedicadas:

| Tema | Camada / skill | Quando |
|------|----------------|--------|
| Localizacao fiscal brasileira (l10n, NFC-e/NF-e, SEFAZ, DANFE) | **L2** `odoo-l10n-br` | Projetos Odoo no Brasil |
| Frontend (OWL, QWeb client-side, widgets, POS JS) | **L1** `frontend-specialist-odoo` | Componentes web/POS |
| Customizacao/overlay de uma empresa (grafo de deps, bridge naming, hierarquia de modulos) | **L3** overlay de empresa (skill gated por profile) | **Somente** em projetos dessa empresa |

> **Regra de camada:** mantenha esta skill livre de nomes de empresa, prefixos de modulo
> proprietarios, localizacao de pais, paths absolutos, nomes de DB e portas. Esse conteudo
> pertence as camadas L2/L3 ou ao `.context/` do projeto.

## Quando usar

- **Fase P**: Planejar migracao ou desenvolvimento de modulos Odoo
- **Fase R**: Revisar plano, validar dependencias OCA, conferir classificacoes
- **Fase E**: Implementar modulos, views, reports, logica de negocio
- **Fase V**: Code review, testes unitarios/E2E, gates de avanco
- **Fase C**: Merge request, cleanup pos-merge, atualizar handoff/napkin/memoria

## Audiencia

- `@feature-developer` — desenvolvimento de novas funcionalidades
- `@backend-specialist` — logica de negocio e integracao
- `@code-reviewer` — revisao de codigo migrado

## Grounding (fontes versionadas)

Antes de confiar nas tabelas curadas abaixo, **confirme contra a doc da versao target**:

- `mcp__docs-mcp-server__search_docs` com lib `odoo-NN` (ex.: `odoo-12`, `odoo-17`, `odoo-18`).
  Use `mcp__docs-mcp-server__find_version` para descobrir versoes indexadas.
- `odoo.com/documentation/NN.0/developer` — ORM reference + release notes por serie.
- Fonte OCA: `github.com/oca` (repos `server-tools`, `server-auth`, `OpenUpgrade`, etc.).

> Indice docs-mcp em 2026-06-17: `odoo-12`, `odoo-17`, `odoo-18` indexados.
> Series `odoo-13`/`14`/`15`/`16` **nao** indexadas — fatos exclusivos delas marcados
> "nao confirmado" precisam de `/devflow:scrape-stack-batch` antes de virar fonte de verdade.

---

## 1. Principios Fundamentais

### 1.1 Aderencia ao Framework Odoo

```
OBRIGATORIO:
- Herdar modelos via _inherit / _inherits (nunca alterar o core)
- Usar ORM do Odoo (self.env, search, create, write)
- Views via XML (QWeb, form, tree/list, kanban, search)
- Seguranca via ir.model.access.csv e ir.rule
- Dados via data/*.xml ou data/*.csv
- Manifesto via __manifest__.py
- Campos computados com @api.depends
- Constraints com @api.constrains e _sql_constraints
- Actions via ir.actions.act_window, ir.actions.server

ESTILO:
- Imports absolutos dentro de cada modulo Odoo
- PEP 8 e convencoes de estilo do Odoo
- Seguir padrao Service Layer (secao 1.3)

PROIBIDO:
- SQL direto (exceto migrations e relatorios otimizados)
- Bypass do ORM para CRUD
- Alterar o core do Odoo ou modulos de terceiros (sempre herdar/estender)
- Monkey-patching de classes base
- Dependencias externas nao declaradas no __manifest__.py
- Frontend fora do framework OWL/QWeb
```

### 1.2 Estrategia OCA-First

1. **Verificar se existe modulo OCA** em `github.com/oca`
2. **Se existe e atende**: instalar e configurar
3. **Se existe mas precisa ajuste**: criar modulo que herda e estende via `_inherit`
4. **Se nao existe**: desenvolver seguindo as convencoes OCA

```
REGRA: OCA e fonte de verdade para campos e modelos. NUNCA criar campos
customizados sem antes verificar se o framework OCA ja fornece a
funcionalidade via heranca, campos existentes ou metodos de resolucao.
```

### 1.3 Padrao Service Layer

```
Controllers (magros)
    |  Recebem HTTP, parseiam body, delegam para Service
    v
Services (logica de negocio)
    |  Validacao, regras, orquestracao
    v
Models (ORM)
    |  Persistencia, computed fields, constraints
    v
Utils (transversais)
       Seguranca, cache, serializacao, HTTP helpers
```

**Regra:** Controllers NAO devem conter logica de negocio. Toda logica fica nos Services.

### 1.4 Extensao via heranca, nao modificacao

Principio generico (independente de empresa): **estenda via `_inherit`, nunca modifique
o core do Odoo nem modulos de terceiros/OCA in-place.**

```
Modulos de terceiros (author != o seu) — manter fieis ao original:
PERMITIDO:
- Correcoes de bugs criticos para a migracao funcionar
- Adaptacoes minimas de API (ex.: super(ClassName, self) -> super())
- Ajustes de compatibilidade com a versao Odoo target
PROIBIDO:
- Adicionar campos/metodos proprietarios no modulo de terceiro
- Adicionar dependencias dos seus modulos ao manifest do terceiro
- Misturar logica proprietaria em templates/views do terceiro

Customizacao propria — sempre via heranca:
1. Criar um modulo de extensao proprio
2. Herdar modelos via _inherit
3. Adicionar campos, metodos e views no modulo de extensao
4. O modulo base permanece generico/reutilizavel
```

#### Reports / templates

```
- Modulo base define o report generico
- Sua extensao herda e estende via t-inherit + t-inherit-mode="extension"
- NUNCA misturar formatacao especifica no modulo base
```

> Em projetos que usam um overlay de empresa (ex.: bridge naming, grafo de dependencias
> proprietario), o detalhamento dessa separacao vive na camada L3 (overlay de empresa),
> nao aqui.

---

## 2. Estrutura de Modulo Padrao

```
<modulo>/
├── __init__.py
├── __manifest__.py
├── models/
│   ├── __init__.py
│   └── <modelo>.py
├── views/
│   └── <modelo>_views.xml
├── security/
│   ├── ir.model.access.csv
│   └── <modelo>_security.xml
├── data/
│   └── <dados_iniciais>.xml
├── wizards/
│   ├── __init__.py
│   └── <wizard>.py
├── report/
│   ├── __init__.py
│   ├── <report_model>.py
│   └── <template>.xml
├── static/
│   ├── src/
│   │   ├── js/
│   │   ├── xml/        # Templates OWL/QWeb
│   │   └── scss/
│   └── description/
│       └── icon.png
├── i18n/
│   └── <lang>.po
├── tests/
│   ├── __init__.py
│   └── test_<feature>.py
└── migrations/
    └── <version>/
        ├── pre-migrate.py
        └── post-migrate.py
```

---

## 3. Mudancas de API por Versao (12 -> 18)

Resumo dos principais breaking changes por salto. **O detalhamento completo, com tabelas
por salto (12->13, 13->14, ..., 17->18), esta em
[`references/orm-changes-by-version.md`](references/orm-changes-by-version.md).**
A matriz "feature -> faixa de versao" esta em
[`references/version-capability-matrix.md`](references/version-capability-matrix.md).

### 3.1 Linha do tempo de breaking changes (backend)

> Grounding por linha: confirme em `search_docs odoo-NN` / `odoo.com/documentation/NN.0/developer`.
> ⚠️ series sem indexacao docs-mcp (13/14/15/16) marcadas abaixo.

| Salto | Mudanca-chave | Notas |
|-------|---------------|-------|
| **12 -> 13** | `@api.multi`/`@api.one` removidos; metodos sao "multi" por padrao | `@api.one` ja era deprecated no 12. ⚠️ remocao no 13 nao confirmada via docs-mcp (odoo-13 nao indexado) — fonte: release notes 13.0 + OpenUpgrade |
| **13 -> 14** | `@api.model_create_multi` recomendado; bundles de assets introduzidos | ⚠️ odoo-14 nao indexado no docs-mcp |
| **14 -> 15** | `get_resource_path(module_name, ...)`; `with_company`; `subtype_xmlid`; `super()` | ⚠️ odoo-15 nao indexado |
| **15 -> 16** | OWL 1->2; assets so em bundles; `attrs` dict ainda valido | ⚠️ odoo-16 nao indexado |
| **16 -> 17** | `attrs` dict **deprecado** -> `invisible="expr"`; `name_get` -> `_compute_display_name`; ES modules obrigatorios | Confirme via `search_docs odoo-17` |
| **17 -> 18** | `attrs` **removido**; `<tree>` -> `<list>`; `search(count=True)` -> `search_count`; `type='product'` -> `type='consu'`+`is_storable`; `invalidate_cache` -> `invalidate_recordset` | Confirme via `search_docs odoo-18` |

### 3.2 Regra de Ouro — Classificacao de Customizacoes (em migracao)

Toda customizacao DEVE ser classificada:

| Classificacao | Descricao | Acao |
|---------------|-----------|------|
| **REESCRITA** | Funcionalidade reescrita para a versao target | Migrar e adaptar |
| **ABSORVIDA** | O core/OCA ja oferece nativamente | Remover e usar nativo |
| **ADAPTADA** | Funciona com ajustes menores | Ajustar API calls |
| **PRESERVADA** | Funciona como esta | Manter sem mudancas |
| **INTERNALIZADA** | Movida para modulo OCA | Referenciar OCA |
| **REMOVIDA** | Nao faz mais sentido | **PARAR e consultar usuario** |

> **Se REMOVIDA: PARAR e apresentar opcoes ao usuario. Nunca remover sem confirmacao.**

---

## 4. POS — Arquitetura JavaScript por era

> O POS muda de arquitetura de frontend a cada poucas versoes. Resumo por era; o detalhe
> de OWL/patching/templates vive na skill `frontend-specialist-odoo`.

### 4.1 Eras de frontend do POS

| Era | Versoes | Caracteristicas |
|-----|---------|-----------------|
| Backbone + widgets legados | 12, 13, 14 | `odoo.define`/`require` classico, models Backbone, `web.widget` |
| OWL 1.x hibrido | 15, 16 | OWL 1 para componentes, Backbone ainda nos models; `Registries.Component.extend()` |
| OWL 2.x, ES modules | 17 | `/** @odoo-module **/`, `patch()`, imports `@module/path` |
| OWL 3.x, sem Backbone | 18 | Models nativos OWL, `pos.load.mixin` + `_load_pos_data_fields()` |

### 4.2 Heranca de componentes (era OWL 1.x — Odoo 15/16)

```javascript
odoo.define('meu_modulo.MinhaExtensao', function (require) {
    'use strict';
    const Registries = require('point_of_sale.Registries');
    const PaymentScreen = require('point_of_sale.PaymentScreen');

    const MinhaExtensao = (Original) =>
        class extends Original {
            setup() {
                super.setup();
                // codigo customizado
            }
        };

    Registries.Component.extend(PaymentScreen, MinhaExtensao);
    return MinhaExtensao;
});
```

### 4.3 Heranca de componentes (era OWL 2/3 — Odoo 17/18)

```javascript
/** @odoo-module **/
import { patch } from "@web/core/utils/patch";
import { PaymentScreen } from "@point_of_sale/app/screens/payment_screen/payment_screen";

patch(PaymentScreen.prototype, {
    setup() {
        super.setup();
        // codigo customizado
    },
});
```

### 4.4 Heranca de templates OWL (extensao)

```xml
<?xml version="1.0" encoding="UTF-8" ?>
<templates id="template" xml:space="preserve">
    <t t-name="MeuModulo.TicketScreenExtension"
       t-inherit="point_of_sale.TicketScreen"
       t-inherit-mode="extension">
        <xpath expr="//div[hasclass('ticket-screen')]" position="inside">
            <div class="minha-extensao">...</div>
        </xpath>
    </t>
</templates>
```

> No Odoo 18 o `t-inherit` exige prefixo de modulo (`point_of_sale.TicketScreen`, nao so
> `TicketScreen`) e nao usar `owl="1"` em extensoes. Veja `frontend-specialist-odoo`.

### 4.5 Gotchas POS confirmados (genericos)

| Gotcha | Detalhes |
|--------|----------|
| `push_single_order` retorna inteiros | Retorna `[77]`, NAO objetos `{id, ...}` |
| `order.backendId` nem sempre e setado | Extrair de `syncedOrderBackendIds[0]` apos push (era OWL 1.x) |
| `_finalizeValidation` faz `showScreen()` interno | Codigo apos `super._finalizeValidation()` roda na tela ERRADA |
| `pos.order.id` != numero sequencial | `Shop/0027` pode ter id=80 — buscar por `name` |
| `_export_for_ui()`/`_order_fields()` removidos no 18 | Usar `pos.load.mixin` + `_load_pos_data_fields()` |
| `create_from_ui()` removido no POS 18 | Usar `create()`/`write()` padrao |

---

## 5. QWeb Reports e wkhtmltopdf

### 5.1 Tipos de report

| Tipo | Visualizacao | Quando usar |
|------|-------------|-------------|
| `qweb-html` | HTML no browser + PDF via "Imprimir" | Reports com preview |
| `qweb-pdf` | PDF direto sem preview | Relatorios batch |

### 5.2 Limitacoes do wkhtmltopdf (0.12.x patched Qt)

```
NAO SUPORTA:
- CSS Flexbox (display: flex)
- CSS Grid
- CSS Variables (custom properties)
- SVG inline complexo
- @media print (usa @media screen por padrao)

USAR SEMPRE:
- <table> para layout
- Inline styles ou <style> tag
- width em porcentagem ou px
- Imagens como base64 inline (--disable-local-file-access bloqueia URLs locais)
```

### 5.3 Encoding UTF-8 em reports

```xml
<!-- O div principal DEVE ter class="article" -->
<div class="article">
    <!-- conteudo do report -->
</div>
```

**Por que funciona:** `_prepare_html()` do Odoo procura `<div class="article">` para
envolver em `web.minimal_layout`, que inclui `<meta charset="utf-8">`.

### 5.4 QR codes / barcodes em reports

URLs de barcode (`/report/barcode/QR?...`) nao funcionam no wkhtmltopdf por causa de
`--disable-local-file-access`. Usar base64 inline:

```python
class MeuReport(models.AbstractModel):
    _name = "report.modulo.template"

    @api.model
    def _get_report_values(self, docids, data=None):
        barcode_png = self.env["ir.actions.report"].barcode(
            "QR", qrcode_value, width=150, height=150
        )
        return {"qrcode_base64": base64.b64encode(barcode_png).decode("ascii")}
```

```xml
<img t-if="qrcode_base64"
     t-att-src="'data:image/png;base64,' + qrcode_base64"
     style="width: 150px; height: 150px;" />
```

> `_render_qweb_pdf` mudou assinatura no 18: `report._render_qweb_pdf(report.id, [ids])`
> (report_id como 1o argumento).

---

## 6. REST / API (generico)

| Tema | Detalhes |
|------|----------|
| Stack REST por era | `base_rest` (OCA, ate ~16) -> FastAPI (`fastapi`/`fastapi_auth_jwt`, 17/18) |
| Auth JWT | OCA `auth_jwt` (server-auth). `base_rest_auth_jwt` NAO existe no 18 — migrar para `fastapi_auth_jwt` |
| Erros 500 | NAO vazar `str(e)` ao cliente — `_logger.exception()` + mensagem generica |
| `http.addons_manifest` | Removido no 18 — usar `from odoo.modules.module import get_modules` |
| Controllers magros | Toda logica nos Services (secao 1.3) |

> Grounding: `github.com/oca/rest-framework`, `github.com/oca/server-auth`;
> `search_docs odoo-18` para FastAPI no Odoo 18.

---

## 7. Testes Odoo (resumo)

Padroes de teste do framework (classes, tiers, execucao via `odoo-bin`) estao em
**[`references/testing-odoo.md`](references/testing-odoo.md)**. Resumo:

| Classe | Uso |
|--------|-----|
| `TransactionCase` | Modelos, computed, constraints, services (rollback por teste) |
| `HttpCase` | Controllers, endpoints, tours UI |

| Tier | Cobre |
|------|-------|
| T1 | Instalacao, modelos acessiveis, campos existem |
| T2 | T1 + computed fields, CRUD, metodos ORM |
| T3 | T2 + endpoints HTTP, auth flow, validators |

**Execucao:** via `odoo-bin --test-enable -u <modulo> --stop-after-init` contra o DB do
projeto. O ambiente concreto (binario, DB, container, porta) e definido no `.context/`
do projeto, **nao** nesta skill. Apos `update`, reinicie o processo Odoo (cache nem
sempre invalida sozinho).

---

## 8. Checklist Pre-Desenvolvimento Odoo

```
1. Identificar a versao Odoo target e o modulo OCA/base afetado
2. Verificar se existe modulo OCA que resolve (github.com/oca)
3. Consultar a doc da versao target (grounding: search_docs odoo-NN / odoo.com/documentation/NN.0)
4. Conferir a matriz de capacidades (references/version-capability-matrix.md) p/ a syntax correta
5. Se migracao: classificar customizacoes (Regra de Ouro, secao 3.2) e consultar
   references/orm-changes-by-version.md para o salto especifico
6. Se houver localizacao de pais: usar a camada L2 apropriada (ex.: odoo-l10n-br)
7. Definir modelos, campos, views e seguranca necessarios
8. Listar testes por tier (TDD: RED primeiro) — references/testing-odoo.md
```

---

## 9. Referencias Rapidas

### Documentacao Odoo por versao

| Versao | Developer reference |
|--------|---------------------|
| v12 | `odoo.com/documentation/12.0/developer` |
| v13 | `odoo.com/documentation/13.0/developer` |
| v14 | `odoo.com/documentation/14.0/developer` |
| v15 | `odoo.com/documentation/15.0/developer` |
| v16 | `odoo.com/documentation/16.0/developer` |
| v17 | `odoo.com/documentation/17.0/developer` |
| v18 | `odoo.com/documentation/18.0/developer` |

### Repositorios OCA

| Repositorio | Descricao |
|-------------|-----------|
| `oca/pos` | Extensoes PDV |
| `oca/rest-framework` | Framework REST (base_rest, FastAPI) |
| `oca/server-auth` | Autenticacao (auth_jwt) |
| `oca/server-tools` | Ferramentas de servidor |
| `oca/OpenUpgrade` | Scripts de migracao entre versoes |
| `oca/account-financial-tools` | Ferramentas financeiras |
| `oca/stock-logistics-workflow` | Fluxos de estoque |
| `oca/reporting-engine` | Motor de relatorios |

### Refs desta skill

| Ref | Conteudo |
|-----|----------|
| [`references/orm-changes-by-version.md`](references/orm-changes-by-version.md) | Breaking changes backend por salto, 12->18 |
| [`references/version-capability-matrix.md`](references/version-capability-matrix.md) | Feature -> faixa de versao (12 a 18) |
| [`references/testing-odoo.md`](references/testing-odoo.md) | Classes, tiers e execucao de testes |

---

## 10. Anti-Patterns Odoo (NAO Fazer)

| Anti-Pattern | Por que e ruim | O que fazer |
|--------------|---------------|-------------|
| Scripts Python standalone para testar Odoo | Bypass do framework, inconsistencias | Usar `odoo-bin shell`, unit tests ou E2E |
| Assumir `pos.order.id` == numero sequencial | `Shop/0027` pode ter id=80 | Buscar por nome: `search([('name','=','Shop/0027')])` |
| Flexbox em QWeb reports | wkhtmltopdf 0.12.x nao suporta | Usar `<table>` para todo layout |
| `report/barcode/` URL em PDF | `--disable-local-file-access` bloqueia | Base64 inline via report model |
| SQL direto para CRUD | Bypass do ORM, quebra permissoes | Usar `self.env[model].create/write/search` |
| Alterar core Odoo ou modulos de terceiros | Quebra em atualizacoes | Herdar via `_inherit` num modulo proprio |
| Report customizado no modulo base | Mistura formatacao especifica com generico | Modulo separado com t-inherit |
| `attrs={'invisible': [...]}` no Odoo 18 | Dict-syntax removida no 18 | `invisible="expression"` inline |
| `<tree>` no Odoo 18 | Tag renomeada | Usar `<list>` |
| `@api.multi` a partir do Odoo 13 | Decorador removido | Metodos sao "multi" por padrao; remover o decorador |
| `store=True` em `company_dependent` (<=14) | Conflito com `ir.property` | Remover `store=True` |
| `search(count=True)` no Odoo 18 | `count=` removido de `search()` | Usar `search_count(domain)` |
