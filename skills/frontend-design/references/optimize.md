# optimize — performance de front-end (medir primeiro)

## Objetivo

Diagnosticar e corrigir problemas **reais** de performance de UI. Filosofia central: **meça primeiro**, identifique o gargalo real, então otimize — sem esforço desperdiçado em área que não é problema.

## Quando usar

- Usuários relatam lentidão/interação travada.
- Core Web Vitals precisam melhorar; load time acima do aceitável.
- Antes de aplicar qualquer estratégia de otimização (para ter baseline).

## Grounding

Leia `@.context/business/business-icp.md` — o público real define o alvo (device low-end? rede lenta?). Otimizar para o flagship enquanto o ICP usa 3G é otimizar para a pessoa errada.

## Passos

1. **Avaliar** — meça as métricas atuais (LCP, INP/FID, CLS, load time, bundle). Identifique o que é lento e a causa raiz. **Meça antes e depois**; evite otimização prematura.
2. **Otimizar loading** — formatos de imagem modernos com sizing responsivo; split e lazy-load de JS; elimine CSS não usado, inline do crítico; `font-display: swap`; priorize recursos críticos.
3. **Otimizar rendering** — agrupe leituras de DOM antes das escritas (evita layout thrashing); `contain` e `content-visibility` para regiões independentes; virtual scrolling em listas longas; anime com `transform`/`opacity`, nunca propriedade de layout.
4. **Monitorar e verificar** — DevTools, Lighthouse, WebPageTest; teste em device real com rede real; compare antes/depois.

## Thresholds (guarde)

- **LCP < 2.5s** · **INP < 200ms** (FID < 100ms) · **CLS < 0.1**.
- **~16ms por frame** para 60fps.
- Compressão de imagem: 80–85% de qualidade costuma ser imperceptível.

## Princípios

Meça o gargalo real antes de otimizar; priorize a performance percebida pelo usuário sobre micro-otimização; teste em device low-end e conexão lenta, não só no hardware topo; **nunca** sacrifique acessibilidade ou função por velocidade. Motion e otimização se cruzam — animar propriedade de layout é bug de performance **e** de motion (ver `animate.md`).
