---
name: Odoo Development
description: Comprehensive guide for AI agents developing, migrating, and maintaining NXZ Odoo modules with Brazilian localization
phases: [P, R, E, V, C]
mode: false
---

# Skill: Odoo Development — NXZ ERP

## Objetivo

Guiar agentes AI no desenvolvimento, migracao e manutencao de modulos Odoo para o NXZ ERP, com foco em localizacao brasileira (OCA l10n-brazil), POS (Ponto de Venda) e integracao fiscal (NFC-e/NF-e). Consolida padroes confirmados, gotchas documentados e fluxos de trabalho validados em producao.

## Quando usar

- **Fase P**: Planejar migracao ou desenvolvimento de modulos Odoo
- **Fase R**: Revisar plano, validar dependencias OCA, conferir classificacoes
- **Fase E**: Implementar modulos, views, reports, JS frontend
- **Fase V**: Code review obrigatorio, testes unitarios/E2E, gates de avanco
- **Fase C**: Merge request, cleanup pos-merge, atualizar handoff/napkin/MEMORY

## Audiencia

- `@feature-developer` — desenvolvimento de novas funcionalidades
- `@backend-specialist` — logica de negocio e integracao
- `@code-reviewer` — revisao de codigo migrado

---

## 1. Principios Fundamentais

### 1.1 Aderencia ao Framework Odoo

```
OBRIGATORIO:
- Herdar modelos via _inherit / _inherits
- Usar ORM do Odoo (self.env, search, create, write)
- Views via XML (QWeb, form, tree, kanban, search)
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
- Alterar core do Odoo (sempre herdar/estender)
- Monkey-patching de classes base
- Dependencias externas nao declaradas no __manifest__.py
- Frontend fora do framework OWL/QWeb
```

### 1.2 Estrategia OCA-First

1. **Verificar se existe modulo OCA** em `https://github.com/oca`
2. **Se existe e atende**: instalar e configurar
3. **Se existe mas precisa ajuste**: criar modulo bridge NXZ que herda e estende
4. **Se nao existe**: desenvolver como modulo NXZ seguindo convencoes OCA

```
REGRA: OCA e fonte de verdade para campos e modelos. NUNCA criar campos
customizados sem antes verificar se o framework OCA ja fornece a
funcionalidade via heranca, campos existentes ou metodos de resolucao.
Priorizar: pos.config (especifico) → fiscal.operation → res.company (generico).

Referencia OCA: ~/Documentos/code/testes/nxz_erp_15/addons/l10n-brazil/
```

### 1.3 Padrao Service Layer

```
Controllers (magros)
    |  Recebem HTTP, parsam body, delegam para Service
    v
Services (logica de negocio)
    |  Validacao, regras, orquestracao — estendem base_rest.service do OCA
    v
Models (ORM)
    |  Persistencia, computed fields, constraints
    v
Utils (transversais)
       Seguranca, cache, serializacao, HTTP helpers (nxz_utils)
```

**Regra:** Controllers NAO devem conter logica de negocio. Toda logica fica nos Services.

### 1.4 Convencoes de Nomenclatura

```
Modulos NXZ:     nxz_<dominio>_<funcionalidade>
                 Exemplo: nxz_pos_combo, nxz_fiscal_nfce

Modulos Bridge:  nxz_<modulo_oca>_bridge
                 Exemplo: nxz_l10n_br_fiscal_bridge

Modelos:         nxz.<dominio>.<entidade>
                 Exemplo: nxz.delivery.order

Views:           nxz_<modelo>_view_<tipo>.xml
                 Exemplo: nxz_delivery_order_view_form.xml
```

### 1.5 Separacao Arquitetural OCA vs NXZ (OBRIGATORIO)

```
REGRA BLOQUEANTE: A separacao entre modulos OCA/terceiros e modulos NXZ
e OBRIGATORIA. Violacoes devem ser corrigidas ANTES de novas features.
```

#### Modulos terceiros (author != "Nexuz")

Modulos de terceiros (OCA, KMEE, etc.) DEVEM ser mantidos o mais fiel
possivel a versao original da migracao:

```
PERMITIDO:
- Correcoes de bugs criticos para a migracao funcionar
- Adaptacoes minimas de API (ex: super(ClassName, self) → super())
- Ajustes de compatibilidade com versao Odoo target

PROIBIDO:
- Adicionar campos exclusivos Nexuz
- Adicionar metodos de negocio Nexuz
- Modificar templates/views com logica proprietaria
- Adicionar dependencias de modulos NXZ
```

#### Modulos NXZ (author = "Nexuz")

