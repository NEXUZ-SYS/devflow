---
id: std-odoo-fiscal-br-integrity
description: Invariantes de dado fiscal brasileiro (SEFAZ) antes da emissão NFC-e/NF-e — campos presenciais, série, destinatário, certificado e modelo de emissão corretos
version: 1.0.0
source: devflow-default-odoo
applyTo: ["**/*.py", "**/*.xml"]
activation: on-demand
relatedAdrs: []
weakStandardWarning: true
enforcement:
  linter: machine/std-odoo-fiscal-br-integrity.js
---

> ⚠️ **Standard fraco em lintabilidade.** A integridade fiscal BR depende quase toda de
> valores de **runtime** (parceiro, empresa, certificado, encadeamento de documentos), que
> nenhuma análise estática alcança. O linter cobre apenas **2 padrões literais** em código/data;
> todo o resto vive em **human-review** (ver `## Anti-patterns` e `## Linter`). Trate o gate
> automático como uma rede de segurança mínima — não como prova de conformidade fiscal.

## Princípios

- **Emita pelo documento fiscal, não pelo coletor de dados:** a emissão de NFC-e/NF-e passa por
  `l10n_br_fiscal.document`. `prepare_nfce_vals` (e similares) apenas **coletam** valores para
  preencher o documento — chamá-los não emite nada e não dispara as validações da localização.
- **`ind_pres` reflete a presença real do consumidor:** venda presencial (PDV/balcão) exige
  `ind_pres = '1'`. O valor `'0'` significa "não se aplica" e é rejeitado pela SEFAZ em operação
  presencial (rejeição **717**).
- **Série fiscal é o número puro, sem zeros à esquerda:** a SEFAZ recebe a série como inteiro
  (`3`), não como string formatada (`003`). Zero à esquerda em literal de série é erro de modelagem.
- **Todo destinatário precisa de UF, mesmo o anônimo:** consumidor não identificado ainda exige
  `state_id` para preencher `nfe40_idDest`. Sem UF (em geral herdada da empresa emitente) o XML
  sai inconsistente e é rejeitado.
- **Certificado A1 pode vir com base64 duplo:** ao ler o conteúdo do certificado, proteja a
  decodificação com `try/except` — alguns fluxos armazenam o material já codificado uma vez a mais.
- **Encadeie o documento fiscal pela origem contábil:** `pos.order` **não** tem
  `fiscal_document_id`; chegue ao documento fiscal via `account.move` (a fatura/lançamento gerado),
  nunca presumindo o campo direto no pedido de PDV.
- **No 18, `cnpj_cpf` é computed não-armazenado:** não filtre por `cnpj_cpf` em `search`/domain;
  busque o parceiro por `vat` (campo persistido) e derive o documento a partir dele.

## Anti-patterns

| Errado | Corrija para | Detecção |
|---|---|---|
| `ind_pres = "0"` em venda presencial | `ind_pres = "1"` | **linter** |
| `serie = "003"` (zero à esquerda) | `serie = "3"` | **linter** |
| Emitir chamando `prepare_nfce_vals(...)` | Emitir via `l10n_br_fiscal.document` (o `prepare_*` só coleta vals) | human-review |
| Parceiro anônimo sem `state_id` → `nfe40_idDest` vazio | Herdar `state_id` da empresa emitente antes de montar o destinatário | human-review |
| `base64.b64decode(cert)` sem proteção | `try/except` cobrindo o caso de base64 duplo no A1 | human-review |
| `order.fiscal_document_id` em `pos.order` | Encadear via `account.move` gerado pelo pedido | human-review |
| `search([('cnpj_cpf', '=', doc)])` no 18 | `search([('vat', '=', doc)])` (cnpj_cpf é computed non-stored) | human-review |

## Linter

`machine/std-odoo-fiscal-br-integrity.js` — gate por extensão (processa `.py` **e** `.xml`;
demais arquivos saem com exit 0). Casa apenas **valores literais** em código/data:

1. **`ind_pres` presencial errado** (estático) — flag quando `ind_pres` é atribuído ao literal
   `"0"`/`'0'`, seja via `=` (kwarg/atributo) ou `:` (chave de dict), tolerante a espaços e ao
   tipo de aspas. Cobre `ind_pres = "0"`, `'ind_pres': '0'`, `ind_pres="0"` (inclusive como
   atributo em XML). **Não** flaga `ind_pres = '1'`.
2. **Série NFC-e com zero à esquerda** (estático) — flag quando `serie` é atribuída a uma string
   só-dígitos que **começa com `0` e tem comprimento > 1** (`serie = "003"`, `'serie': '003'`).
   **Não** flaga `serie = "3"` (série limpa de 1 dígito) nem `serie = "30"` (não começa com zero).

Tudo o mais é **human-review** (não lintável — depende de runtime e de contexto semântico):

3. Emitir via `l10n_br_fiscal.document`, não via `prepare_nfce_vals` (que só coleta dados).
4. Parceiro anônimo precisa de `state_id` (herdado da empresa) para `nfe40_idDest`.
5. Certificado A1 pode ter base64 duplo — decodificar sob `try/except`.
6. `pos.order` não tem `fiscal_document_id` — encadear via `account.move`.
7. No 18, `cnpj_cpf` é computed não-armazenado — buscar o parceiro por `vat`.

## Referência

- **Origem interna NXZ** — skill `odoo-development`, seção 7 "Localização brasileira"; agente
  `agents/odoo-specialist.md`, tabela `l10n-brazil`. Não há documentação oficial do Odoo cobrindo
  estas invariantes — as regras foram destiladas de **rejeições reais da SEFAZ** em produção
  (notadamente a rejeição **717** para `ind_pres` presencial incorreto) e do conhecimento
  acumulado da localização brasileira (`l10n_br_fiscal`, `nfe`/`nfce`).
- Os códigos e campos citados (`ind_pres`, série, `nfe40_idDest`, `l10n_br_fiscal.document`,
  `cnpj_cpf`/`vat`) seguem a nomenclatura da localização brasileira usada pela NXZ; valide sempre
  contra o módulo instalado, pois nomes e comportamentos variam entre versões (15 → 18).
