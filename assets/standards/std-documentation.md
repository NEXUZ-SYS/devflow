---
id: std-documentation
description: Documente o porquê, não o quê — código autoexplicativo vence comentário
version: 1.1.0
source: devflow-default
applyTo: ["**/*.{ts,tsx,js,jsx,py,go}"]
activation: on-demand
relatedAdrs: []
enforcement:
  linter: null
weakStandardWarning: true
---
## Princípios

- Prefira nomes claros a comentários explicativos; extraia funções nomeadas em vez de comentar blocos
- Documente o **porquê** quando a decisão não for óbvia pelo código; nunca documente o que o código já diz
- Documente invariantes não-óbvias (pré-condições, pós-condições, side effects), workarounds com link para issue, e APIs públicas consumidas fora do módulo
- Nunca mantenha comentário desatualizado: apague ou atualize; conviver com doc errada é pior que sem doc
- Use TSDoc em funções, classes e tipos exportados consumidos por outros módulos; inclua `@example` em utilitários reutilizados
- Prefixe workarounds com `// HACK:`, `// FIXME:` ou `// TODO:` com link para issue rastreável e dono identificável
- Nunca duplique documentação upstream de bibliotecas — referencie a fonte oficial
- Apague código comentado — confie no git; código morto em comentário não é histórico, é ruído
- Não documente roadmap futuro dentro do código — use issues ou ADRs
- Docs de API pública atualizadas no mesmo PR da mudança de contrato
- Decisão arquitetural relevante mora em ADR, não em comentário de código — o comentário aponta para o ADR
- README do módulo responde "o que é, por que existe, como usar"; um exemplo executável vale mais que três parágrafos

## Anti-patterns

| Errado | Corrija para |
|---|---|
| `// faz um chunk` antes de `chunk(ids, 10)` | Remover: o código é autoexplicativo |
| `// TODO` sem dono e sem issue | `// TODO: [github.com/org/repo/issues/123] descrição` |
| Comentário que repete a assinatura da função | Remover: TSDoc do próprio código já serve |
| Doc de lib duplicada manualmente no projeto | Link para docs oficiais da versão instalada |
| Código comentado sobrevivendo em main | `git rm` — o histórico preserva |
| Comentário desatualizado descrevendo comportamento antigo | Atualizar no mesmo PR da mudança |
