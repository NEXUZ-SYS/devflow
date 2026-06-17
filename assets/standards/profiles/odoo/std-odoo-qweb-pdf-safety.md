---
id: std-odoo-qweb-pdf-safety
description: Segurança de render PDF em templates QWeb de relatório — respeitar as restrições do wkhtmltopdf (sem flex/grid; QR via base64; class="article")
version: 1.0.0
source: devflow-default-odoo
applyTo: ["**/report/**/*.xml", "**/reports/**/*.xml"]
activation: on-demand
relatedAdrs: []
weakStandardWarning: true
enforcement:
  linter: machine/std-odoo-qweb-pdf-safety.js
---
## Princípios

- O motor de PDF do Odoo é o **wkhtmltopdf** — um renderizador baseado em uma versão **antiga** do WebKit, não um navegador moderno. Templates de relatório precisam ser escritos para esse engine, não para o Chrome, ou o PDF gerado diverge silenciosamente do preview HTML.
- **Layout é com `<table>`, não com CSS moderno**: o wkhtmltopdf **não suporta** flexbox nem grid. Qualquer `display: flex` ou `display: grid` é ignorado/quebrado no PDF — use `<table>`/`<tr>`/`<td>` para posicionar colunas e blocos.
- O wkhtmltopdf roda com **`--disable-local-file-access`** por padrão no Odoo. Recursos referenciados por URL local ou caminho de arquivo (imagens, QR codes, fontes) **não carregam**. Conteúdo binário deve ir **embutido como base64 inline** (`data:image/png;base64,...`).
- O template precisa do wrapper de página correto (`class="article"`) para herdar charset UTF-8 e o layout-base do Odoo; sem ele, acentuação e estrutura quebram no PDF.
- O wkhtmltopdf aplica o CSS de **`@media screen`**, não `@media print` — regras escondidas atrás de `@media print` simplesmente não têm efeito no relatório.

## Anti-patterns

| Errado | Corrija para |
|---|---|
| `<div style="display: flex;">…</div>` (layout flex) | `<table><tr><td>…</td></tr></table>` |
| `<div style="display:grid">…</div>` (layout grid) | `<table>` com linhas/colunas |
| `<img src="/report/barcode/QR/…"/>` ou `src="http://…"` (URL local/remota) | QR/imagem como **base64 inline** (`<img t-att-src="image_data_uri"/>`) |
| Template de report **sem** `class="article"` no wrapper | wrapper `<div class="article">` (charset UTF-8 + layout-base) |
| Estilos críticos atrás de `@media print { … }` | estilos em `@media screen` (ou sem media query) |
| Assumir `body.container` no template | `body.container` só existe no `minimal_layout`; não conte com ele no layout padrão |

## Linter

`machine/std-odoo-qweb-pdf-safety.js` — gate por extensão (só processa `.xml`; demais arquivos saem com exit 0). Contrato SI-4: `filePath` em `argv[2]`; violação → `VIOLATION: …` no stdout + exit 1.

Check estático (**único** automatizável com confiança):

1. **`display:flex` / `display:grid`** (estático) — regex tolerante a espaço (`display\s*:\s*(flex|grid)`) sobre o conteúdo do arquivo. Flag porque o wkhtmltopdf não renderiza flexbox/grid — o layout precisa migrar para `<table>`.

> **weakStandardWarning** — este standard tem `weakStandardWarning: true` no frontmatter de propósito: o linter cobre **apenas 1** das várias restrições do wkhtmltopdf. A maioria das regras abaixo é **human-review** porque detectá-las estaticamente gera falso-positivo alto. Trate o gate como uma rede de segurança parcial, não como cobertura completa.

Em **human-review** (não lintável, fica só nesta prosa):

2. **QR/imagem por URL** — `<img>` com `src` começando em `http`/`/` (não `data:`) **não** é trivialmente seguro: o wkhtmltopdf roda com `--disable-local-file-access` e pode não carregar o recurso. Mas distinguir URL legítima (asset público servido pelo Odoo) de caminho que vai falhar exige contexto de runtime — por isso **não é lintado**; revise manualmente e prefira **base64 inline** para QR codes.
3. **`class="article"` obrigatório** no wrapper do template (charset UTF-8 + layout-base) — validar a presença/posição correta do wrapper depende da estrutura de herança do report.
4. **`@media print` não funciona** — o wkhtmltopdf usa `@media screen`; detectar regras "mortas" atrás de `@media print` exige parse de CSS e análise semântica.
5. **`body.container` só no `minimal_layout`** — confirmar qual layout-base o report herda exige resolver a cadeia de `t-call`/`t-inherit`.

## Referência

- **Origem interna** — esta é a fonte primária deste standard; não há documentação oficial do Odoo cobrindo essas restrições (são comportamento do **wkhtmltopdf**, não do framework):
  - Skill interna `skills/odoo-development`, seção 8 — "QWeb Reports e wkhtmltopdf" (layout com `<table>`, QR via base64, `class="article"`, `@media screen`, `body.container` no `minimal_layout`).
  - Agente interno `agents/odoo-specialist.md` — convenções de relatórios PDF.
- **Fonte da limitação técnica** (sem flex/grid; WebKit antigo; `--disable-local-file-access`): documentação do wkhtmltopdf — https://wkhtmltopdf.org/ (o suporte a CSS é limitado ao motor WebKit embarcado, sem flexbox/grid).
