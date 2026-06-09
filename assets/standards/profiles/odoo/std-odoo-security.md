---
id: std-odoo-security
description: Controle de acesso e exposição — rotas HTTP autenticadas, ACL por modelo e sudo() jamais alimentado por input não validado
version: 1.0.0
source: devflow-default-odoo
applyTo: ["**/*.py"]
activation: on-demand
relatedAdrs: []
enforcement:
  linter: machine/std-odoo-security.js
---
## Princípios

- Prefira `auth='user'` (padrão) nas rotas: só exponha `auth='public'`/`auth='none'` quando a rota for de fato pública, e nunca para acessar dados de negócio sem checagem própria
- `sudo()` ignora ACL e record rules — use só quando estritamente necessário e jamais o alimente com input não validado vindo da requisição
- Todo modelo novo precisa de pelo menos uma linha em `ir.model.access.csv` definindo as permissões (read/write/create/unlink) por grupo — sem ACL, o modelo fica sem controle de acesso explícito
- Em ambiente multi-company, proteja record rules com `check_company=True` e/ou filtro por `company_id` para impedir vazamento de dados entre empresas
- Valide todo input recebido em métodos públicos (rotas, RPC) antes de tocar o ORM — tamanho, tipo, domínio de valores e pertencimento do registro ao usuário
- Métodos que não devem ser expostos via RPC devem ser prefixados com `_` (underscore), que o Odoo trata como privados ao RPC público

## Anti-patterns

| Errado | Corrija para |
|---|---|
| `@http.route('/x', auth='public')` + `request.env[...].sudo().search(...)` no mesmo controller | `auth='user'` e acesso pelo ORM sem `sudo()` (deixe a ACL filtrar) |
| `auth='none'` numa rota que devolve dados de negócio | `auth='user'`; reserve `none` para endpoints técnicos sem dados sensíveis |
| `sudo()` com domínio/IDs vindos direto de `request.params` | Valide e restrinja o input; resolva o registro com o env do usuário antes de elevar |
| Modelo novo sem linha em `ir.model.access.csv` | Adicione ≥1 ACL por grupo (read/write/create/unlink explícitos) |
| Record rule multi-company sem `check_company`/`company_id` | Inclua `check_company=True` ou filtro por `company_id` no domínio |
| Método público (sem `_`) que só deveria ser chamado internamente | Prefixe com `_` para não expor via RPC |

## Linter

`machine/std-odoo-security.js` — gate por extensão (só processa `.py`; demais arquivos, inclusive `.xml`, saem com exit 0). Check estático:

1. **Rota pública + `sudo()` no mesmo arquivo** (estático, file-scoped) — flag se o arquivo contém um `@http.route(...)` com `auth='public'`/`auth="public"` ou `auth='none'`/`auth="none"` **E TAMBÉM** contém `.sudo(`. O escopo por arquivo é intencional: rota pública e `sudo()` no mesmo controller é o anti-padrão clássico de exposição de dados sem ACL. `sudo()` sozinho (sem rota pública) **não** é flagado — fica em human-review.

Em **human-review** (não lintável, fica só nesta prosa):

2. Todo modelo novo precisa de ≥1 linha em `ir.model.access.csv` — detectar ausência de ACL exige cruzar definição de modelo com o CSV.
3. Record rule multi-company com `check_company=True`/`company_id` — depende da semântica do domínio da regra.
4. Preferir `auth='user'` (padrão) e validar input em métodos públicos antes de tocar o ORM.
5. Métodos não destinados a RPC devem ser prefixados com `_`.
6. Nunca alimentar `sudo()` com input não validado — exige rastreio de taint do dado da requisição até a chamada.

## Referência

- Odoo 18 — Security in Odoo (ACL, record rules, `ir.model.access.csv`, `sudo()`): https://www.odoo.com/documentation/18.0/developer/reference/backend/security.html
- Odoo 18 — Web Controllers / `http.route` (parâmetro `auth`): https://www.odoo.com/documentation/18.0/developer/reference/backend/http.html
