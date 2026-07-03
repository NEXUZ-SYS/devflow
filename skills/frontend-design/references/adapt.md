# adapt — repensar a experiência para novos contextos

## Objetivo

Repensar a experiência para um novo contexto (mobile↔desktop, plataforma, cenário de uso) — **não** esticar pixels. Adaptação exige estratégia apropriada ao contexto, não escala uniforme.

## Quando usar

- Ao mover um design entre devices/plataformas/cenários.
- Quando o layout "funciona" numa largura mas quebra ou fica inapropriado noutra.

## Grounding

Leia `@.context/business/business-icp.md` (em que contexto o público real usa — mão única no celular? mesa com teclado?) e `@.context/product/product-design-system.md` (breakpoints/tokens fluidos documentados).

## Passos

1. **Avaliar** — contexto de origem (plataforma, suposições, forças) e de destino (device, input, tela, conexão, uso, expectativa). Aponte o que não cabe/não funciona/parece inapropriado.
2. **Planejar por contexto** — mobile: coluna única, alvos 44×44px, disclosure progressivo; tablet: híbrido de duas colunas, retrato/paisagem; desktop: multi-coluna, hover, atalhos; print: quebras de página, sem interatividade; e-mail: 600px máx, layout em tabela.
3. **Implementar** — breakpoints **content-driven** (onde o design quebra), Grid/Flexbox, container queries, `clamp()`; adapte touch targets/espaçamento/navegação; imagens responsivas (`srcset`, `<picture>`).
4. **Verificar** — device real, orientações, browsers, métodos de input; edge cases (320px, 4K, rede lenta).

## Regras (guarde)

**Breakpoints (content-driven):** mobile 320–767px · tablet 768–1023px · desktop 1024px+.

**Touch targets:** mínimo 44×44px (não dependente de hover); mais espaço entre interativos.

**Detecção de input:** `@media (pointer: coarse|fine)`, `@media (hover: hover|none)`.

**Safe areas:** `env(safe-area-inset-*)` + `<meta name="viewport" content="viewport-fit=cover">`.

**Imagens:** `srcset="img-400.jpg 400w, img-800.jpg 800w"`; `<picture>` para art direction.

**Mobile-first:** estilos base para mobile; suba complexidade com `min-width` (não `max-width`).

**DON'Ts:** esconder função central no mobile (faça funcionar); assumir desktop = device potente; mesma arquitetura de informação em todo contexto; ignorar paisagem; depender de hover para função.

## Nota

Emulação de device erra o toque real, o CPU, a latência e o rendering de fonte. Teste em device real. Adaptar bem cruza com `harden` (texto expandido em telas estreitas → `text-overflow`, `body-text-viewport-edge`).
