# onboard — desenhar o onboarding do usuário

## Objetivo

Desenhar um onboarding eficaz que leve o usuário ao "aha moment" o mais rápido possível — em vez de ensinar o produto inteiro. *"Leve o usuário ao primeiro valor o mais rápido possível."*

## Quando usar

- Onboarding inicial de usuários novos.
- Descoberta/adoção de feature por usuários existentes.
- Interfaces complexas que precisam de introdução guiada.
- Mudanças significativas de produto ou releases novos.

## Grounding

Leia `@.context/business/business-icp.md` (JTBD, nível de experiência, motivação, tempo disponível — o "aha" é relativo ao ICP) e `@.context/product/product-tone-of-voice.md` (o onboarding é a primeira voz que o usuário ouve).

## Passos

1. **Avaliar a necessidade** — identifique o desafio (objetivos, pontos de confusão, onde há drop-off), entenda os usuários e defina as métricas de sucesso (aprendizado mínimo, ações-chave, indicadores de conclusão).
2. **Escolher o tipo** — welcome screen com proposta de valor; setup de conta (campos mínimos); introdução de conceito central (**1–3 conceitos no máximo**); empty state com CTA; tooltips contextuais no momento da necessidade; tour guiado para features complexas; tutorial interativo hands-on.
3. **Implementar e medir** — persista o estado de conclusão (ex.: localStorage), respeite dismissals (nunca repita o que já foi mostrado), rastreie taxa de conclusão, tempo-até-valor e taxa de skip.
4. **Verificar** — teste o tempo de conclusão com usuários reais, meça compreensão e ações desejadas, itere pelos pontos de drop-off.

## Princípios

- *"Mostre, não conte."*
- *"Torne opcional quando possível."*
- *"Ensine os 20% que entregam 80% do valor."*
- *"Contexto sobre cerimônia."* / *"Respeite a inteligência do usuário."*

## Nota

Empty states de onboarding são um dos maiores pontos de valor — em vez de "Nenhum item", use "Ainda sem projetos. Crie o primeiro para começar" (reconhecer + valor + ação; formule via `clarify`).