Modulos NXZ NAO devem implementar funcionalidades exclusivas diretamente.
Toda funcionalidade Nexuz-especifica deve ser implementada via heranca:

```
PADRAO CORRETO:
1. Criar modulo bridge/overlay: nxz_<modulo_base>
2. Herdar modelos via _inherit
3. Adicionar campos, metodos e views no modulo bridge
4. O modulo base permanece generico/reutilizavel

EXEMPLO:
- l10n_br_pos (OCA) → manter fiel ao original
- nxz_l10n_br_pos (bridge) → customizacoes Nexuz via _inherit
  - Campos: nfce_document_serie_id, SAT settings
  - Metodos: _order_fields() override, fiscal map
  - Views: extensoes de pos.config form
```

#### Regra para Reports/Templates

```
PADRAO CORRETO:
- Modulo base define report generico
- Modulo NXZ herda e estende template via t-inherit + t-inherit-mode="extension"
- NUNCA misturar formatacao Nexuz (ex: 57mm/80mm) no modulo base

EXEMPLO:
- nxz_l10n_br_nfe (base): report NF-e padrao
- nxz_l10n_br_nfe_danfe (bridge): DANFE NFC-e 57mm/80mm customizado
```

#### Checklist de Validacao (usar em code review)

```
[ ] Modulo terceiro nao tem campos com prefixo nxz_?
[ ] Modulo terceiro nao importa/depende de modulos nxz_*?
[ ] Funcionalidades Nexuz estao em modulo bridge separado?
[ ] Reports customizados usam heranca (t-inherit), nao substituicao?
[ ] Manifest do modulo terceiro nao lista nxz_* em depends?
```

> **Se uma violacao for encontrada em code review: BLOQUEAR ate refatorar.**

---

## 2. Arquitetura NXZ ERP

### 2.1 Camadas do Sistema

```
Clientes (Mobile, Web, Kiosk PDV)
    |  HTTP/HTTPS (REST JSON + JWT)
    v
Odoo Core (werkzeug + ORM)
    |
OCA Community (19 repos: rest-framework, server-auth, l10n-brazil, pos, queue...)
    |
Middleware Nexuz (nxz_auth_jwt)
    |
Controllers (nxz_rest_base, nxz_rest_pos, nxz_rest_system...)
    |
Service Layer (CRUDService, POSService, NFCeService...)
    |
Models ORM (res.partner, pos.order, product.template, l10n_br_*...)
    |
PostgreSQL
```

### 2.2 Grafo de Dependencias NXZ

```
nxz_utils (independente)
nxz_auth_jwt         <-- estende OCA auth_jwt
nxz_partner          <-- estende OCA l10n-brazil
nxz_rest_base        <-- estende OCA base_rest
    |-- nxz_rest_pos
    |       |-- nxz_rest_pos_nfce
    |       |-- nxz_rest_pos_whitelabel
    |-- nxz_rest_system
    |-- nxz_rest_endpoint
nxz_l10n_br_nfe      <-- estende OCA l10n-brazil
nxz_pos_product_company
nxz_mrp
nxz_autovacuum
```

**Regra:** Modulos Nexuz NUNCA modificam repos OCA diretamente. Toda customizacao via `_inherit`.

### 2.3 Ordem de Instalacao

```
1. nxz_utils (sem dependencias NXZ)
2. nxz_auth_jwt (depende nxz_utils + OCA auth_jwt)
3. nxz_rest_base (depende nxz_utils + nxz_auth_jwt + OCA base_rest)
4. nxz_partner, nxz_l10n_br_nfe (dependem OCA l10n-brazil)
5. nxz_rest_pos, nxz_rest_system, etc. (dependem nxz_rest_base)
```

---

## 3. Estrutura de Modulo Padrao

```
nxz_<modulo>/
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
│   └── pt_BR.po
├── tests/
│   ├── __init__.py
│   └── test_<feature>.py
└── migrations/
    └── <version>/
        ├── pre-migrate.py
        └── post-migrate.py
```

---

## 4. Padroes de Migracao Odoo 14 -> 15

### 4.1 Mudancas de API Confirmadas

| Padrao Odoo 14 | Padrao Odoo 15 | Notas |
|----------------|----------------|-------|
| `get_resource_path(module_path, resource)` | `get_resource_path(module_name, resource)` | Primeiro arg e nome do modulo, nao path |
| `mrp.product.produce` wizard | `qty_producing` + `quantity_done` | Wizard removido no 15 |
| `message_post(subtype=)` | `message_post(subtype_xmlid=)` | Parametro renomeado |
| `super(ClassName, self)` | `super()` | Python 3 simplified super |
| `force_company` | `with_company(company)` | Contexto de empresa |
| `store=True` em `company_dependent` | Remover `store=True` | Conflito com ir.property |
| `invisible="not field"` | `attrs={'invisible': [('field', '=', False)]}` | Syntax Odoo 17+ nao funciona no 15 |
| `ir.model.fields._get_id()` | `self.env['ir.model.fields'].search([...])` | Metodo removido no 15 |

