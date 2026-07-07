# layout — estrutura espacial e ritmo

## Objetivo

Resolver problemas de layout na raiz — estrutura espacial, não estilo de superfície. Use quando a interface "parece errada" apesar de cor e tipo corretos, ou ao redesenhar a estrutura da página. Distingue **brand** (assimétrico, fluido) de **product** (previsível, consistente).

## Quando usar

- Espaçamento inconsistente, hierarquia sem clareza, ritmo estrutural ausente, densidade errada.
- Ao redesenhar a estrutura de uma página/tela.

## Grounding

Leia `@.context/product/product-design-system.md` (escala de espaçamento e raios saem dos tokens) e `@.context/.devflow.yaml` → `design.register` (brand vs. product muda a estratégia de layout).

## Passos

1. **Avaliar** — consistência de espaçamento, clareza de hierarquia, ritmo, densidade.
2. **Planejar** — sistema de espaçamento, estratégia de hierarquia, abordagem de layout, intenção de ritmo.
3. **Melhorar** — estabeleça tokens, crie ritmo, escolha a ferramenta (flex/grid), varie padrões de card, fortaleça a hierarquia.
4. **Verificar** — squint test, avaliação de ritmo, responsivo.

## Princípios (guarde os números)

**Escala de espaçamento:** base 4pt (4, 8, 12, 16, 24, 32, 48, 64, 96px); nomes semânticos (`--space-xs`…`--space-xl`), não números arbitrários; prefira `gap` (elimina margin collapse); `clamp()` para espaçamento fluido em telas grandes.

**Grid & estrutura:** Flexbox para 1D (linhas, nav, grupos de botão, interior de componente); Grid para 2D (páginas, dashboards); `grid-template-areas` para layouts complexos; container queries para responsivo de **componente**, viewport queries para **página**.

**Hierarquia:** razão de tamanho ≥ 3:1 para hierarquia forte; < 2:1 sinaliza fraqueza. Peso: Bold vs. Regular funciona, Medium vs. Regular não. Combine 2–3 dimensões (tamanho, peso, espaço, cor, posição). Espaço sozinho já cria hierarquia.

**Ritmo:** agrupamento apertado 8–12px entre irmãos relacionados; separação generosa 48–96px entre seções distintas; varie o espaçamento dentro das seções — gaps uniformes matam a hierarquia.

**Cards & componentes:** não trate card-grid como default; use card só para conteúdo distinto e acionável; **nunca** aninhe card dentro de card (use espaço/divisores); quebre monotonia variando tamanhos, spanning de colunas ou misturando card/não-card.

**Touch & óptico:** alvo mínimo 44×44px mesmo quando o elemento visual é menor (expanda a área com padding/pseudo-elemento); centre texto opticamente com ~-0.05em quando necessário; só ajuste ícone geometricamente centrado se estiver genuinamente torto.

**Proibições:** valores de espaçamento fora da escala; espaçamento igual em tudo; embrulhar tudo em card; card-grids idênticos repetidos; layout de card aninhado.

## Regras guidance

O que exige **geometria/DOM renderizado/cross-file/tokens** fica aqui (regras `guidance` — ver `docs/design-rules-classification.md`):
- **nested-cards** — sem card-dentro-de-card sem propósito (ancestralidade DOM + rect).
- **icon-tile-stack** — sem pilha vertical de tiles de ícone genéricos (geometria).
- **hero-eyebrow-chip** — sem eyebrow-chip ritualístico antes de todo hero (irmão antes do h1).
- **repeated-section-kickers** — sem "kickers" repetidos com o mesmo estilo antes de cada heading.
- **oversized-h1** — h1 renderizado não desproporcional ao viewport.
- **cramped-padding** — padding proporcional ao tamanho de fonte renderizado.
- **body-text-viewport-edge** — texto de corpo não encostando na borda do viewport.
- **clipped-overflow-container** — `overflow` não corta conteúdo válido nas bordas.
- **design-system-radius** — raios conferidos contra a escala de **tokens** do `product-design-system`, não valores soltos.
