# DANFE e wkhtmltopdf (representação impressa fiscal)

> Camada L2 — genérico para qualquer projeto Odoo BR. Geração de DANFE NF-e/NFC-e via QWeb.
> Grounding: `odoo.com/documentation/NN.0/developer/reference/backend/reports.html`; OCA `l10n-brazil`.

## wkhtmltopdf 0.12.5 (patched Qt) — limitações

O Odoo usa wkhtmltopdf 0.12.5, que NÃO suporta CSS moderno:

```
NÃO SUPORTA:           USAR SEMPRE:
- Flexbox (display:flex)   - <table> para todo o layout
- CSS Grid                 - inline styles ou <style>
- CSS Variables            - width em % ou px
- SVG inline complexo      - imagens como base64 inline
- @media print (usa screen)
```

## Encoding UTF-8 — `class="article"`

O div principal do report DEVE ter `class="article"`:

```xml
<div class="article">
    <!-- conteúdo do report (DANFE 57mm / 80mm / A4) -->
</div>
```

**Por quê:** `_prepare_html()` do Odoo procura `<div class="article">` para envolver em
`web.minimal_layout`, que inclui `<meta charset="utf-8">`. Sem ele, acentuação quebra.

## QR Code (NFC-e) — base64 inline, não URL

URLs `/report/barcode/QR?...` falham no wkhtmltopdf por causa de `--disable-local-file-access`.
Gerar o PNG no report model e embutir como base64:

```python
class MeuReport(models.AbstractModel):
    _name = "report.modulo.template"

    @api.model
    def _get_report_values(self, docids, data=None):
        barcode_png = self.env["ir.actions.report"].barcode(
            "QR", qrcode_value, width=150, height=150
        )
        return {"qrcode_base64": base64.b64encode(barcode_png).decode("ascii"), ...}
```

```xml
<img t-if="qrcode_base64"
     t-att-src="'data:image/png;base64,' + qrcode_base64"
     style="width: 150px; height: 150px;" />
```

## Tipos de report

| Tipo | Visualização | Quando usar |
|------|-------------|-------------|
| `qweb-html` | HTML no browser + PDF via "Imprimir" | Reports com preview (DANFE) |
| `qweb-pdf` | PDF direto | Relatórios batch |

## Diferenças por versão (Odoo 12–18)

| Faixa | Nota |
|-------|------|
| 12–16 | `report._render_qweb_pdf([ids])` |
| 18 | Assinatura muda: `report._render_qweb_pdf(report.id, [ids])` (report_id como 1º arg) |

> ⚠️ **Confirme a assinatura** de `_render_qweb_pdf` na branch alvo via
> `mcp__docs-mcp-server__search_docs` (lib `odoo-NN`) ou código-fonte; não está
> indexado para todas as séries.
