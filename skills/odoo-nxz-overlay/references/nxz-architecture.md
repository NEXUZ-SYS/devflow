# Arquitetura NXZ ERP (overlay L3)

> Específico da NXZ. Para o framework Odoo genérico, ver L1 `odoo-development`.

## Camadas do sistema

```
Clientes (Mobile, Web, Kiosk PDV)
    |  HTTP/HTTPS (REST JSON + JWT)
    v
Odoo Core (werkzeug + ORM)
    |
OCA Community (rest-framework, server-auth, l10n-brazil, pos, queue...)
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

## Grafo de dependências NXZ

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

**Regra:** módulos NXZ NUNCA modificam repos OCA diretamente — toda customização via `_inherit`.

## Ordem de instalação

```
1. nxz_utils (sem dependências NXZ)
2. nxz_auth_jwt (depende nxz_utils + OCA auth_jwt)
3. nxz_rest_base (depende nxz_utils + nxz_auth_jwt + OCA base_rest)
4. nxz_partner, nxz_l10n_br_nfe (dependem OCA l10n-brazil)
5. nxz_rest_pos, nxz_rest_system, etc. (dependem nxz_rest_base)
```

## Convenções de nomenclatura

```
Módulos NXZ:     nxz_<dominio>_<funcionalidade>   ex.: nxz_pos_combo, nxz_fiscal_nfce
Módulos bridge:  nxz_<modulo_oca>_bridge          ex.: nxz_l10n_br_fiscal_bridge
Modelos:         nxz.<dominio>.<entidade>         ex.: nxz.delivery.order
Views:           nxz_<modelo>_view_<tipo>.xml     ex.: nxz_delivery_order_view_form.xml
```

## Separação Arquitetural OCA vs NXZ (bloqueante)

### Módulos terceiros (author != "Nexuz")
```
PERMITIDO: correções de bug críticas p/ migração; adaptações mínimas de API
           (super(Class, self) → super()); compatibilidade com a versão Odoo target.
PROIBIDO:  campos exclusivos Nexuz; métodos de negócio Nexuz; views proprietárias;
           depender de módulos nxz_*.
```

### Módulos NXZ (author = "Nexuz")
```
PADRÃO: criar bridge nxz_<base>; herdar via _inherit (Python) / patch (JS 18);
        adicionar campos/métodos/views no bridge. O módulo base segue genérico.
EX.: l10n_br_pos (OCA, fiel) → nxz_l10n_br_pos (bridge: nfce_document_serie_id,
     SAT settings, _order_fields() override, fiscal map, extensões de pos.config).
```

### Reports/templates
```
Base define report genérico → bridge NXZ herda via t-inherit + t-inherit-mode="extension".
NUNCA misturar formatação Nexuz (57/80mm) no módulo base.
```

### Checklist de validação (code review)
```
[ ] Módulo terceiro sem campos prefixo nxz_?
[ ] Módulo terceiro não importa/depende de nxz_*?
[ ] Features Nexuz em bridge separado?
[ ] Reports usam herança (t-inherit), não substituição?
[ ] Manifest do módulo terceiro não lista nxz_* em depends?
```

> Violação encontrada em code review: **BLOQUEAR até refatorar.** (enforçado por
> `std-odoo-oca-separation`, profile `nxz`.)

## Regra de Ouro — classificação de customizações (migração)

| Classificação | Ação |
|---------------|------|
| REESCRITA | Migrar e adaptar |
| ABSORVIDA | Remover e usar nativo (OCA/core já oferece) |
| ADAPTADA | Ajustar API calls |
| PRESERVADA | Manter sem mudanças |
| INTERNALIZADA | Referenciar OCA |
| REMOVIDA | **PARAR e consultar o usuário** |
