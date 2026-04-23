# ADRs do Projeto

Decisoes arquiteturais ativas neste projeto.
A IA consulta este indice durante o context gathering do PREVC Planning.

## ADRs Ativas

| # | Titulo | Escopo | Status | Guardrails | Stack | Arquivo |
|---|--------|--------|--------|------------|-------|---------|
| 001 | TDD para Python | Projeto | Aprovado | 5 regras | Python | [001-tdd-python.md](001-tdd-python.md) |
| 002 | Code Review | Projeto | Aprovado | 4 regras | universal | [002-code-review.md](002-code-review.md) |

## Como a IA usa estas ADRs

1. No inicio do Planning phase, a IA le este README
2. Identifica ADRs relevantes pela stack e categoria da tarefa
3. Le os guardrails das ADRs aplicaveis
4. Aplica como restricoes durante brainstorming, design e implementacao
5. No Validation phase, verifica compliance com os guardrails

## Hierarquia de aplicacao

1. ADRs Organizacionais (scope: organizational) → baseline, aplicam sempre
2. ADRs de Projeto (scope: project) → podem refinar ou especializar as organizacionais
3. Em conflito: ADR de Projeto prevalece (deve referenciar qual organizacional sobrescreve via `superseded_by`)

## Fonte dos templates

Instanciadas a partir de `.context/templates/adrs/` (kit inicial do DevFlow).