### 4.2 Regra de Ouro — Classificacao de Customizacoes

Toda customizacao NXZ DEVE ser classificada:

| Classificacao | Descricao | Acao |
|---------------|-----------|------|
| **REESCRITA** | Funcionalidade reescrita para Odoo 15 | Migrar e adaptar |
| **ABSORVIDA** | Odoo 15 ou OCA ja oferece nativamente | Remover e usar nativo |
| **ADAPTADA** | Funciona com ajustes menores | Ajustar API calls |
| **PRESERVADA** | Funciona como esta | Manter sem mudancas |
| **INTERNALIZADA** | Movida para modulo OCA | Referenciar OCA |
| **REMOVIDA** | Nao faz mais sentido | **PARAR e consultar usuario** |

> **Se REMOVIDA: PARAR e apresentar opcoes ao usuario. Nunca remover sem confirmacao.**

### 4.3 Modulos que NAO existem no OCA 15.0+

| Modulo | Status | Acao |
|--------|--------|------|
| `l10n_br_pos` | Nao existe no OCA 15+ | Migrar manualmente |
| `l10n_br_pos_nfce` | Nao existe no OCA 15+ | Migrar manualmente |
| `auth_jwt` | Pulou 15 (14→16) | Migrar manualmente |

## 5. Mudancas-Chave por Versao (15 → 16 → 17 → 18)

> Resumo dos breaking changes em cada salto. Sera expandido conforme o projeto avanca.

### 5.1 Odoo 15 → 16

| Area | Mudanca | Exemplo |
|------|---------|---------|
| **Frontend** | OWL 1.x → OWL 2.x | `setup()` mantido, lifecycle hooks renomeados |
| **JS imports** | `require()` ainda funciona, `@module/path` introduzido | `const { useService } = require("@web/core/utils/hooks")` |
| **POS** | Registries mantido, componentes agora OWL 2 | `Registries.Component.extend()` ainda funciona |
| **Views** | `attrs` dict ainda funciona | `attrs={'invisible': [...]}` OK |
| **Python** | `auth_jwt` OCA disponivel novamente | Portado direto de 14 → 16 |
| **Fiscal BR** | `l10n_br_pos` e `l10n_br_pos_nfce` continuam ausentes no OCA | Manter modulos NXZ |

### 5.2 Odoo 16 → 17

| Area | Mudanca | Exemplo |
|------|---------|---------|
| **Views** | `attrs` dict **DEPRECADO** | `attrs={'invisible': [...]}` → `invisible="field == False"` |
| **Frontend** | ES modules obrigatorios, `odoo.define()` deprecado | `/** @odoo-module **/` no topo do arquivo |
| **POS** | Reescrita significativa da arquitetura | Novos componentes, novo lifecycle |
| **Python** | `fields.Monetary` exige `currency_field` explicito | Sempre declarar `currency_field='currency_id'` |
| **Seguranca** | `ir.rule` com `domain_force` mais restritivo | Testar regras de acesso apos migracao |

### 5.3 Odoo 17 → 18

| Area | Mudanca | Exemplo |
|------|---------|---------|
| **Views** | `attrs` dict **REMOVIDO** — nao funciona mais | Apenas `invisible="expression"`, `readonly="expression"` |
| **Frontend** | OWL 3.x, ES modules exclusivo | `import { Component } from "@odoo/owl"` |
| **POS** | Arquitetura modernizada, sem Backbone | Models nativos OWL, sem `init_from_JSON` |
| **Python** | Python 3.10+ obrigatorio | Usar `match/case`, type hints modernos |
| **Fiscal BR** | Verificar status OCA l10n-brazil 18.0 | Pode ter modulos novos ou descontinuados |

### 5.4 Odoo 18 Backend Migration Patterns (Confirmados)

> Padroes confirmados via auditoria sistematica dos modulos migrados (Grupo 1) e pesquisa OCA/KMEE.
> Referencia: `modules/semantic-changes-15to18.md`

#### A. Mudancas Semanticas (comportamento alterado)

