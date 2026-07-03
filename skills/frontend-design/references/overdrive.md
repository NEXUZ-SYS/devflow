# overdrive — o extraordinário além do convencional

## Objetivo

Elevar a experiência usando capacidades do navegador além do convencional — tabelas com milhões de linhas, diálogos que "morfam" do trigger, forms que validam com feedback em streaming, transições cinematográficas. A técnica serve à experiência, nunca o contrário.

## Quando usar

Quando você quer que a interface pareça **extraordinária** de um jeito que o usuário não espera de uma aplicação web. Reserve para superfícies onde o "wow" tem retorno real — não como default.

## Grounding

Leia `@.context/product/product-design-system.md` (a ambição visual tem de continuar on-brand) e `@.context/business/business-icp.md` (o "extraordinário" é relativo ao público — dado-pesado precisa de fluidez, superfície visual precisa de wow sensorial).

## Passos

1. **Avaliar o contexto** — decida o que "extraordinário" significa para **esta** interface (visual → wow sensorial; UI funcional → feel responsivo; dado-pesado → fluidez).
2. **Propor múltiplas direções** — 2–3 abordagens com técnicas, níveis de ambição e estéticas diferentes; explique os trade-offs.
3. **Obter confirmação** — **não** construa até o usuário escolher a direção.
4. **Iterar com automação de browser** — pré-visualize ativamente, verifique visualmente, refine várias vezes; "tecnicamente funciona" ≠ "parece extraordinário".
5. **Verificar** — device real, acessibilidade, performance suave.

## Princípios

- *"Progressive enhancement é inegociável"* — o básico funciona sem o wow.
- *"Mire 60fps; se cair abaixo de 50, simplifique"* (orçamento ~16ms/frame).
- *"Respeite `prefers-reduced-motion`, sempre."*
- *"O gap entre 'legal' e 'extraordinário' está nos últimos 20% de refino."*
- *"Foco cria impacto, excesso cria ruído."*

## Toolkit

View Transitions, animações scroll-driven, WebGL/WebGPU, virtual scrolling, Web Workers, spring physics, transições animadas de dados, device APIs. Efeitos caros (blur/filter/shadow) permanecem limitados a áreas isoladas — mesmo em overdrive, o orçamento de performance manda.
