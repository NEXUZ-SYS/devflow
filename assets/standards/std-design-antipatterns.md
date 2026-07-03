---
id: std-design-antipatterns
description: Detecção determinística de "AI tells" de design (slop) em front-end gerado por IA
version: 1.0.0
source: devflow-default
applyTo: ["**/*.{tsx,jsx,vue,svelte,html,css}"]
activation: on-demand
relatedAdrs: ["ADR-010", "ADR-002"]
enforcement:
  linter: machine/std-design-antipatterns.js
---
## Princípios

- Front-end gerado por IA tende a convergir para uma monocultura visual ("slop"); banir os "AI tells" mais reconhecíveis é o baseline
- Cor em OKLCH com contraste verificado (≥ 4.5:1 texto); gradiente só em superfícies, nunca em texto
- Tipografia com hierarquia real: par de famílias/pesos com contraste, não uma única fonte para tudo; evitar fontes saturadas de uso (Inter/Roboto/... por default)
- Espaçamento com ritmo intencional, não uma escala monótona repetida
- Bordas/acentos com propósito: sem faixa colorida grossa em um lado do card (side-tab), sem borda de acento colidindo com cantos arredondados
- Movimento com intenção: sem easing "bounce" por default; respeitar `prefers-reduced-motion`
- Cópia sem cadência de marketing genérica: evitar buzzword, em-dash em excesso, kickers numerados em toda seção
- As regras determinísticas complementam a orientação da skill `frontend-design` (que cobre os casos que exigem render/tokens) — ver [[external-design-toolkit-absorption]]

## Anti-patterns

| Anti-pattern | Correto |
|---|---|
| Texto com gradiente (`background-clip: text` sobre `linear-gradient`) | Cor sólida com contraste ≥ 4.5:1; gradiente só em superfícies |
| Faixa/borda colorida grossa em um lado do card (side-tab) | Remover ou suavizar; hierarquia por peso/tamanho, não por faixa |
| Uma única fonte para display e corpo | Par tipográfico com contraste de família/peso |
| Paleta "AI" (roxos saturados) / cream por default | Paleta intencional em OKLCH com contraste verificado |
| Easing `cubic-bezier` de bounce por default | Curvas naturais; `prefers-reduced-motion` como fallback |
| Kickers numerados / em-dash em excesso / buzzword na cópia | Cópia específica e direta; hierarquia por tipografia |

## Linter

`machine/std-design-antipatterns.js` — parsing estático puro (sem LLM, sem rede, sem DOM). Recebe o caminho do arquivo, emite `VIOLATION: <regra> — <hint>` e sai com código 1 ao encontrar um "tell". Cobre as regras de `slop` decidíveis por arquivo (ver `docs/design-rules-classification.md`); as que exigem estilo computado/geometria/tokens são orientadas pela skill `frontend-design`, não pelo linter. Regras provider-específicas (gpt/gemini) e de baixa severidade disparam como `[advisory]`. Regras portadas de [pbakaus/impeccable](https://github.com/pbakaus/impeccable) `@cli-v3.2.0` (Apache-2.0) — ver `NOTICE`.

## Waivers

Sistema único de waiver dos Standards (não há waiver paralelo). Para suprimir uma regra num caso legítimo, use o mecanismo de waiver de Standards do projeto; evite desligar a regra globalmente — prefira corrigir o "tell". A11y (contraste, ordem de heading, tamanho mínimo) mora no `std-accessibility`, não aqui.
