---
id: std-internationalization
description: Strings, formatações e locales tratados de forma locale-aware e sem hard-code
version: 1.1.0
source: devflow-default
applyTo: ["**/*.{tsx,jsx,ts}"]
activation: on-demand
relatedAdrs: []
enforcement:
  linter: machine/std-internationalization.js
---
## Princípios

- Nunca hard-code string user-facing em código; toda string visível ao usuário passa por função de tradução (`t('key')`)
- Use chaves semânticas e namespaced por feature: `checkout.payment.error.cardDeclined`, nunca a string em inglês como chave
- Nunca concatene fragmentos traduzidos para formar frase; use uma única chave com placeholders interpolados (`{userName}`, `{count}`)
- Use ICU MessageFormat para plurais e variações por gênero; nunca `if (count === 1)`
- Formatos locale-aware via API `Intl` nativa: `Intl.DateTimeFormat`, `Intl.NumberFormat`, `Intl.RelativeTimeFormat`
- Nunca formate moeda com concatenação manual de símbolo e número — use `Intl.NumberFormat` com `style: 'currency'`
- Armazene sempre em UTC no banco e APIs; converta para o fuso do usuário apenas na borda de apresentação (UI, e-mail)
- Defina `lang` no elemento `<html>` com o locale BCP 47 ativo; emita `<link rel="alternate" hreflang="...">` para cada variante
- Use CSS logical properties (`margin-inline-start`, `padding-block-end`) em vez de `left`/`right` para suportar RTL
- Normalize todo input de usuário para NFC antes de comparar, armazenar ou hashear
- Nunca assuma largura de texto: traduções expandem (alemão ~+30%); layout não pode quebrar nem truncar sem `title`/tooltip
- Catálogo de chaves sem tradução faz fallback explícito ao locale default, nunca renderiza a chave crua na UI

## Anti-patterns

| Errado | Corrija para |
|---|---|
| `"Seu pedido foi criado"` hard-coded | `t('orders.created.success')` com chave no catálogo |
| `"Olá " + nome` como string traduzida | `t('greeting', { name })` com placeholder |
| `if (count === 1) "item" else "itens"` | ICU plural: `{count, plural, one {# item} other {# itens}}` |
| `"$" + value.toFixed(2)` | `Intl.NumberFormat(locale, { style: 'currency', currency: 'BRL' })` |
| Timestamp sem timezone armazenado | ISO 8601 com `Z` ou offset explícito; converter apenas na UI |
| `margin-left: 16px` em componente que precisa suportar RTL | `margin-inline-start: 16px` |
