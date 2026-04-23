---
type: adr
name: <slug-do-adr>
description: <resumo em uma linha do que esta ADR decide>
scope: organizational   # organizational | project
source: local           # local | external
stack: <linguagem/plataforma ou "universal">
category: <principios-codigo | qualidade-testes | arquitetura | seguranca | infraestrutura>
status: Proposto        # Proposto | Aprovado | Substituido | Descontinuado
created: YYYY-MM-DD
---

# ADR — <Título Curto da Decisão>

- **Data:** YYYY-MM-DD
- **Status:** Proposto
- **Escopo:** <Organizacional | Projeto>
- **Stack:** <Python | Node | universal | ...>
- **Categoria:** <Princípios de Código | Qualidade & Testes | Arquitetura | Segurança | Infraestrutura>

---

## Contexto

<Descreva o problema, a motivação e as forças em jogo. Qual dor recorrente ou risco estamos endereçando? Qual o estado atual sem esta decisão?>

## Decisão

<Descreva a decisão adotada em linguagem afirmativa e direta. Um leitor deve entender exatamente o que foi escolhido — sem ambiguidade.>

## Alternativas Consideradas

- **<Alternativa 1>** — <por que foi descartada ou tradeoff>
- **<Alternativa 2>** — <por que foi descartada ou tradeoff>
- **<Alternativa escolhida>** — <por que venceu>

## Consequências

<Liste impactos positivos e negativos. Inclua custos (curva de aprendizado, refatorações, infra adicional) e benefícios (testabilidade, segurança, performance, DX).>

- <Consequência positiva>
- <Consequência negativa / custo>
- <Risco residual aceito>

## Guardrails

<Regras acionáveis que a IA e o time DEVEM seguir. Use verbos imperativos: SEMPRE, NUNCA, QUANDO X ENTÃO Y. Cada guardrail precisa ser verificável em code review.>

- SEMPRE <regra positiva obrigatória>
- NUNCA <padrão proibido>
- QUANDO <gatilho>, ENTÃO <ação requerida>
- <... adicione quantas regras forem necessárias, evite duplicatas>

## Enforcement

<Como esta ADR será verificada na prática. Liste mecanismos concretos — code review, lint, teste automatizado, gate de CI, fase PREVC.>

- [ ] Code review: <item verificável>
- [ ] Lint/Static analysis: <regra ou ferramenta>
- [ ] Teste automatizado: <o que deve estar coberto>
- [ ] Gate PREVC: <em qual fase e o que checar>

## Relacionamentos

| Tipo              | Referência                                    |
|-------------------|-----------------------------------------------|
| Docs externos     | <link para especificação, livro, RFC>         |
| ADRs relacionadas | <slug-de-adr-relacionada>                     |
| ADRs substituídas | <slug-da-adr-antiga, se aplicável>            |

## Evidências / Anexos

<Exemplos de código, diagramas, benchmarks, prints — qualquer material que ajude o leitor a aplicar a decisão corretamente.>

```<linguagem>
// exemplo mínimo que demonstra a aplicação correta
```
