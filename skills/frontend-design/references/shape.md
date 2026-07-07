# shape — dar forma ao design antes de implementar

## Objetivo

Modelar a UX/UI **antes de qualquer implementação**, produzindo um **briefing de design** estruturado que guia o desenvolvimento por descoberta, não por chute. A premissa: a maioria das UIs geradas por IA falha não por código ruim, mas por **pensamento pulado**. O `shape` força o pensamento para frente.

## Quando usar

- No início de qualquer feature de UI relevante (é pré-requisito do `craft`).
- Quando o pedido do usuário é vago em escopo, conteúdo ou direção visual.
- Antes de escrever a primeira linha de código de uma tela nova.

## Grounding

Antes de perguntar qualquer coisa, absorva o knowledge para não perguntar o que já está documentado:
- `@.context/product/product-design-system.md` — tokens e princípios visuais.
- `@.context/product/product-tone-of-voice.md` — voz/tom.
- `@.context/business/business-icp.md` — persona/JTBD/contexto de uso.

## Passos

### Passo 1 — Entrevista de descoberta

Priorize entendimento sobre suposição. Faça **2–3 perguntas por rodada**, em diálogo natural, cobrindo:
- Propósito, audiência e métricas de sucesso.
- Escopo de conteúdo e faixas realistas de dados (quantos itens? textos curtos/longos?).
- Direção visual (estratégia de cor, contexto de cena, referências-âncora).
- Definição de escopo (fidelidade, amplitude, interatividade).
- Restrições técnicas e de conteúdo.

### Passo 1.5 — Sondagens de direção visual (quando cabível)

Para trabalho net-new, direcionalmente ambíguo, em fidelidade média ou maior: apresente **2–4 sondagens visuais** testando lanes diferentes antes de fechar o briefing.

### Passo 2 — Briefing de design + gate de confirmação

Apresente o briefing (forma **compacta** para tasks claras; **estruturada** para ambíguas/multi-tela) e **pare para confirmação explícita** antes de qualquer implementação. **Regra crítica: não codar na mesma resposta do briefing.** A pausa é a disciplina que faz o processo funcionar.

## Estrutura do briefing

Resumo da feature · ação primária do usuário · direção de design · escopo · estratégia de layout · estados-chave · modelo de interação · requisitos de conteúdo · referências de modo recomendadas · perguntas em aberto.

## Saída

Um briefing confirmado que vira o **contrato** para o `craft` (composição, hierarquia, densidade, atmosfera). Sem briefing confirmado, o `craft` não avança para código.
