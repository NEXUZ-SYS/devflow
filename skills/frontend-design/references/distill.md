# distill — destilar o design à sua essência

## Objetivo

Reduzir o design ao núcleo funcional removendo o desnecessário — poluição visual, informação redundante e features que não servem ao objetivo primário do usuário. *"Simplicidade não é remover features; é remover os obstáculos entre o usuário e seus objetivos."*

## Quando usar

- Quando o design parece complicado/poluído demais.
- Antes do passe final de polish.
- Quando houve acúmulo de feature creep.
- Para acelerar a conclusão de tarefas do usuário.

## Grounding

Leia `@.context/business/business-icp.md` (qual é o JTBD central — o que sobra depois de destilar) e `@.context/product/product-design-system.md` (tokens, para consolidar em vez de proliferar variações).

## Passos

1. **Avaliar o estado atual** — identifique as fontes de complexidade (elementos competindo, variação excessiva, sobrecarga de informação, ruído visual, hierarquia confusa, feature creep) e ache os 20% essenciais.
2. **Planejar a simplificação** — defina o **único** propósito central, os elementos essenciais e o que pode ser escondido ou consolidado.
3. **Simplificar sistematicamente** — seis dimensões: arquitetura de informação, design visual, layout, interações, conteúdo, código.
4. **Verificar** — a simplificação melhora a conclusão de tarefas, reduz carga cognitiva, mantém a função e clareia a hierarquia.
5. **Documentar as mudanças** — registre o que foi removido e por quê.

## Princípios

- *"A perfeição é atingida não quando não há mais nada a acrescentar, mas quando não há mais nada a remover."*
- Simplificar é difícil: exige dizer não a boas ideias para dar espaço à ótima execução.

## Regras guidance

Destilar é também consolidar valores dispersos em tokens (regras `guidance` — cross-file contra os tokens; ver `docs/design-rules-classification.md`):
- **design-system-color / -font / -radius** — ao reduzir a variação, colapse cores/fontes/raios divergentes nos tokens canônicos do `product-design-system` em vez de manter três quase-iguais.
- **nested-cards** — remover aninhamento de card sem propósito é destilação pura de composição.
