# Revalidação — Migração framework_ddc/.claude/rules (22) → plugin std (20)

## 17 migrados diretamente
accessibility, api-design→api-conventions, caching, commits→commit-hygiene,
data-modeling, documentation, error-handling, grounding, internationalization,
migration, observability, performance, schemas, security, state-management,
testing→test-discipline, validation→runtime-validation.

## 5 NÃO migrados como standard (decisão)
| rule | destino correto | justificativa |
|---|---|---|
| environments | camada operations | política de deploy, não std de código |
| git | git-strategy / .devflow.yaml | branch policy tem mecanismo próprio |
| governance | ADR / standards-builder | meta-governança, não std de código |
| ai-friendly-code | fold em naming/documentation + std-typescript-strict | craft heuristics; bits lintáveis surfaçados |
| development | std-typescript-strict (novo) | gap real: strictness TS lintável, stack-scoped |

## +3 std de fontes fora de .claude/rules
code-review (←.contexts/rules/code-review.md), secret-conventions
(←contracts/secrets.md), naming-conventions (sintetizado de development+data-modeling+schemas).
