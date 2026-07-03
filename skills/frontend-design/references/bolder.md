# bolder — amplificar impacto visual (sem virar circo)

## Objetivo

Amplificar o impacto visual por decisões intencionais — hierarquia, proporção, contraste, clareza — e não por efeitos da moda. É o contra-veneno dos defaults de IA (gradientes, glassmorphism, neon). *"Bolder não significa caótico ou berrante; significa distintivo, memorável e confiante."*

## Quando usar

- Quando um design parece seguro, genérico ou sem convicção.
- Antes de introduzir linguagem visual nova — primeiro fortaleça o que já existe dentro do design system.

## Grounding

Leia `@.context/product/product-design-system.md` (tokens/limites) e `@.context/business/business-icp.md` (para quem, quanta ousadia cabe). No register `product`, ousadia é densidade e decisão; no register `brand`, é atmosfera e assinatura.

## Passos

1. **Registrar o briefing** — defina o que "bolder" significa para **esta** marca e produto (ponto de vista distintivo, não teatro).
2. **Avaliar o estado atual** — identifique as fontes de fraqueza: escolhas genéricas, escala tímida, baixo contraste, composição estática, padrões previsíveis, hierarquia chapada.
3. **Design-system lock** — respeite tokens, componentes e convenções documentados. Amplifique dentro dos limites antes de expandir; pergunte antes de adicionar primitivas não-documentadas.
4. **Planejar a amplificação** — escolha **um** ponto focal. Decida quais alavancas do sistema (tipografia, cor, espaço, superfície, motion, composição) podem carregar mais peso — sem prejudicar usabilidade.
5. **Amplificar sistematicamente** — hierarquia tipográfica, uso decisivo de cor, contraste espacial, superfícies intencionais, motion contido, composição coerente.
6. **Verificar** — fiel ao sistema, sem drift não-documentado, clareza funcional preservada, memorável, sem estética de slop.

## Princípios

- *"Bold significa distintivo, não 'mais efeitos'."*
- *"Se todo elemento fica mais alto, a composição não fica mais bold; fica mais chapada."*
- Impacto sem função é só decoração.

## Regras guidance

Ousar sem quebrar (regras `guidance` — ver `docs/design-rules-classification.md`):
- **oversized-h1** — ampliar a hierarquia não é inchar o h1 além da proporção do viewport; bold é razão entre níveis, não tamanho absoluto do maior.
- **low-contrast** — cor decisiva tem de manter contraste real ≥ 4.5:1; ousadia não justifica texto ilegível.
- **design-system-color / -font / -radius** — amplifique **usando** os tokens do `product-design-system`; primitiva nova só com consentimento.
