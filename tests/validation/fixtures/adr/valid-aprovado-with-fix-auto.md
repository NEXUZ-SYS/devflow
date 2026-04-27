<!-- EXPECTED:
S3-GATE: file MUST NOT be modified by --apply-fix-auto (status=Aprovado)
1: FIX-INTERVIEW
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
12: PASS
-->
---
type: adr
name: aprovado-with-fix-auto
description: ADR Aprovada com gap FIX-AUTO no frontmatter (S3 demote test)
scope: project
source: local
stack: universal
category: arquitetura
status: Aprovado
created: 2026-04-22
supersedes: []
refines: []
protocol_contract: null
decision_kind: firm
---

# ADR — Aprovada com FIX-AUTO

- **Data:** 2026-04-22
- **Status:** Aprovado
- **Escopo:** Projeto
- **Stack:** universal
- **Categoria:** Arquitetura

Note: faltando `version` field — Check 1 normalmente classificaria FIX-AUTO,
mas como status=Aprovado, S3 gate força demote para FIX-INTERVIEW e bloqueia
edits silenciosos via `--apply-fix-auto`.

---

## Contexto

Estamos auditando uma ADR previamente aprovada que tem um campo de frontmatter faltando. Sem o gate S3, FIX-AUTO modificaria o arquivo silenciosamente, alterando histórico aprovado.

## Decisão

Aplicar abordagem X em todos os módulos novos. ADRs aprovadas são imutáveis exceto via fluxo EVOLVE.

## Alternativas Consideradas

- **Manter status quo** — não escala
- **Reescrever do zero** — overkill
- **Adotar X** ✓ — incremental, baixo risco

## Consequências

**Positivas**
- Migração gradual
- Testabilidade preservada

**Negativas**
- Período de coexistência X+legacy

## Guardrails

- SEMPRE usar X em módulos novos
- NUNCA misturar X com legacy no mesmo arquivo

## Enforcement

- [ ] Code review: bloquear mistura X/legacy
- [ ] Lint: detectar imports legacy em arquivos X

## Evidências / Anexos

**Fontes oficiais:** [Spec oficial](https://www.w3.org/)

```ts
const result = applyX(input);
```
