---
name: odoo-l10n-br
description: Localização fiscal brasileira para Odoo (qualquer projeto BR) — l10n_br, emissão NFC-e/NF-e, códigos SEFAZ, DANFE e gotchas fiscais. Cobre Odoo 12–18.
phases: [P, R, E, V, C]
mode: manual
---

# Localização Fiscal Brasileira para Odoo (L2)

## Objetivo

Conhecimento de **localização fiscal brasileira** reutilizável em **qualquer projeto
Odoo BR** — não só implementações de uma empresa específica. Cobre a stack OCA
`l10n-brazil` (fiscal, contábil, base, NF-e, NFC-e via PDV), o fluxo de emissão de
documentos eletrônicos, os códigos de retorno da SEFAZ, os gotchas fiscais
confirmados em produção e a geração de DANFE via wkhtmltopdf.

Esta é a **camada L2** da pilha de skills Odoo do DevFlow:

- **L1 (framework genérico):** `odoo-development` (backend), `frontend-specialist-odoo`
  (frontend) — ORM, OWL/QWeb, POS, testes, mudanças de API por versão.
- **L2 (este documento):** localização BR genérica (`l10n_br`, NFC-e, SEFAZ, DANFE).
- **L3 (overlay de empresa):** customizações de bridge específicas de um projeto vivem
  no `.context/` do projeto e/ou em uma skill de overlay, **fora** desta camada.

Use nomes de módulo **OCA genéricos** (`l10n_br_fiscal`, `l10n_br_pos`,
`l10n_br_pos_nfce`). Bridges proprietários (ex.: `<empresa>_l10n_br_pos`) herdam dos
módulos OCA via `_inherit` e ficam **fora** desta skill genérica.

## Quando usar

- Configurar/integrar `l10n_br_fiscal`, `l10n_br_nfe`, `l10n_br_account` em um projeto BR.
- Implementar ou depurar emissão de NF-e (modelo 55) ou NFC-e (modelo 65) via PDV.
- Diagnosticar rejeições da SEFAZ (códigos 100/225/704/707/717/972).
- Gerar/depurar DANFE (representação impressa) em wkhtmltopdf.
- Tratar CNPJ/CPF/IE, certificado A1, série fiscal, `ind_pres`, CFOP/CST/CSOSN.

## Módulos-chave OCA `l10n-brazil`

| Módulo | Função |
|--------|--------|
| `l10n_br_base` | Campos brasileiros (CPF, CNPJ, IE, endereço) |
| `l10n_br_fiscal` | Framework fiscal base (`document`, `operation`, `tax`) |
| `l10n_br_nfe` | NF-e modelo 55 (B2B) |
| `l10n_br_account` | Bridge fiscal → contabilidade |
| `l10n_br_account_nfe` | Bridge account → NF-e |
| `l10n_br_pos` | Extensões de PDV para fiscal brasileiro |
| `l10n_br_pos_nfce` | NFC-e modelo 65 (B2C) via PDV |

> **Nomenclatura:** `l10n_br_pos` e `l10n_br_pos_nfce` são módulos OCA genéricos.
> Em projetos com bridge proprietário, o módulo da empresa **herda** desses módulos
> via `_inherit` — nunca adicione campos específicos da empresa nos módulos OCA.

## Conteúdo detalhado (references)

- **Fluxo de emissão NFC-e/NF-e:** `references/nfce-nfe-flow.md` — pipeline
  PDV → `account.move` → `l10n_br_fiscal.document` → SEFAZ, e os códigos de retorno.
- **Gotchas fiscais:** `references/fiscal-gotchas.md` — tabela de armadilhas
  confirmadas (certificado A1, série, `ind_pres`, ICMS, `infRespTec`, constraint
  `_check_cnpj_inscr_est`) com sinalização de faixa de versão.
- **DANFE / wkhtmltopdf:** `references/danfe-wkhtmltopdf.md` — layout 57/80mm, QR em
  base64, `class="article"`, encoding SEFAZ, limitações do wkhtmltopdf.

## Cobertura de versão (Odoo 12–18)

A stack OCA `l10n-brazil` existe para cada série LTS do Odoo (branches `12.0` a `18.0`
no repositório). O comportamento fiscal mudou de forma relevante entre séries; a faixa
de cada divergência está sinalizada nas tabelas das references. Pontos macro:

