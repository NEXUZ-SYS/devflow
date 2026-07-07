# polish — refino final alinhado ao design system

## Objetivo

Levar uma UI funcionalmente completa ao acabamento final, **alinhando ao design system** em vez de decorar por cima do drift. Máxima do modo: *"polish sem alinhamento é decoração sobre drift"*. Polish é o último passo, depois de a feature funcionar — não um verniz sobre trabalho incompleto.

## Quando usar

- Quando a feature está funcional e completa e falta o acabamento.
- Depois de `critique`/`audit`, para fechar as issues P2–P3 de refino.
- Nunca sobre trabalho incompleto (gaps funcionais vêm antes — use `harden`).

## Grounding

Leia `@.context/product/product-design-system.md` (tokens/componentes) e `@.context/product/product-tone-of-voice.md` (consistência de copy). Polish confere contra o sistema documentado — sem ele, você estaria adivinhando os princípios.

## Passos

1. **Descobrir o design system** — localize e estude os padrões existentes antes de mudar qualquer coisa. Não adivinhe princípios.
2. **Avaliação pré-polish** — verifique que a feature está funcionalmente completa e estabeleça a régua de qualidade. Se há gap funcional, pare e resolva antes.
3. **Polish sistemático** — percorra as dimensões: alinhamento, espaçamento, tipografia, contraste de cor, estados de interação (hover/focus/active/disabled/loading), transições, consistência de copy, forms, tratamento de erro, responsivo, qualidade de código.
4. **Nomear a causa do drift** — quando encontrar drift, nomeie a causa raiz (token faltando, componente compartilhado não usado, desalinhamento conceitual). *"Consertar o sintoma sem nomear a causa é como o drift se acumula."*
5. **Testar de verdade** — em device real, usando a feature você mesmo; não confie só em automação.

## Fronteiras (não faça)

Não polir trabalho incompleto; não adivinhar princípios do design system; não criar componente novo quando existe um compartilhado equivalente; não gastar tempo desproporcional em detalhe cosmético enquanto há gap funcional. Qualidade deve ser **consistente** no produto, não perfeita em ilhas.

## Regras guidance

Como polish é literalmente alinhamento ao sistema, as regras de design system são o coração do modo (todas `guidance` — cross-file contra os tokens; ver `docs/design-rules-classification.md`):
- **design-system-font** — toda fonte/peso vem de um token de tipografia; sem família solta.
- **design-system-color** — toda cor vem da paleta de tokens; sem hex avulso.
- **design-system-radius** — todo raio vem da escala; sem valor arbitrário.

E o acabamento renderizado que os linters não pegam:
- **tight-leading** — leading confortável no texto de corpo (~1.5–1.7).
- **cramped-padding** — padding proporcional ao tamanho de fonte.
- **low-contrast / gray-on-color** — contraste real ≥ 4.5:1; sem cinza-sobre-cor.
