# Fluxo de emissão NFC-e / NF-e (OCA l10n-brazil)

> Camada L2 — genérico para qualquer projeto Odoo BR. Nomes de módulo OCA.
> Grounding: `github.com/oca/l10n-brazil`; quando indexado, `mcp__docs-mcp-server__search_docs` (lib `odoo-NN`).

## Pipeline de emissão (PDV → SEFAZ)

```
POS Order (frontend)
    |  _finalizeValidation()  (≤15)  /  validateOrder() (18)
    v
pos.order → account.move (backend)
    |  _prepare_invoice_vals():
    |   - payment_mode_id
    |   - ind_pres = "1" (venda presencial)
    |   - operation_name a partir de fiscal_operation_id
    v
account.move.action_post()
    |  Gera o fiscal document automaticamente
    v
l10n_br_fiscal.document
    |  action_document_confirm():
    |   - número sequencial
    |   - chave de acesso (44 dígitos)
    |   - assina XML com certificado A1
    v
l10n_br_fiscal.document._nfe_send_for_authorization()
    |  Transmite via SOAP para a SEFAZ
    v
SEFAZ responde (ver códigos abaixo)
```

> **Importante:** `prepare_nfce_vals` (quando existe) apenas **coleta dados** — não
> emite. A emissão é sempre via `l10n_br_fiscal.document` (criar → confirmar → enviar).

## Códigos de retorno SEFAZ (mais comuns)

| Código | Significado | Ação |
|--------|-------------|------|
| 100 | Autorizada | Protocolo de autorização gravado |
| 225 | Rejeição — schema inválido | Conferir mapeamento/campos obrigatórios do XML |
| 704 | Data/hora atrasada | Tolerância ~5 min; sincronizar relógio |
| 707 | Operação interestadual incorreta | Conferir `state_id` do destinatário |
| 717 | Operação não presencial | `ind_pres` deve ser "1" para NFC-e presencial |
| 972 | Falta responsável técnico | Configurar `infRespTec` (`company.technical_support_id`) |

## Diferenças por versão (Odoo 12–18)

| Faixa | Nota |
|-------|------|
| 12–13 | `account.invoice` ainda separado de `account.move`; geração XML via `nfelib`/`erpbrasil`. |
| 14–15 | Unificação `account.invoice` → `account.move`; bridges fiscais reescritos sobre `account.move`. |
| 16–17 | Refinamentos em `document.line.mixin`; views fiscais `<tree>`→`<list>`. |
| 18 | `_onchange_*` fiscais viram computed fields (disparam automaticamente — não chamar manualmente); `document_id` obrigatório em quem herda `document.line.mixin`. |

> ⚠️ **Não confirmado entre séries finas** — a doc OCA `l10n-brazil` não está indexada
> no docs-mcp-server. Confirme contra o código da branch `NN.0` do repositório OCA
> antes de afirmar; ou indexe via `/devflow:scrape-stack-batch`.
