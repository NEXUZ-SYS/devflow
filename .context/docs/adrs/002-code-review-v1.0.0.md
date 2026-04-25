---
type: adr
name: code-review
description: Checklist de code review universal — guardrails para revisao de codigo em qualquer stack
scope: project
source: templates/adrs/qualidade-testes/code-review.md
stack: universal
category: qualidade-testes
status: Aprovado
created: 2026-04-22
version: 1.0.0
supersedes: []
refines: []
protocol_contract: null
decision_kind: firm
---

# ADR 002 — Code Review

- **Data:** 2026-04-22
- **Status:** Aprovado
- **Escopo:** Projeto (instanciada do template organizacional)
- **Stack:** universal
- **Categoria:** Qualidade & Testes

---

## Contexto

Code review sem checklist e inconsistente — depende do humor e experiencia do revisor. Guardrails de revisao garantem baseline de qualidade.

## Decisao

Checklist obrigatorio de code review aplicavel a qualquer stack.

## Alternativas Consideradas

- **Sem checklist** — revisao ad hoc, inconsistente
- **Checklist por linguagem** — muito granular para manter
- **Checklist universal** — escolhido; cobre principios, nao sintaxe

## Consequencias

- Revisoes mais rapidas e consistentes
- Juniors aprendem o que verificar
- IA aplica checklist automaticamente na fase Review

## Guardrails

- SEMPRE verificar se testes existem E passam antes de aprovar
- SEMPRE verificar se nomes sao descritivos (funcoes, variaveis, arquivos)
- NUNCA aprovar codigo com TODO/FIXME sem issue associada
- NUNCA aprovar secrets hardcoded (API keys, passwords, tokens)

## Enforcement

- [ ] Gate PREVC: Review phase usa este checklist
- [ ] CI check: scan para TODO/FIXME sem issue link
- [ ] CI check: scan para patterns de secrets (regex)

## Evidencias / Anexos

Checklist resumido para PR review:

1. Testes existem e passam?
2. Nomes revelam intencao?
3. Funcoes sao curtas (< 20 linhas)?
4. Sem secrets hardcoded?
5. Sem TODO/FIXME orfaos?
6. Segue padrao arquitetural do projeto?
