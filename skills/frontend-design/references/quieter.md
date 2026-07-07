# quieter — reduzir intensidade visual (refinar, não apagar)

## Objetivo

Reduzir a intensidade visual de um design — deixá-lo refinado e sofisticado em vez de barulhento e sobre-estimulante — **preservando** personalidade e função. *"Design quieto é mais difícil que design bold: sutileza exige precisão."*

## Quando usar

Quando o design parece: brilhante/saturado/agressivo demais; poluído por elementos competindo; animado em excesso; ou cansativo de olhar por muito tempo.

## Grounding

Leia `@.context/product/product-design-system.md` (tokens/paleta) e `@.context/product/product-tone-of-voice.md`. Quieter não é despersonalizar — é baixar o volume mantendo a voz.

## Passos

1. **Registrar** o que "quieter" significa para esta marca/produto.
2. **Avaliar o estado atual** — identifique as fontes de intensidade: cor, contraste (excesso), peso, animação, complexidade, escala.
3. **Planejar o refino** — abordagem estratégica antes de mexer.
4. **Refinar sistematicamente** — cor (dessaturar/harmonizar), peso (menos negrito indiscriminado), simplificação, motion (menos e mais suave), composição.
5. **Verificar** — função, distinção e caráter permanecem intactos.

## Princípios

- *"Sutileza requer precisão. Quiet sem intenção colapsa para genérico."*
- Nunca cinza sobre fundo colorido — use um tom mais escuro do próprio fundo ou transparência.
- Não uniformizar tudo: preserve a hierarquia.
- Mantenha alguma personalidade; não elimine o caráter.

## Regras guidance

Baixar o volume sem cair no ilegível/genérico (regras `guidance` — ver `docs/design-rules-classification.md`):
- **low-contrast** — dessaturar não pode derrubar o contraste real abaixo de 4.5:1 (corpo) / 3:1 (grande/UI). Quiet ≠ apagado.
- **gray-on-color** — ao suavizar texto sobre cor, não vá para o cinza lavado; escureça o próprio fundo ou use alpha explícito.
- **dark-glow** — remover glow "AI" (fundo escuro + sombra colorida difusa) é exatamente o tipo de barulho que este modo apaga.
- **design-system-color** — a paleta mais quieta ainda sai dos tokens do `product-design-system`.