| Faixa | Característica da stack OCA `l10n-brazil` |
|-------|------------------------------------------|
| Odoo 12–13 | Geração de XML via `nfelib`/`erpbrasil`; `account.invoice` ainda separado de `account.move`. |
| Odoo 13 | `@api.multi` removido no core (afeta overrides de métodos fiscais). |
| Odoo 14–15 | Unificação `account.invoice` → `account.move`; bridges fiscais reescritos. |
| Odoo 15 | PDV (POS) ainda Backbone/JS clássico; hook de sincronização de pedido customizado. |
| Odoo 16–17 | `<tree>` → `<list>` nas views fiscais; refinamentos no `document.line.mixin`. |
| Odoo 18 | PDV migrado para `pos.load.mixin`; `_onchange_*` fiscais viram computed fields; `document_id` obrigatório no `document.line.mixin`. |

> ⚠️ **Confirme antes de afirmar divergências finas entre séries.** A doc OCA
> `l10n-brazil` **não está indexada** no docs-mcp-server (verificado: `find_version`
> retorna "not found"). Trate as linhas acima como guia macro; para detalhe por série,
> consulte o repositório OCA por branch (`12.0`…`18.0`) ou marque
> **"⚠️ não confirmado — indexar via /devflow:scrape-stack-batch"** em vez de inventar.

## Grounding (fontes versionadas)

Toda tabela de gotcha/breaking-change nas references aponta para pelo menos uma destas
fontes — **consulte a fonte versionada antes de afirmar comportamento por série**:

- **OCA `l10n-brazil`** (fonte primária da localização):
  `github.com/oca/l10n-brazil` — selecione a **branch da série** (`12.0` … `18.0`).
- **OCA correlatos:** `github.com/oca/pos`, `github.com/oca/account-invoicing`.
- **docs-mcp-server** (core Odoo, para APIs de ORM/account/pos que a localização usa):
  `mcp__docs-mcp-server__search_docs` com lib `odoo-12` / `odoo-17` / `odoo-18`
  (indexadas) e `mcp__docs-mcp-server__find_version` para resolver a série.
  - **Indexadas no store:** `odoo-12`, `odoo-17`, `odoo-18`.
  - **NÃO indexadas (core):** `odoo-13`, `odoo-14`, `odoo-15`, `odoo-16` — indexar via
    `/devflow:scrape-stack-batch` quando necessário.
  - **NÃO indexada (localização):** `l10n-brazil` — sem cobertura no docs-mcp;
    usar o repositório OCA como fonte.
- **Documentação fiscal oficial:** portal NF-e/NFC-e da SEFAZ (Notas Técnicas, schemas
  XML, tabela de códigos de retorno) — fonte normativa para layout e rejeições.

## Glossário fiscal brasileiro

| Termo | Descrição |
|-------|-----------|
| **NF-e** | Nota Fiscal Eletrônica (modelo 55, B2B) |
| **NFC-e** | Nota Fiscal de Consumidor Eletrônica (modelo 65, B2C) |
| **DANFE** | Documento Auxiliar da NF-e (representação impressa) |
| **SEFAZ** | Secretaria da Fazenda (webservice de autorização) |
| **ICMS** | Imposto sobre Circulação de Mercadorias |
| **CST** | Código de Situação Tributária |
| **CSOSN** | Código de Situação da Operação do Simples Nacional |
| **CFOP** | Código Fiscal de Operações e Prestações |
| **CPF** | Cadastro de Pessoa Física (11 dígitos) |
| **CNPJ** | Cadastro Nacional de Pessoa Jurídica (14 dígitos) |
| **IE** | Inscrição Estadual |
| **A1** | Tipo de certificado digital (arquivo `.pfx`, validade 1 ano) |
| **SPED** | Sistema Público de Escrituração Digital |
| **TEF** | Transferência Eletrônica de Fundos |
| **ind_pres** | Indicador de presença do comprador (1 = operação presencial) |
| **chave de acesso** | Identificador de 44 dígitos do documento eletrônico |

## Anti-patterns (localização BR)

1. **NÃO** assumir que `prepare_nfce_vals` (ou similar) emite o documento — coleta dados;
   a emissão é via `l10n_br_fiscal.document`.
2. **NÃO** setar campos fiscais computed (`document_electronic`) manualmente — configure
   a entrada (`document_type_id`, `fiscal_operation_id`).
3. **NÃO** usar série com zeros à esquerda (`"003"`) — a SEFAZ rejeita; use `"3"`.
4. **NÃO** afirmar divergência fiscal entre séries sem checar a branch OCA
   correspondente — marque como não confirmado se a fonte não estiver disponível.
5. **NÃO** adicionar campos da empresa nos módulos OCA `l10n_br_*` — herde via bridge.