| ID | Padrao | Antes (15) | Depois (18) | Notas |
|----|--------|-----------|-------------|-------|
| A1 | Product type storable | `type='product'` | `type='consu'` + `is_storable=True` | `'product'` REMOVIDO do selection. `is_storable` definido em `stock/models/product.py`. Apenas `type='consu'` aceita `is_storable=True` |
| A2 | Stock move quantity | `move.quantity_done = 5` | `move.quantity = 5` | Campo renomeado no Odoo 17. `quantity_done` NAO existe mais |
| A3 | Display name | `name_get()` override | `_compute_display_name()` override | Padrão OCA 18.0: computed field substitui metodo |

#### B. API Breaking Changes (metodo/campo removido)

| ID | Padrao | Antes (15) | Depois (18) | Notas |
|----|--------|-----------|-------------|-------|
| A4 | Name search | `_name_search()` override | `_search_display_name()` override | Metodo renomeado |
| A5 | XML view type | `<tree>` tag | `<list>` tag | Rename obrigatorio em TODOS os views XML |
| A6 | View attrs syntax | `attrs={'invisible': [('f','=',V)]}` | `invisible="f == V"` | Dict syntax REMOVIDA. Usar expressao Python inline |
| A7 | Search count | `search(domain, count=True)` | `search_count(domain)` | Parametro `count` REMOVIDO de `search()`. `search_count()` NAO aceita offset/limit/order |
| A8 | Cron numbercall | `<field name="numbercall">-1</field>` | (remover campo) | Campo `numbercall` removido de `ir.cron` |
| A9 | Magic fields | `_add_magic_fields()` override | Class attributes (`_log_access`, etc.) | Metodo removido, configuracao via atributos de classe |
| A10 | QWeb cache clear | `ir.qweb.clear_caches()` | `registry.clear_all_caches()` | Modelo `ir.qweb` nao tem mais `clear_caches` |
| A11 | Auth JWT | `base_rest_auth_jwt` | `auth_jwt` + `auth_jwt_demo` (OCA server-auth 18.0) | `base_rest_auth_jwt` NAO existe no 18.0. REST stack migra para FastAPI |
| A12 | POS export for UI | `_export_for_ui()` classmethod | `pos.load.mixin` + `_load_pos_data_fields()` | Padrao de loading de dados POS completamente reescrito |
| A13 | POS JS modules | `odoo.define()` + `require()` | ES6 `import`/`export` com `/** @odoo-module **/` | AMD-like module system removido |

#### C. Onde encontrar referencias OCA 18.0

| Repo | Path local | Padroes confirmados |
|------|-----------|-------------------|
| `server-tools` | `addons/server-tools/` | `search_count()`, `_compute_display_name` |
| `server-auth` | `addons/server-auth/` | `auth_jwt` → `auth_jwt_demo` |
| `l10n-brazil` | `addons/l10n-brazil/` | `type='consu'`, attrs→inline, tree→list |
| `rest-framework` | `addons/rest-framework/` | FastAPI patterns (base_rest deprecated) |

#### D. Checklist de auditoria pos-migracao

```
Para cada modulo migrado, executar APOS a migracao de codigo:

grep -rn "count=True" modules/18.0/<modulo>/    # A7: search(count=True)
grep -rn "quantity_done" modules/18.0/<modulo>/  # A2: stock.move field
grep -rn "type.*product" modules/18.0/<modulo>/  # A1: product type
grep -rn "name_get" modules/18.0/<modulo>/       # A3: display name
grep -rn "<tree" modules/18.0/<modulo>/          # A5: XML view type
grep -rn "attrs=" modules/18.0/<modulo>/         # A6: view attrs
grep -rn "numbercall" modules/18.0/<modulo>/     # A8: cron field
grep -rn "clear_caches" modules/18.0/<modulo>/   # A10: cache clear
```

> **Regra:** Executar esta auditoria APOS cada grupo de modulos migrados. Nao esperar ate o final.

---

## 6. Odoo 15 POS — Arquitetura JavaScript

### 5.1 Framework

O POS no Odoo 15 usa um **hibrido OWL 1.x + Backbone**:

```
- odoo.define() + require() (module system AMD-like)
- OWL 1.x para componentes novos
- Backbone.js para models (pos.order, pos.orderline)
- Registries.Component para registro de componentes
```

### 5.2 Heranca de Componentes

```javascript
odoo.define('meu_modulo.MinhaExtensao', function (require) {
    'use strict';

    const Registries = require('point_of_sale.Registries');
    const PaymentScreen = require('point_of_sale.PaymentScreen');

    const MinhaExtensao = (OriginalComponent) =>
        class extends OriginalComponent {
            setup() {
                super.setup();
                // codigo customizado
            }
        };

    Registries.Component.extend(PaymentScreen, MinhaExtensao);
    return MinhaExtensao;
});
```

### 5.3 Heranca de Templates OWL

