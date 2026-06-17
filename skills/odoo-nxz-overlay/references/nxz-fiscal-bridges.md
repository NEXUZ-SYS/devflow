# Bridges fiscais NXZ (overlay L3)

> Específico da NXZ. O fluxo fiscal BR genérico (NFC-e/SEFAZ/DANFE) está em L2
> `odoo-l10n-br` — aqui só o que a NXZ adiciona por cima via bridge.

## `nxz_l10n_br_pos_nfce` — DANFE NFC-e NXZ

Bridge que estende `l10n_br_pos_nfce` (OCA) com a representação impressa NXZ:

- **`NfceProcessor`** — classe NXZ (JS, POS) que orquestra a emissão/coleta NFC-e no
  fluxo de pagamento do PDV. Estende o comportamento OCA via `patch()` (Odoo 18) sobre o
  `PaymentScreen`/hook de pós-sync. **Não** existe no OCA — é overlay NXZ.
- **DANFE 57mm / 80mm** — template de recibo customizado NXZ via
  `t-inherit` + `t-inherit-mode="extension"` sobre o `OrderReceipt`/report base. A
  formatação de bobina (57/80mm) é NXZ e fica no bridge, **nunca** no módulo OCA base.
- **CSS de impressão** — no bundle `point_of_sale._assets_pos` (Odoo 18), junto com JS+XML.

## Separação report base vs bridge (fiscal)

```
nxz_l10n_br_nfe (base NXZ): report NF-e padrão
nxz_l10n_br_nfe_danfe (bridge): DANFE NFC-e 57mm/80mm customizado (t-inherit)
```

A mecânica de wkhtmltopdf (sem flexbox, `class="article"`, QR base64) é **genérica** e
está documentada em L2 `odoo-l10n-br/references/danfe-wkhtmltopdf.md`. Este arquivo só
registra **o que é NXZ**: `NfceProcessor`, layouts de bobina NXZ, e os bridges acima.

## Cobertura de versão

A migração JS dos bridges POS NXZ entre versões segue o guia genérico de
L1 `frontend-specialist-odoo` (≤15 `Registries.Component.extend` → 18 `patch`). As
diferenças específicas do `NfceProcessor` por versão devem ser confirmadas no código do
módulo NXZ alvo, não assumidas.
