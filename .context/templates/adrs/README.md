# ADR Templates Organizacionais

Templates de boas praticas segmentados por stack e dominio.
Usados pelo `/devflow prd` para recomendar ADRs ao projeto.

## Como Funcionar

1. Apos gerar o PRD, o DevFlow analisa a stack do projeto
2. Cruza a stack com os templates disponiveis
3. Recomenda ADRs relevantes ao usuario
4. Templates aceitos sao copiados para `.context/docs/adrs/` do projeto

## Templates Disponiveis

| Categoria            | Template             | Stack     | Guardrails |
|----------------------|----------------------|-----------|------------|
| Principios de Codigo | solid-python         | Python    | 8 regras   |
| Qualidade & Testes   | tdd-python           | Python    | 5 regras   |
| Qualidade & Testes   | code-review          | universal | 4 regras   |
| Arquitetura          | layered-architecture | universal | 6 regras   |
| Seguranca            | owasp-top10          | universal | 10 regras  |
| Infraestrutura       | aws-data-lake        | AWS       | 8 regras   |

## Fonte

- **Local:** Kit inicial do DevFlow
- **Externo:** Configuravel via entrevista no `/devflow prd` (repositorio git do time)

## Estrutura de um Template

Cada template usa o formato ADR com YAML frontmatter:

- `type: adr` — identifica como ADR
- `scope: organizational` — template organizacional (vs `project` para instanciadas)
- `stack` — linguagem/plataforma alvo
- `category` — categoria do template
- Secoes: Contexto, Decisao, Alternativas, Consequencias, **Guardrails**, **Enforcement**