```xml
<?xml version="1.0" encoding="UTF-8" ?>
<templates id="template" xml:space="preserve">
    <t t-name="MeuModulo.TicketScreenExtension"
       t-inherit="TicketScreen"
       t-inherit-mode="extension"
       owl="1">
        <xpath expr="//div[hasclass('ticket-screen')]" position="inside">
            <div class="minha-extensao">...</div>
        </xpath>
    </t>
</templates>
```

### 5.4 Imports Corretos (Odoo 15)

| Recurso | Import Correto (15) | Import ERRADO (16+) |
|---------|---------------------|---------------------|
| `useListener` | `require("web.custom_hooks")` | `@web/core/utils/hooks` |
| `Registries` | `require("point_of_sale.Registries")` | `@point_of_sale/js/Registries` |
| `PosComponent` | `require("point_of_sale.PosComponent")` | N/A |
| `ProductScreen` | `require("point_of_sale.ProductScreen")` | N/A |

### 5.5 Gotchas POS Confirmados

| Gotcha | Detalhes |
|--------|----------|
| `push_single_order` retorna inteiros | Retorna `[77]`, NAO `[{id: 77, pos_reference: "..."}]` |
| `order.backendId` NAO e setado pelo stock | Extrair manualmente de `syncedOrderBackendIds[0]` apos push |
| `_finalizeValidation` faz `showScreen()` interno | Codigo apos `super._finalizeValidation()` roda na tela ERRADA |
| TicketScreen usa `constructor()` | PosComponent usa `setup()` — nao misturar |
| `OrderManagementScreen` renomeado | Para `TicketScreen` no Odoo 15, sem `OrderRow` separado |
| `_fetchSyncedOrders()` | Converte orders para `models.Order` via `init_from_JSON` |
| `pos.payment.method` com `_unknown` | Dados pre-existentes podem ter modelos invalidos |

---

## 7. Localizacao Brasileira (OCA l10n-brazil)

### 6.1 Modulos-Chave

| Modulo | Funcao |
|--------|--------|
| `l10n_br_fiscal` | Framework fiscal base (document, operation, tax) |
| `l10n_br_nfe` | NF-e modelo 55 (B2B) |
| `l10n_br_account` | Bridge fiscal → contabilidade |
| `l10n_br_account_nfe` | Bridge account → NF-e |
| `l10n_br_base` | Campos brasileiros (CPF, CNPJ, IE, endereco) |
| `l10n_br_pos` (NXZ) | Extensoes POS para fiscal brasileiro |
| `l10n_br_pos_nfce` (NXZ) | NFC-e modelo 65 (B2C) via POS |

### 6.2 Fluxo NFC-e — Emissao Fiscal

```
POS Order (frontend)
    |  _finalizeValidation()
    v
pos.order.create_from_ui() (backend)
    |
    v
_prepare_invoice_vals()
    |  Cria account.move com:
    |  - payment_mode_id
    |  - ind_pres = "1" (presencial)
    |  - operation_name da fiscal_operation_id
    v
account.move.action_post()
    |  Gera fiscal document automaticamente
    v
l10n_br_fiscal.document
    |  action_document_confirm()
    |  - Gera numero sequencial
    |  - Gera chave de acesso (44 digitos)
    |  - Assina XML com certificado A1
    v
l10n_br_fiscal.document._nfe_send_for_authorization()
    |  Transmite via SOAP para SEFAZ
    v
SEFAZ responde:
    - 100: Autorizada (protocolo de autorizacao)
    - 225: Rejeicao (schema invalido)
    - 704: Data/hora atrasada (tolerancia 5 min)
    - 707: Operacao interestadual incorreta
    - 717: Operacao nao presencial
    - 972: Falta responsavel tecnico
```

### 6.3 Gotchas Fiscais Confirmados

