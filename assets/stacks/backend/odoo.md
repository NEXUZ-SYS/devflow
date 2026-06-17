# Stack — Odoo (12–18)

> Doc narrativo de conhecimento (DDC) da stack Odoo. Liga-se ao `profiles/odoo.yaml`
> (`stacks:` odoo-12 … odoo-18) por nome de lib. Grounding híbrido: este narrativo dá o
> mapa; a verdade versionada vem do `docs-mcp-server` e da fonte OCA.

## O que é

Odoo é um ERP modular (Python/PostgreSQL + frontend OWL/QWeb) com séries LTS anuais.
O DevFlow trata cada série como uma lib versionada para grounding de documentação.

## Séries e fontes de doc (grounding)

| Lib | Versão | Fonte oficial | Consumir via |
|-----|--------|---------------|--------------|
| odoo-12 | 12.0 | `odoo.com/documentation/12.0/` | `mcp__docs-mcp-server__search_docs` (lib `odoo-12`) |
| odoo-13 | 13.0 | `odoo.com/documentation/13.0/` | `search_docs` (lib `odoo-13`) |
| odoo-14 | 14.0 | `odoo.com/documentation/14.0/developer/` | `search_docs` (lib `odoo-14`) |
| odoo-15 | 15.0 | `odoo.com/documentation/15.0/developer/` | `search_docs` (lib `odoo-15`) |
| odoo-16 | 16.0 | `odoo.com/documentation/16.0/developer/` | `search_docs` (lib `odoo-16`) |
| odoo-17 | 17.0 | `odoo.com/documentation/17.0/developer/` | `search_docs` (lib `odoo-17`) |
| odoo-18 | 18.0 | `odoo.com/documentation/18.0/developer/` | `search_docs` (lib `odoo-18`) |

> ⚠️ **Estado de indexação:** no momento desta escrita, só **odoo-12, odoo-17 e odoo-18**
> estão indexados no `docs-mcp-server`. Para fechar a paridade 12–18, indexar
> odoo-13/14/15/16 via `/devflow:scrape-stack-batch` (a wishlist já está no profile).
> Enquanto não indexado, `search_docs` para essas séries retorna vazio — confirmar contra
> o código-fonte da branch `NN.0` (OCA/Odoo) antes de afirmar fatos de versão.

## Camadas de conhecimento relacionadas

- **L1 framework genérico:** skills `odoo-development` (backend) e `frontend-specialist-odoo`.
- **L2 localização BR:** skill `odoo-l10n-br` (genérica) + repos `github.com/oca/l10n-brazil`.
- **L3 overlay de empresa:** skill de overlay gated por profile (só projetos da empresa).

## Repos OCA de referência

`github.com/oca` — `l10n-brazil`, `pos`, `rest-framework`, `server-auth`, `server-tools`,
`reporting-engine`, `stock-logistics-workflow`, `account-financial-tools`.
