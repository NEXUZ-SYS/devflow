# Gotchas fiscais brasileiros (OCA l10n-brazil) — confirmados em produção

> Camada L2 — genérico para qualquer projeto Odoo BR. Nomes de módulo OCA.
> Grounding: `github.com/oca/l10n-brazil`; quando indexado, `mcp__docs-mcp-server__search_docs`.

| Gotcha | Detalhes | Fix |
|--------|----------|-----|
| `prepare_nfce_vals` NÃO emite | Apenas coleta dados; emissão via `l10n_br_fiscal.document` | Criar fiscal doc → confirm → send |
| `document_electronic` é computed | O mixin fiscal computa; não setar manualmente | Setar via `document_type_id` |
| Certificado A1 com double base64 | `cert.file` no filestore pode ter encoding duplo | Try/except: normal primeiro, pré-decode se falhar |
| Attachment collision no re-upload | "Limpar" o campo não deleta o `ir.attachment` | Deletar attachment antes de re-upload |
| Série com zeros à esquerda | "003" é rejeitada — SEFAZ exige `0|[1-9][0-9]{0,2}` | Usar "3", não "003" |
| `nfe40_choice_icms` = False | Sem `icms_cst_id`/`icmssn_tax_id` → crash no export XML | Garantir mapeamento ICMS completo |
| `_check_fiscal_payment_mode` | Exige `move_ids.payment_mode_id` | Criar `account.move` ANTES do fiscal doc |
| `nfe40_idDest` interestadual | Parceiro anônimo sem `state_id` vira operação interestadual | Copiar `state_id` da empresa |
| `ind_pres` não presencial | Valor "0" → rejeição 717 | Setar "1" para NFC-e presencial |
| `operation_name` vazio | Onchange não dispara no POS programático | Setar a partir de `fiscal_operation_id.name` |
| `is_anonymous_consumer` | Precisa ser True para consumidor final sem CPF | Setar ao criar parceiro anônimo |
| `infRespTec` obrigatório | SEFAZ rejeita 972 | Configurar `company.technical_support_id` |
| `payment_mode_id` NULL | Existe mas não é configurado automaticamente | Config via dados ou fallback no código |

## Constraint `_check_cnpj_inscr_est` (l10n_br_base)

`l10n_br_base` tem constraint unique em `cnpj_cpf`. Em testes, limpar duplicatas antes de criar:

```python
@classmethod
def setUpClass(cls):
    super().setUpClass()
    cls.env["res.partner"].search([("cnpj_cpf", "=", "55.006.293/0001-06")]).unlink()
```

## Diferenças por versão (Odoo 12–18)

| Faixa | Nota |
|-------|------|
| 12–13 | Campos fiscais em `account.invoice`; `@api.multi` ainda presente (removido no 13 core). |
| 14–15 | Migração para `account.move`. |
| 18 | `city_taxation_code_id` → `_ids` (Many2one → Many2many no OCA 18); `_onchange_*` fiscais viram computed. |

> ⚠️ **Não confirmado entre séries finas** — confirme contra a branch `NN.0` do repo OCA
> `l10n-brazil` antes de afirmar; ou indexe via `/devflow:scrape-stack-batch`.
