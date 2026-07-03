---
id: std-accessibility
description: WCAG 2.2 AA em todo fluxo de UI — a11y é requisito funcional, não polimento
version: 1.2.0
source: devflow-default
applyTo: ["**/*.{tsx,jsx,css,html}"]
activation: on-demand
relatedAdrs: ["ADR-010"]
enforcement:
  linter: machine/std-accessibility.js
---
<!-- v1.2.0: linter absorve as regras a11y estáticas do impeccable (skipped-heading, tiny-text);
     applyTo ampliado p/ css/html. Regras JSX (div/span onClick sem role, tabIndex+, img sem alt)
     preservadas e rodam só em tsx/jsx. Ver ADR-010 e docs/design-rules-classification.md. -->

## Princípios

- Baseline obrigatório: WCAG 2.2 nível AA em todo fluxo público; bug de acessibilidade tem severidade igual a bug funcional
- Use o elemento HTML nativo correto antes de ARIA: `<button>` para ações, `<a href>` para navegação, `<input>` para entrada, landmarks semânticos (`<nav>`, `<main>`, `<header>`)
- Nunca `<div onClick>` ou `<span onClick>` como botão — refatore para `<button>` que traz foco, teclado e role nativamente
- Forneça nome acessível a todo elemento interativo: texto visível, `aria-label`, `aria-labelledby` ou `<label>`
- Indicador de foco visível em todo elemento interativo; contraste do anel de foco ≥ 3:1; nunca `outline: none` sem substituto
- Hierarquia de headings sem pular níveis descendentes; exatamente um `<h1>` por página
- Contraste mínimo 4.5:1 para texto normal e 3:1 para texto grande e componentes de UI
- Nunca transmita informação apenas por cor — use texto/ícone além da cor
- `alt` em toda `<img>`; decorativas usam `alt=""` (vazio, sem omitir o atributo)
- Skip link "Skip to main content" como primeiro elemento focável da página
- Todo fluxo é operável só por teclado: ordem de foco lógica, sem trap, `Escape` fecha overlays e devolve o foco ao gatilho
- Mudanças dinâmicas (erro de form, toast, loading) anunciadas via `aria-live`; nunca dependa só de mudança visual

## Anti-patterns

| Errado | Corrija para |
|---|---|
| `<div onClick={handler}>` | `<button onClick={handler}>` |
| `placeholder` como substituto de `<label>` | `<label for="input-id">` associado ao input |
| `tabindex="1"` positivo | `tabindex="0"` (ordem natural) ou `tabindex="-1"` (programático) |
| `outline: none` sem substituto | `:focus-visible { ring: 2px ... }` com contraste ≥ 3:1 |
| Pular de `<h2>` para `<h4>` | Hierarquia sequencial de headings |
| Ícone-botão sem nome acessível | `aria-label="Fechar modal"` no botão |
| Cor vermelha como único indicador de erro | Cor + ícone + texto descritivo do erro |
