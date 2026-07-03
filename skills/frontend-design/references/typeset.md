# typeset — sistema tipográfico intencional

## Objetivo

Substituir tipografia genérica por tipografia intencional e alinhada à marca, que carrega legibilidade e hierarquia. *"Boa tipografia é invisível; má tipografia distrai."*

## Quando usar

- Fontes-default invisíveis (Inter/Roboto/Arial sem intenção), hierarquia fraca, tamanhos arbitrários, inconsistência.
- Ao construir o sistema de tipo de uma marca ou produto.

## Grounding

Leia `@.context/product/product-design-system.md` — famílias, escala e pesos **saem dos tokens** de tipografia documentados. Não introduza família nova sem confrontar o sistema.

## Passos

1. **Avaliar** — defaults invisíveis, hierarquia fraca, sizing arbitrário, lacunas de consistência.
2. **Planejar** — consulte as guidelines de marca, estabeleça uma escala modular, defina papéis de peso.
3. **Implementar** — selecione fontes, construa a hierarquia, conserte legibilidade, refine detalhes.
4. **Verificar** — hierarquia clara, leitura confortável, consistência, alinhamento de marca.
5. **Handoff** para `polish` quando o tipo carrega a hierarquia sozinho.

## Princípios (guarde os números)

**Medida:** `max-width: 65ch` (faixa ideal 45–75 caracteres); use `ch`.

**Leading:** headings 1.1–1.2; corpo 1.5–1.7; texto claro-sobre-escuro +0.05–0.1.

**Seleção:** máximo 2–3 famílias; evite Inter/Roboto/Arial/Open Sans/system a menos que personalidade não importe; combine com contraste genuíno (serif+sans) ou uma família em vários pesos; apps podem usar system fonts (`-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui`).

**Peso:** carregue no máximo 3–4 pesos (Regular, Medium, Semibold, Bold) com papéis claros.

**Tracking:** ALL-CAPS 0.05em–0.12em; display grande default ou apertado; nunca tracking largo no corpo (piso de tracking = não expanda texto de corpo).

**Escala:** sistema de 5 tamanhos (caption/secondary/body/subheading/heading); razão modular 1.25 (major third), 1.333 (perfect fourth) ou 1.5 — escolha uma; produto usa razão apertada 1.125–1.2; corpo **nunca abaixo de 16px** (`1rem`), use `rem` (respeita a preferência do usuário), não `px`.

**Fluido vs. fixo:** headings/display de marketing com `clamp(min, preferred, max)` (max ≤ ~2.5× min); UIs de produto/dashboard com escala fixa em `rem`.

**Carregamento:** `font-display: swap` com fallback metric-matched; `size-adjust`/`ascent-override`/… para minimizar layout shift; preload só dos pesos críticos; variable font para 3+ pesos.

**OpenType:** `font-variant-numeric: diagonal-fractions`, `font-variant-caps: all-small-caps`, `font-kerning: normal`, `font-optical-sizing: auto`.

**Acessibilidade:** nunca `user-scalable=no`; alvos de 44px+ para links de texto; corpo ≥ 16px.

## Regras guidance

O que exige a tipografia **renderizada** ou a página **montada** fica aqui (regras `guidance` — ver `docs/design-rules-classification.md`):
- **line-length** — a medida de fato renderizada (largura do rect ÷ font-size) fica ~65–75ch, mesmo com fonte/responsivo variando.
- **tight-leading** — line-height/font-size confortável na render (caso em `px` depende da cascade).
- **oversized-h1** — o h1 renderizado não fica desproporcional ao viewport.
- **skipped-heading** (cross-file) — na página montada (JSX multi-componente), um `<h1>`, sem pular níveis de heading.
- **text-overflow / body-text-viewport-edge** — o tipo escolhido não transborda nem encosta na borda do viewport em nenhuma largura.
- **design-system-font** — família/peso conferidos contra os **tokens** do `product-design-system`, não valores soltos.
