# audit — auditoria técnica de qualidade (mensurável)

## Objetivo

Auditoria de qualidade em nível de código, através de cinco dimensões **mensuráveis**, com evidência documentada. Diferente do `critique` (revisão de design/heurística, subjetiva com método), o `audit` mede o que é verificável e atribui um score de saúde — sem propor fixes no mesmo passo.

## Quando usar

- Antes de shippar uma superfície de produto (gate de qualidade).
- Quando o usuário pede "audite o design" / "quão saudável está esta UI?".
- Para gerar um baseline objetivo que a evolução do trabalho terá de superar.

## Grounding

Leia `@.context/product/product-design-system.md` — a dimensão de theming e as regras `design-system-*` auditam contra os **tokens** documentados ali.

## Dimensões (0–4 pontos cada → score de saúde 0–20)

1. **Acessibilidade** — contraste, ARIA, navegação por teclado, HTML semântico, alt text, usabilidade de form.
2. **Performance** — eficiência de layout, custo de animação, otimização de assets, tamanho de bundle, ciclos de render.
3. **Responsivo** — dimensões fixas, touch targets, tratamento de overflow, escala de texto, cobertura de breakpoints.
4. **Theming** — uso de tokens de design, dark mode, consistência de cor entre temas.
5. **Anti-patterns** — indicadores de geração por IA e práticas problemáticas.

**Bandas:** 18–20 excelente · 14–17 bom · 10–13 aceitável · 6–9 ruim · 0–5 crítico. Cada issue leva tag **P0–P3** por impacto/bloqueio.

## Passos

1. Colete a evidência mensurável por dimensão (contraste medido, métricas de perf, larguras fixas, uso de token, saída do detector).
2. Pontue cada dimensão 0–4 com justificativa citando a evidência.
3. Some o score de saúde e classifique na banda.
4. Liste issues com P0–P3.
5. **Documente evidência, não fixes** — o audit identifica o que é mensurável e recomenda os modos de remediação (`polish`, `colorize`, `harden`, `optimize`); ele não conserta.

## Enforcement automático

As dimensões de anti-patterns e parte de a11y/theming já têm cobertura determinística nos linters de `post-tool-use`: `std-design-antipatterns`, `std-visual-quality`, `std-accessibility`. Use a saída deles como evidência — não invente comandos `npx`.

## Regras guidance

O que os linters **não** decidem por arquivo, o audit mede na UI renderizada (todas `guidance` — DOM/computado/geometria/cross-file/tokens; ver `docs/design-rules-classification.md`):

- **Acessibilidade/contraste** — **low-contrast** e **gray-on-color**: contraste real do texto sobre o fundo efetivo (≥ 4.5:1 corpo, 3:1 grande/UI), resolvendo a cor pela cascade.
- **Responsivo/legibilidade geométrica** — **line-length** (~65–75ch renderizado), **cramped-padding**, **text-overflow**, **clipped-overflow-container**, **body-text-viewport-edge**, **tight-leading**.
- **Hierarquia** — **skipped-heading** resolvido cross-file na página montada; **oversized-h1** vs. proporção do viewport.
- **Theming/design system** — **design-system-font / -color / -radius**: fonte/cor/raio conferidos contra os tokens do `product-design-system` (cross-file), não valores soltos.

Regra do modo: saída de detector/QA é **evidência de defeito**, nunca prova de que a UI está pronta.