| Gotcha | Detalhes | Fix |
|--------|----------|-----|
| `prepare_nfce_vals` NAO emite | Apenas coleta dados. Emissao e via `l10n_br_fiscal.document` | Criar fiscal doc + confirm + send |
| `document_electronic` e computed | Mixin fiscal computa, nao pode ser setado manualmente | Setar via `document_type_id` |
| Certificado A1 double base64 | `cert.file` no filestore pode ter double encoding | Try/except com pre-decode |
| Attachment collision no re-upload | "Limpar" campo nao deleta `ir_attachment` | Deletar attachment antes de re-upload |
| Serie com zeros a esquerda | "003" rejeitada — SEFAZ exige `0|[1-9]{1}[0-9]{0,2}` | Usar "3", nao "003" |
| `nfe40_choice_icms` = False | Sem `icms_cst_id`/`icmssn_tax_id` → crash XML export | Garantir mapeamento ICMS completo |
| `_check_fiscal_payment_mode` | Exige `move_ids.payment_mode_id` | Criar account.move ANTES do fiscal doc |
| `nfe40_idDest` interestadual | Parceiro anonimo sem `state_id` → operacao interestadual | Copiar `state_id` da empresa |
| `ind_pres` nao presencial | Valor "0" → rejeicao 717 | Setar "1" para NFC-e |
| `operation_name` vazio | Onchange nao dispara no POS programatico | Setar a partir de `fiscal_operation_id.name` |
| `is_anonymous_consumer` | Precisa ser True para consumidor final sem CPF | Setar ao criar parceiro anonimo |
| `infRespTec` obrigatorio | SEFAZ rejeita 972 | Configurar `company.technical_support_id` |
| `payment_mode_id` NULL | Campo existe mas nao e configurado automaticamente | Config via dados ou fallback no codigo |

### 6.4 Constraint `_check_cnpj_inscr_est`

O modulo `l10n_br_base` tem constraint unique em `cnpj_cpf`. Em testes:
```python
@classmethod
def setUpClass(cls):
    super().setUpClass()
    # Limpar parceiros com CNPJ duplicado antes de criar
    cls.env['res.partner'].search([('cnpj_cpf', '=', '55.006.293/0001-06')]).unlink()
```

---

## 8. QWeb Reports e wkhtmltopdf

### 7.1 Report Types

| Tipo | Visualizacao | Quando usar |
|------|-------------|-------------|
| `qweb-html` | HTML no browser + PDF via "Imprimir" | Reports com preview (DANFE, etc.) |
| `qweb-pdf` | PDF direto sem preview | Relatorios batch |

### 7.2 wkhtmltopdf 0.12.5 — Limitacoes

O Odoo usa wkhtmltopdf 0.12.5 (patched Qt) que tem limitacoes severas:

```
NAO SUPORTA:
- CSS Flexbox (display: flex)
- CSS Grid
- CSS Variables (custom properties)
- SVG inline complexo

USAR SEMPRE:
- <table> para layout
- Inline styles ou <style> tag
- width em porcentagem ou px
- Imagens como base64 inline (--disable-local-file-access)
```

### 7.3 Encoding UTF-8 em Reports

Para garantir UTF-8 no PDF gerado:
```xml
<!-- O div principal DEVE ter class="article" -->
<div class="article">
    <!-- conteudo do report -->
</div>
```

**Por que funciona:** `_prepare_html()` do Odoo procura `<div class="article">` para envolver em `web.minimal_layout`, que inclui `<meta charset="utf-8">`.

### 7.4 QR Codes em Reports

URLs de barcode (`/report/barcode/QR?...`) nao funcionam no wkhtmltopdf devido a `--disable-local-file-access`. Usar base64 inline:

```python
class MeuReport(models.AbstractModel):
    _name = "report.modulo.template"

    @api.model
    def _get_report_values(self, docids, data=None):
        barcode_png = self.env["ir.actions.report"].barcode(
            "QR", qrcode_value, width=150, height=150
        )
        qrcode_base64 = base64.b64encode(barcode_png).decode("ascii")
        return {"qrcode_base64": qrcode_base64, ...}
```

```xml
<img t-if="qrcode_base64"
     t-att-src="'data:image/png;base64,' + qrcode_base64"
     style="width: 150px; height: 150px;" />
```

---

## 9. Docker e Ambiente de Desenvolvimento

### 8.1 Estrutura

```
Docker: PostgreSQL 16 + Odoo 15.0
Service name: app (NAO "odoo")
DB: odoo14-migration
Admin: nexuz@nexuz.com.br / admin (password e "admin", NAO o email)
```

### 8.2 Comandos Essenciais

```bash
# Rodar testes unitarios
docker compose exec -T app python3 /app/odoo/odoo-bin \
  -d odoo14-migration --test-enable -u <module> --stop-after-init --no-http

# Update de modulo (requer restart apos)
docker compose exec -T app python3 /app/odoo/odoo-bin \
  -d odoo14-migration -u <module> --stop-after-init --no-http
docker compose restart app

# Shell interativo (para debug)
docker compose exec app python3 /app/odoo/odoo-bin shell -d odoo14-migration
```

### 8.3 Gotchas Docker

| Gotcha | Detalhes |
|--------|----------|
| `exec -T` nao invalida cache | `docker compose restart app` necessario apos update |
| `run --rm` nao preserva pip | Usar `exec` para preservar estado do container |
| `sg docker -c` usa `sh` | Para bash: `sg docker -c "bash -c '...'"` |
| `odoo` CLI nao existe | Usar `python3 /app/odoo/odoo-bin` |
| SPA navigation | Usar `domcontentloaded` + timeout (nao `networkidle`) |

