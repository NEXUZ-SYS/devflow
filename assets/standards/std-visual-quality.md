---
id: std-visual-quality
description: Legibilidade, tipografia e layout de qualidade (não-a11y) em front-end
version: 1.0.0
source: devflow-default
applyTo: ["**/*.{tsx,jsx,vue,svelte,html,css}"]
activation: on-demand
relatedAdrs: ["ADR-010", "ADR-002"]
enforcement:
  linter: machine/std-visual-quality.js
---
## Princípios

- Qualidade visual mensurável, complementar à acessibilidade: legibilidade e layout que a11y não cobre
- Comprimento de linha de leitura confortável (~65–75 caracteres) em blocos de corpo
- Evitar texto justificado na web (cria "rios" e prejudica a leitura); alinhar ao início
- Evitar caixa-alta em blocos de corpo; reservá-la para rótulos curtos
- Tracking (letter-spacing) dentro de faixa legível; sem espaçamento largo em corpo
- Imagens com `src` válido e resolvível; placeholder explícito só em estados de loading
- **Fronteira com `std-accessibility`:** contraste, ordem de heading e tamanho mínimo de fonte são **acessibilidade** e moram no `std-accessibility` — este std cuida de legibilidade e layout de qualidade

## Anti-patterns

| Anti-pattern | Correto |
|---|---|
| `text-align: justify` em corpo de texto na web | Alinhamento ao início (esquerda em LTR) |
| `text-transform: uppercase` em blocos de corpo | Caixa normal no corpo; caixa-alta só em rótulos curtos |
| `letter-spacing` largo em corpo | Tracking neutro/ligeiramente negativo conforme a fonte |
| `<img>` com `src` vazio, `#` ou placeholder fixo | `src` real; placeholder só em loading explícito |
| `transition: all` / transição de propriedades de layout | Transicionar propriedades específicas (opacity/transform) |

## Linter

`machine/std-visual-quality.js` — parsing estático puro (sem LLM, sem rede, sem DOM). Recebe o caminho do arquivo, emite `VIOLATION: <regra> — <hint>` e sai com código 1. Cobre as regras de `quality` não-a11y decidíveis por arquivo (ver `docs/design-rules-classification.md`). A heurística estática é mais ampla que a versão renderizada do upstream (pode gerar falsos positivos em casos de contexto), por isso opera em nível de aviso. Regras portadas de [pbakaus/impeccable](https://github.com/pbakaus/impeccable) `@cli-v3.2.0` (Apache-2.0) — ver `NOTICE`.

## Waivers

Sistema único de waiver dos Standards. Suprima uma regra em caso legítimo pelo mecanismo de waiver do projeto; prefira corrigir a legibilidade a desligar a regra.
