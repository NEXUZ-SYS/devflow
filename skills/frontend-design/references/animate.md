# animate — motion com propósito

## Objetivo

Adicionar movimento **com propósito** a uma interface — comunicar estado, dar feedback, clarear hierarquia — e não efeito decorativo. Motion serve à função; quando é só enfeite, cansa.

## Quando usar

- Áreas estáticas sem feedback, transições bruscas, relações pouco claras, orientação faltando.
- Ao projetar ou implementar animação que precise de timing/easing consistentes.

## Grounding

Leia `@.context/product/product-design-system.md` (energia de motion documentada; register `product` = 150–250ms funcional, register `brand` = mais expressivo) e `@.context/business/business-icp.md` (audiência/orçamento de performance).

## Passos

1. **Avaliar oportunidades** — áreas estáticas sem feedback, transições bruscas, relações não-óbvias. Entenda personalidade, orçamento de performance, audiência, prioridade.
2. **Planejar a estratégia** — defina **um** hero moment, mapeie as interações de feedback e as transições de mudança de estado; reserve os momentos de delight para alto impacto.
3. **Implementar sistematicamente** — categorias: entrada, micro-interação, transição de estado, navegação, feedback, delight.
4. **Executar tecnicamente** — CSS vs. JS, aplicar timing/easing, otimizar performance, respeitar acessibilidade.
5. **Verificar** — 60fps, feel natural, timing apropriado, `prefers-reduced-motion`, não-bloqueante, valor genuíno.

## Princípios (guarde os números)

**Durações (regra 100/300/500):** 100–150ms feedback instantâneo (botão, toggle) · 200–300ms mudança de estado (menu, tooltip) · 300–500ms mudança de layout (accordion, modal) · 500–800ms entrada (page load, hero). Evite > 500ms para feedback (parece lento). Saída ~75% da duração de entrada. Abaixo de ~80ms o cérebro percebe como instantâneo.

**Easing:** `cubic-bezier(0.25, 1, 0.5, 1)` (desaceleração suave), `(0.22, 1, 0.36, 1)` (mais snappy), `(0.16, 1, 0.3, 1)` (decidido). **Nunca** bounce/elastic (datado).

**Propriedade de layout:** não anime `width`/`height`/`top`/`left`/margin casualmente — use `transform`, FLIP, ou técnicas de grid.

**Performance:** `will-change` com parcimônia (nunca preventivo na página toda); Intersection Observer para scroll (unobserve após disparar); efeitos caros (blur/filter/shadow) limitados a áreas pequenas; monitore 60fps.

**Stagger:** limite o total — 10 itens × 50ms = 500ms; para mais itens, reduza o delay por item ou limite a contagem.

**Reduced-motion (obrigatório):** respeite `prefers-reduced-motion` — `animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important;`.

**z-index semântico:** camadas por papel (base / conteúdo / overlay / modal / toast), não números mágicos crescentes — motion que empilha respeita a ordem semântica.

Proibições: animar sem propósito; ignorar `prefers-reduced-motion`; animar todo elemento (fadiga); bloquear a interação durante a animação (a menos que intencional).
