---
type: plan
name: Higiene de contexto (anti context-rot)
description: Tracking dotcontext. Plano executável canônico em docs/superpowers/plans/2026-07-22-context-hygiene.md. Spec em docs/superpowers/specs/2026-07-22-context-hygiene-design.md.
planSlug: context-hygiene
scope: MEDIUM
autonomy: supervised
status: filled
progress: 0
generated: "2026-07-22"
scaffoldVersion: "2.0.0"
summary: "Artefatos de processo acumulam e o agente lê material obsoleto com aparência de autoridade. Todo sinal auto-declarado deste repo está podre (36/38 planos com zero checkboxes, incluindo um released no mesmo dia). CLI emite fatos, LLM emite veredito sobre entrega observável no código. Só move o que o git protege."
requiredSignals: [unit, lint]
sources:
  spec: docs/superpowers/specs/2026-07-22-context-hygiene-design.md
  plan: docs/superpowers/plans/2026-07-22-context-hygiene.md
phases:
  - id: "phase-1"
    name: "Planning"
    prevc: "P"
    status: in_progress
    summary: "Levantamento empírico provou que todo sinal auto-declarado está morto (checkbox, progress:, CHANGELOG, git log --grep). Spec aprovada (D1-D6). Plano test-first de 4 tasks com 13 testes redigidos por extenso."
  - id: "phase-1r"
    name: "Review"
    prevc: "R"
    status: pending
    summary: "Revisão por architect + security-auditor. Foco: a feature MOVE ARQUIVOS — validar que a recusa mecânica (movable) não tem bypass, que .context/ é inalcançável (ADR-006), e que o critério não degenera em heurística de data (ADR-014)."
  - id: "phase-2"
    name: "Execution"
    prevc: "E"
    status: pending
    required_sensors:
      - tests-passing
    required_artifacts:
      - handoff-summary
    summary: "TDD RED→GREEN nas 4 tasks: CLI scan (fatos), CLI archive (recusa mecânica), skill + comando, dogfooding nos 38 planos. Nota: run-unit.sh enumera por git ls-files — o RED exige git add antes, senão é falso-verde."
  - id: "phase-3"
    name: "Validation"
    prevc: "V"
    status: pending
    required_sensors:
      - tests-passing
    required_artifacts:
      - handoff-summary
    summary: "Sinais unit e lint OBSERVADOS no ledger do verify-gate (ADR-013, nunca auto-report). Auditoria de segurança do movimento de arquivos. Verificar que git mv preservou histórico nos planos arquivados."
lastUpdated: "2026-07-22"
---

# Higiene de contexto (anti context-rot) — Plano (dotcontext tracking)

> Este arquivo é o **tracking** dotcontext. O plano executável canônico (4 tasks TDD-first, 13 testes com código real) vive em [`docs/superpowers/plans/2026-07-22-context-hygiene.md`](../../docs/superpowers/plans/2026-07-22-context-hygiene.md). O design aprovado está em [`docs/superpowers/specs/2026-07-22-context-hygiene-design.md`](../../docs/superpowers/specs/2026-07-22-context-hygiene-design.md).

## Objetivo

Retirar de circulação artefatos de processo que já cumpriram seu papel, para o agente parar de ler material obsoleto com aparência de autoridade.

## O achado que moldou o design

**Todo sinal auto-declarado de progresso está podre neste repo:**

| Sinal | Estado |
|---|---|
| Checkbox `- [x]` | 36/38 planos com zero marcados — incluindo `suggest-bump-postmerge-base`, released como v1.31.1 no mesmo dia |
| `progress:` / `fases_completed` | 0 para entrega concluída |
| `CHANGELOG.md` | 0 referências a planos ou PRs |
| `git log --grep <slug>` | 0 a 1 commit por slug |

Ninguém volta para marcar o artefato depois da entrega. Qualquer mecanismo que dependa disso apodrece igual — inclusive um criado agora. Sobra o que aconteceu de fato: o código existir, versionado.

## Escopo

`scripts/context-hygiene.mjs` (CLI de fatos) + `skills/context-hygiene/SKILL.md` (julgamento) + `commands/devflow-cleanup.md`. Tudo no **plugin**, genérico — roda em projeto-cliente.

## Decisões (D1–D6)

1. **D1** — critério é entrega observável no código, nunca checkbox nem data (ADR-013; data é vedada pela ADR-014).
2. **D2** — detecta 5 categorias A–E, age só em A (planos).
3. **D3** — vive no plugin, zero hardcode deste repo; `.context/` via `context-paths.mjs`.
4. **D4** — `movable = tracked && !dirty && category==='A'`, sempre `git mv`, recusa **mecânica no CLI**.
5. **D5** — destino `docs/superpowers/plans/archive/` (neutro de idioma; convenção já usada 3×).
6. **D6** — CLI emite fato, LLM emite veredito.

## Segurança

Responde a incidente real deste repo: um wipe destrutivo apagou WIP não-commitado. O git é a rede de segurança — só se move o que ele protege. Gate por **arquivo-alvo**, não por working tree (o repo tem 28 arquivos sujos agora; exigir tree limpo tornaria a limpeza inexecutável).

A recusa vive no CLI, não em prosa: guardrail mecânico não é racionalizável por um agente — a memória deste repo registra um subagente que burlou um guardrail que só existia em Markdown.

## Fora de escopo (declarado, não escondido)

- Mover para `archive/` **não** impede `grep`/`glob` de alcançar a pasta. A limpeza é parcial.
- Categorias B–E recebem só diagnóstico. `.context/plans/` é território dotcontext (ADR-006).
- Não conserta os sinais podres — contorna-os deliberadamente.

## Evidências

- Spec: `docs/superpowers/specs/2026-07-22-context-hygiene-design.md` (commit `4d8f575`)
- Plano canônico: `docs/superpowers/plans/2026-07-22-context-hygiene.md` (commit `fded70e`)
- Branch: `feature/context-hygiene`

## Execution History

> Fase P concluída. Aguardando Review.
