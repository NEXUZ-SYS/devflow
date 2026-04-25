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
name: broken-supersedes
description: ADR aponta supersedes para arquivo inexistente
scope: project
source: local
stack: universal
category: arquitetura
status: Proposto
version: 1.0.0
created: 2026-04-24
supersedes: [999-this-does-not-exist-v0.0.0]
refines: []
protocol_contract: null
decision_kind: firm
---

# ADR — Broken Supersedes

- **Data:** 2026-04-24
- **Status:** Proposto
- **Escopo:** Projeto
- **Stack:** universal
- **Categoria:** Arquitetura

---

## Contexto

ADR aponta para predecessor que não existe no diretório. Check 12 deve detectar.

## Decisão

Adotar a abordagem X em vez de Y. Decisão de arquitetura.

## Alternativas Consideradas

- **Opção A** — descartada por custo
- **Opção B** — descartada por complexidade
- **Opção C** ✓ — escolhida pelo equilíbrio

## Consequências

**Positivas**
- Trade-off A → bom outcome
- Métrica B → reduzido

**Negativas**
- Custo de migração

## Guardrails

- SEMPRE usar a abordagem X em modulos novos
- NUNCA misturar X com Y na mesma camada

## Enforcement

- [ ] Code review: bloquear mistura X/Y
- [ ] Lint: regra para detectar pattern Y residual

## Evidências / Anexos

**Fontes oficiais:** [W3C spec](https://www.w3.org/)

```ts
// uso correto da abordagem X
const result = applyX(input);
```