---

## 10. Testes Odoo

### 10.1 Classes de Teste

| Classe | Quando usar |
|--------|-------------|
| `TransactionCase` | Testes de modelo, computed fields, constraints, services |
| `HttpCase` | Testes de controller REST, endpoints HTTP, tours UI |

### 10.2 Unit Tests — Padrao (TransactionCase)

```python
from odoo.tests import common, tagged

@tagged("post_install", "-at_install")
class TestFeatureCase(common.TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.model = cls.env["model.name"]

    def test_model_accessible(self):
        """T1: Model is accessible."""
        self.assertIn("model.name", self.env)

    def test_fields_exist(self):
        """T1: NXZ fields exist."""
        fields = self.model.fields_get()
        for f in ["field1", "field2"]:
            self.assertIn(f, fields)
```

### 10.3 Controller Tests — Padrao (HttpCase)

```python
from odoo.tests import common, tagged

@tagged("post_install", "-at_install")
class TestControllerCase(common.HttpCase):
    def test_endpoint_accessible(self):
        """T3: REST endpoint responds."""
        response = self.url_open("/api/endpoint", data="{}", headers={
            "Content-Type": "application/json",
        })
        self.assertEqual(response.status_code, 200)
```

### 10.4 Cuidados em Testes

| Cuidado | Detalhes |
|---------|----------|
| `cr.commit()` destroi savepoints | Separar testes com commit em classes T1 e T2 |
| `_order_fields()` no Odoo 15 | Requer 20+ campos UI — testar via ORM create |
| `available_in_pos` como `company_dependent` | Cria `ir.property` — checar duplicatas antes de insert |
| Prefixo `NXZ_TEST_` | Para dados de teste, garantindo isolamento |
| NUNCA duplicar testes OCA | Focar nas extensoes proprietarias Nexuz |

---

## 11. Checklist Pre-Desenvolvimento Odoo

Antes de iniciar qualquer tarefa envolvendo modulos Odoo, o agente DEVE:

```
1. Identificar o modulo Odoo/OCA base afetado
2. Verificar se existe modulo OCA que resolve (github.com/oca)
3. Consultar documentacao Odoo da versao target (secao 13)
4. Verificar constraints fiscais se envolver l10n_br_* (secao 7)
5. Verificar impacto em modulos dependentes (grafo secao 2.2)
6. Definir modelos, campos, views e seguranca necessarios
7. Listar testes necessarios por tier (TDD: RED primeiro)
```

---

## 12. Validacao e Testes Odoo

### 11.1 Code Review de Migracao

Em migracao de modulos NXZ, cada modulo DEVE ser revisado:

1. **Classificar CADA customizacao** usando a Regra de Ouro (secao 4.2)
2. **Salvar relatorio** no path padrao:
   ```
   modules/<versao>/<nome_modulo>/migration/reports/code-review-<from>to<to>.md
   ```
   Exemplo: `modules/15.0/nxz_auth_jwt/migration/reports/code-review-14to15.md`
3. **Se houver REMOVIDA → PARAR** e apresentar opcoes ao usuario

### 11.2 Sistema de Tiers de Testes

| Tier | Quando aplicar | Testes incluidos |
|------|---------------|-----------------|
| **T1 — Minimo** | Todo modulo, toda migracao | Instalacao, modelos acessiveis, campos existem |
| **T2 — Funcional** | Modulos com logica de negocio | T1 + computed fields, CRUD, metodos ORM |
| **T3 — Integracao** | Stack REST, cross-module | T1 + T2 + endpoints HTTP, auth flow, validators |

### 11.3 Artefatos de Teste Obrigatorios

1. **Unit tests** em `modules/<versao>/<modulo>/tests/`
   - Classe base: `TransactionCase` com `setUpClass`
   - Naming: `test_<feature>.py`, classe `Test<Feature>Case`
   - Tag: `@tagged("post_install", "-at_install")`

2. **E2E checklist** em `modules/<versao>/<modulo>/migration/tests/checklist-e2e.md`

3. **RPC checklist** (apenas modulos REST) em `migration/tests/checklist-rpc.md`

### 11.4 Verificacao de Herancas OCA

Antes de escrever testes:
- Identificar modulos OCA dos quais o modulo NXZ herda
- Se OCA ja tem testes: NXZ tests focam APENAS nas extensoes proprietarias
- Se OCA nao tem testes: NXZ tests cobrem funcionalidade basica

