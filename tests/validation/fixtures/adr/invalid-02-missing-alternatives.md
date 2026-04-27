<!-- EXPECTED:
1: PASS
2: PASS
3: PASS
4: FIX-INTERVIEW
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
name: typescript-strict-mode
description: TypeScript strict mode habilitado em todos os projetos
scope: organizational
source: local
stack: TypeScript
category: principios-codigo
status: Proposto
version: 0.1.0
created: 2026-04-24
supersedes: []
refines: []
protocol_contract: null
decision_kind: firm
---

# ADR — TypeScript strict mode

- **Data:** 2026-04-24
- **Status:** Proposto
- **Escopo:** Organizacional
- **Stack:** TypeScript
- **Categoria:** Princípios de Código

---

## Contexto

Bugs de null/undefined acontecem recorrentemente. Implicit any esconde drift de tipo. Tests cobrem mal edge cases.

## Decisão

Habilitar `"strict": true` no tsconfig.json de todos os projetos novos. Projetos existentes: migrar até Q3/26.

## Alternativas Consideradas

- **Strict mode** ✓ — pega erros em compile time

## Consequências

**Positivas**
- Null safety em compile time
- Eliminação de implicit any

**Negativas**
- Migração de código legado lenta

**Riscos aceitos**
- Curva inicial de aprendizado

## Guardrails

- SEMPRE usar `"strict": true` em tsconfig.json novo
- NUNCA adicionar `// @ts-ignore` sem comentário justificando
- QUANDO código legado, ENTÃO `"strict": false` temporário com TODO

## Enforcement

- [ ] Code review: tsconfig.json é revisado em novas PRs
- [ ] Lint: ESLint proíbe @ts-ignore sem comentário
- [ ] Gate CI: build falha se strict for desabilitado sem approval

## Evidências / Anexos

**Fontes oficiais:** [TypeScript strict mode docs](https://www.typescriptlang.org/tsconfig#strict)

```json
{
  "compilerOptions": {
    "strict": true
  }
}
```
