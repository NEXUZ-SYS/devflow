---
type: adr
name: tdd-python
description: TDD obrigatorio para Python — RED-GREEN-REFACTOR com pytest, sem mocks de banco
scope: project
source: templates/adrs/qualidade-testes/tdd-python.md
stack: python
category: qualidade-testes
status: Aprovado
created: 2026-04-22
---

# ADR 001 — TDD para Python

- **Data:** 2026-04-22
- **Status:** Aprovado
- **Escopo:** Projeto (instanciada do template organizacional)
- **Stack:** Python
- **Categoria:** Qualidade & Testes

---

## Contexto

Testes escritos apos implementacao tendem a cobrir apenas happy path. TDD garante que cada funcionalidade e testavel por design e que bugs sao detectados antes de commitar.

## Decisao

TDD obrigatorio: RED-GREEN-REFACTOR para toda funcionalidade nova, usando pytest como framework.

## Alternativas Consideradas

- **Testes pos-implementacao** — cobertura superficial, testes adaptados ao codigo
- **BDD com behave** — overhead de linguagem natural sem beneficio proporcional
- **TDD com pytest** — escolhido; ciclo rapido, fixtures poderosas

## Consequencias

- Todo codigo nasce testavel
- Commits de teste precedem commits de implementacao (verificavel no git log)
- Ciclo mais disciplinado, menos debugging

## Guardrails

- SEMPRE escrever o teste antes da implementacao — commit do teste deve preceder commit do codigo
- NUNCA usar mocks para banco de dados — usar banco real (SQLite in-memory ou testcontainers)
- SEMPRE nomear testes descritivamente: `test_should_reject_negative_price` nao `test_price`
- NUNCA testes que verificam apenas `assert result is not None` — verificar valores concretos
- QUANDO um bug for reportado, ENTAO escrever teste que reproduz o bug ANTES de corrigir

## Enforcement

- [ ] Git log: commits de teste (`test:`) devem preceder commits de feat (`feat:`)
- [ ] CI check: coverage minimo de 80% para novos modulos
- [ ] Code review: testes verificam comportamento, nao implementacao
- [ ] Gate PREVC: TDD ordering verificado no Validation phase

## Relacionamentos

| Tipo | Referencia |
|------|------------|
| Docs externos | https://docs.pytest.org/ |
| ADRs relacionadas | 002-code-review |

## Evidencias / Anexos

Ciclo RED-GREEN-REFACTOR:

```python
# RED: teste falha
def test_should_calculate_discount_for_premium_users():
    user = User(tier="premium")
    result = calculate_discount(user, amount=100.0)
    assert result == 15.0  # 15% discount

# GREEN: implementacao minima
def calculate_discount(user: User, amount: float) -> float:
    if user.tier == "premium":
        return amount * 0.15
    return 0.0

# REFACTOR: melhorar sem mudar comportamento
DISCOUNT_RATES = {"premium": 0.15, "standard": 0.05}

def calculate_discount(user: User, amount: float) -> float:
    rate = DISCOUNT_RATES.get(user.tier, 0.0)
    return amount * rate
```