### 11.5 Execucao de Testes

```bash
docker compose exec -T app python3 /app/odoo/odoo-bin \
  -d odoo14-migration --test-enable -u <module> --stop-after-init --no-http
```

> Apos update de modulo: `docker compose restart app` (cache nao invalida automaticamente).

---

## 13. Referencias Rapidas Odoo

### Documentacao Odoo

| Versao | Apps | Developer |
|--------|------|-----------|
| v14 | `odoo.com/documentation/14.0/applications.html` | `odoo.com/documentation/14.0/developer/tutorials.html` |
| v15 | `odoo.com/documentation/15.0/applications.html` | `odoo.com/documentation/15.0/developer/tutorials.html` |
| v16 | `odoo.com/documentation/16.0/applications.html` | `odoo.com/documentation/16.0/developer/tutorials.html` |
| v17 | `odoo.com/documentation/17.0/applications.html` | `odoo.com/documentation/17.0/developer/tutorials.html` |
| v18 | `odoo.com/documentation/18.0/applications.html` | `odoo.com/documentation/18.0/developer/tutorials.html` |

### Repositorios OCA

| Repositorio | Descricao |
|-------------|-----------|
| `oca/l10n-brazil` | Localizacao brasileira (fiscal, contabil) |
| `oca/pos` | Extensoes PDV |
| `oca/rest-framework` | Framework REST (base_rest) |
| `oca/server-auth` | Autenticacao (auth_jwt) |
| `oca/server-tools` | Ferramentas de servidor |
| `oca/account-financial-tools` | Ferramentas financeiras |
| `oca/stock-logistics-workflow` | Fluxos de estoque |
| `oca/reporting-engine` | Motor de relatorios |

### Glossario Fiscal Brasileiro

| Termo | Descricao |
|-------|-----------|
| **NF-e** | Nota Fiscal Eletronica (modelo 55, B2B) |
| **NFC-e** | Nota Fiscal de Consumidor Eletronica (modelo 65, B2C) |
| **DANFE** | Documento Auxiliar da NF-e (representacao impressa) |
| **SEFAZ** | Secretaria da Fazenda (webservice de autorizacao) |
| **ICMS** | Imposto sobre Circulacao de Mercadorias |
| **CST** | Codigo de Situacao Tributaria |
| **CSOSN** | Codigo de Situacao da Operacao do Simples Nacional |
| **CFOP** | Codigo Fiscal de Operacoes e Prestacoes |
| **CPF** | Cadastro de Pessoa Fisica (11 digitos) |
| **CNPJ** | Cadastro Nacional de Pessoa Juridica (14 digitos) |
| **IE** | Inscricao Estadual |
| **A1** | Tipo de certificado digital (arquivo .pfx, validade 1 ano) |
| **SPED** | Sistema Publico de Escrituracao Digital |
| **TEF** | Transferencia Eletronica de Fundos |

---

## 14. Anti-Patterns Odoo (NAO Fazer)

| Anti-Pattern | Por que e ruim | O que fazer |
|--------------|---------------|-------------|
| Scripts Python standalone para testar Odoo | Bypass do framework, inconsistencias | Usar `odoo-bin shell`, unit tests, ou E2E |
| Assumir que `pos.order.id` == numero sequencial | Shop/0027 pode ter id=80 | Buscar por nome: `search([('name', '=', 'Shop/0027')])` |
| Flexbox em QWeb reports | wkhtmltopdf 0.12.5 nao suporta | Usar `<table>` para todo layout |
| Setar `document_electronic` manualmente | Campo computed do mixin fiscal | Definir via `document_type_id` |
| `report/barcode/` URL em PDF | `--disable-local-file-access` bloqueia | Base64 inline via report model |
| SQL direto para CRUD | Bypass do ORM, quebra permissoes | Usar `self.env[model].create/write/search` |
| Alterar core Odoo ou repos OCA | Quebra em atualizacoes | Herdar via `_inherit` em modulo NXZ |
| Funcionalidade Nexuz em modulo OCA | Viola separacao arquitetural | Criar modulo bridge nxz_<modulo> |
| Report customizado no modulo base | Mistura formatacao Nexuz com generico | Modulo separado com t-inherit |
| Campos nxz_* em modulo terceiro | Contaminacao de namespace | Mover para modulo bridge NXZ |
| `invisible="not field"` no Odoo 15 | Syntax Odoo 17+ | Usar `attrs={'invisible': [...]}` |
| Onchange esperado no POS programatico | Onchange nao dispara via ORM | Setar campos explicitamente no codigo |
| `store=True` em `company_dependent` | Conflito com ir.property | Remover `store=True` |