# Hierarquia de módulos POS NXZ (overlay L3)

> Específico da NXZ. Para o framework POS genérico (por versão), ver L1
> `frontend-specialist-odoo`. Para o fiscal BR genérico, ver L2 `odoo-l10n-br`.

## Cadeia de herança (frontend POS)

```
point_of_sale (Odoo base)
+-- l10n_br_pos (OCA: CPF/CNPJ, fiscal JSON, hooks de PaymentScreen)
|   +-- nxz_l10n_br_pos (bridge NXZ: cálculo de imposto, hook de sync de pedido)
|   |   +-- l10n_br_pos_nfce (OCA: NFC-e base)
|   |       +-- nxz_l10n_br_pos_nfce (NXZ: DANFE receipt, NfceProcessor, CSS de impressão)
+-- nxz_vouchers_pos (NXZ: sistema de cupom/voucher)
+-- nxz_pos_product_company (NXZ: filtragem de produto por empresa)
```

## Padrão bridge no POS

- **OCA** (`l10n_br_pos`, `l10n_br_pos_nfce`): fiéis à migração OCA, sem features NXZ.
- **Bridge NXZ** (`nxz_l10n_br_pos`, `nxz_l10n_br_pos_nfce`): estendem OCA via `_inherit`
  (Python) e `patch()` (JS no Odoo 18) / `Registries.Component.extend()` (JS ≤15).

## Hook de sincronização de pedido (por versão)

| Faixa | Hook NXZ |
|-------|----------|
| ≤15 | `_afterOrderSync` customizado (após push do pedido) |
| 18 | hook nativo `_postPushOrderResolve` substitui o custom |

> Para a mecânica genérica desses hooks e da migração JS por versão, ver
> L1 `frontend-specialist-odoo/references/` (migração de frontend e POS por era).

## Notas de estado de projeto

> O **estado de migração** de um projeto (quais módulos já migrados, em que fase) é
> informação de projeto e vive no `.context/` / handoff do projeto NXZ — **não** nesta
> skill distribuível. Esta skill descreve a **estrutura** (hierarquia/padrão), não o
> progresso de um projeto específico.
