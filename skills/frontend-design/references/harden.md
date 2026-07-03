# harden — endurecer a UI contra o mundo real

## Objetivo

Deixar a interface production-ready, fortalecendo-a contra os desafios do mundo real — dados imperfeitos, erros, usuários diversos e rede não confiável. *"Designs que só funcionam com dados perfeitos não estão prontos para produção."*

## Quando usar

- Antes de shippar qualquer produto voltado ao usuário.
- Junto de revisões de design, antes do passe final de polish.
- Quando a feature funciona no "caminho feliz" mas não foi testada nas bordas.

## Grounding

Leia `@.context/product/product-tone-of-voice.md` (mensagens de erro têm de seguir a voz) e `@.context/business/business-icp.md` (que idiomas/dados/edge cases o público real gera).

## Passos

1. **Avaliar fraquezas** — teste entradas extremas: texto muito longo/curto, caracteres especiais, números grandes, estados vazios.
2. **Avaliar cenários de erro** — falha de rede, erro de API, validação, restrições de permissão.
3. **Testar i18n** — idiomas, expansão de texto (alemão +30%, francês +20%), RTL, conjuntos de caracteres.
4. **Implementar o hardening** através de: overflow de texto, tratamento de erro, edge cases, validação, acessibilidade.
5. **Verificar** com teste de edge case antes do handoff.

## Estados a cobrir

- **Erro** — mensagem clara, botão de retry, explica o que aconteceu (formule via `clarify`).
- **Loading** — mostra o que carrega, estimativa de tempo em operações longas.
- **Empty** — próximo passo claro quando não há dado.
- **Edge** — permissões, datasets grandes, operações concorrentes, condições de contorno.

Nunca: assumir input perfeito; ignorar i18n; usar mensagens de erro genéricas; esquecer o cenário offline; confiar só em validação client-side.

## Regras guidance

Endurecer é, por definição, garantir que texto e containers não quebrem sob dado real (regras `guidance` — exigem render/geometria; ver `docs/design-rules-classification.md`):
- **text-overflow** — texto longo (nome, e-mail, tradução expandida) não pode transbordar/cortar; teste `scrollWidth` vs `clientWidth`.
- **clipped-overflow-container** — `overflow: hidden` não pode engolir conteúdo válido nas bordas; verifique geometria do filho.
- **line-length** — mesmo com conteúdo dinâmico, a medida renderizada fica ~65–75ch; conteúdo longo não estica a linha até ficar ilegível.
- **body-text-viewport-edge** — em telas estreitas (320px), o texto não encosta na borda do viewport.
