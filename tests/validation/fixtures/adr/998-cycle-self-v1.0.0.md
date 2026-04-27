<!-- EXPECTED:
1: PASS
2: PASS
3: PASS
4: PASS
5: PASS
6: PASS
7: PASS
8: PASS
9: PASS
10: PASS
11: PASS
12: FIX-INTERVIEW
-->
---
type: adr
name: cycle-self
description: ADR cria ciclo via self-reference em supersedes
scope: project
source: local
stack: universal
category: arquitetura
status: Substituido
version: 1.0.0
created: 2026-04-24
supersedes: [invalid-05-cycle]
refines: []
protocol_contract: null
decision_kind: firm
---

# ADR — Cycle Self

- **Data:** 2026-04-24
- **Status:** Substituido
- **Escopo:** Projeto
- **Stack:** universal
- **Categoria:** Arquitetura

---

## Contexto

ADR aponta supersedes para si mesma. Check 12 deve detectar self-reference.

## Decisão

Adotar X em vez de Y. Self-reference torna a ADR malformada estruturalmente.

## Alternativas Consideradas

- **Opção A** — descartada
- **Opção B** — descartada
- **Opção C** ✓ — escolhida

## Consequências

**Positivas**
- Outcome desejado

**Negativas**
- Custo aceito

## Guardrails

- SEMPRE seguir abordagem X
- NUNCA usar Y em código novo

## Enforcement

- [ ] Code review: validar ausência de Y
- [ ] Lint: regra dedicada

## Evidências / Anexos

**Fontes oficiais:** [IETF RFC](https://www.ietf.org/)

```ts
// exemplo
const x = applyX();
```
