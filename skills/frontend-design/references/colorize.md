# colorize — introduzir cor com estratégia

## Objetivo

Introduzir cor estratégica numa interface que sofre de monotonia em escala de cinza ou de um único accent tímido — cor que reforça **hierarquia, significado e engajamento**, não decoração. Aplicar antes do passe final de polish.

## Quando usar

- UI cinza/monótona, ou com um só accent sem sistema.
- Quando o usuário pede "arruma as cores" / "colore isso".

## Grounding

Leia `@.context/product/product-design-system.md` — a paleta e os tokens de cor **saem daqui**. Não invente uma paleta paralela; estenda a documentada. Leia também `@.context/business/business-icp.md` (semântica de cor sensível ao domínio).

## Passos

1. **Avaliar** o estado de cor atual e onde cor agrega valor semântico ou wayfinding.
2. **Planejar** a paleta (2–4 cores além dos neutros) com papéis dominante/secundário/accent.
3. **Introduzir** cor sistematicamente: estados semânticos, accents, backgrounds, tipografia, data-viz.
4. **Balancear** pela regra 60–30–10 e garantir acessibilidade.
5. **Verificar** que hierarquia/significado/engajamento melhoram sem sobrecarregar.
6. **Handoff** para `polish`.

## Princípios (guarde os números)

**Espaço de cor:** use **OKLCH**, não HSL — é perceptualmente uniforme (passos iguais de lightness *parecem* iguais). Chroma ~0–0.4; reduza o chroma ao se aproximar de branco/preto. Neutros tingidos: +0.005–0.015 de chroma na direção do hue da marca.

**Contraste (WCAG AA):** corpo **≥ 4.5:1**; texto grande (18px+ ou 14px bold) e componentes de UI **≥ 3:1**. Falha #1: texto cinza claro sobre branco. Não confie só na cor — some ícone/label/padrão (8% dos homens não distinguem vermelho/verde). Evite azul-sobre-vermelho (vibração).

**Estrutura de paleta:** primary (1 cor, 3–5 shades), neutral (escala de 9–11), semânticas (4 cores, 2–3 shades — verde=sucesso, vermelho=erro, âmbar=aviso, azul=info, cinza=inativo), surface (2–3 níveis).

**60–30–10:** 60% neutro de fundo, 30% cor secundária, 10% accent. No register `product`, accent é reservado a **ação primária, seleção atual e indicador de estado** — não decoração.

**Dark mode** é redesign, não inversão: escala de surface onde elevações maiores são mais claras (ex.: 15%/20%/25% de lightness), mesmo hue/chroma do light, só variando lightness; reduza levemente o peso do corpo (ex.: 350 em vez de 400).

**Anti-slop:** sem default-warm-tint (`oklch(97% 0.01 60)` e vizinhos); sem gradiente roxo-azul; sem borda-lateral (`border-left/right`) > 1px como stripe de accent; transparência pesada é sinal de paleta incompleta — defina cores de overlay explícitas.

## Regras guidance

Os linters pegam a cor **literal** (hue roxo/ciano, creme); o que exige a cor **resolvida pela cascade** fica aqui (regras `guidance` — ver `docs/design-rules-classification.md`):
- **low-contrast** — contraste real do texto sobre o fundo **efetivo** (resolvido por ancestrais) ≥ 4.5:1 / 3:1. Cor literal pode enganar; meça a computada.
- **gray-on-color** — nunca texto cinza sobre fundo colorido (fica lavado) — o smell exige o chroma do texto + o background do ancestral resolvidos.
- **dark-glow** — sem glow difuso colorido sobre fundo escuro (exige a luminância do ancestral).
- **design-system-color** — toda cor introduzida sai dos **tokens** do `product-design-system` (coerência cross-file), não de hex avulso.
