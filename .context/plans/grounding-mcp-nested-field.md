---
type: plan
name: "readBlockField — o doctor para de re-parsear config aninhada"
description: "Tracking dotcontext. Corrige o falso-positivo do check grounding-mcp (acusa ausência de um MCP que está no .mcp.json) removendo o parser ad-hoc do doctor e a lacuna de API que o obrigava a existir."
planSlug: grounding-mcp-nested-field
scope: SMALL
autonomy: supervised
status: filled
progress: 0
generated: "2026-07-23"
scaffoldVersion: "2.0.0"
summary: "BUG VIVO: o check grounding-mcp reporta que o docsMcpServer não está no .mcp.json quando ELE ESTÁ. A regex ad-hoc do doctor captura o comentário inline junto, comparando 'docs-mcp-server  # server canônico de documentação' contra as chaves do .mcp.json — a própria mensagem de erro exibe o sintoma. Mesma família do bug do permissions.yaml. CAUSA RAIZ: readField é hard-coded ao bloco git: (findScalar(gitBlock(src), name)), então quem precisa de campo sob grounding:/instincts:/orchestrator: não tem caminho e escreve o próprio parser — a violação do ADR-011 é lacuna de API, não indisciplina (4 consumidores nessa situação). ACHADO QUE ENCOLHE A CORREÇÃO: a lib já resolve o problema — findScalar chama stripInlineComment (/\\s+#.*$/) e gitBlock é genérico exceto por uma linha (/^git:\\s*$/). Basta parametrizar o nome do bloco e expor. Escopo travado: migrar SÓ o grounding-mcp; os outros 3 funcionam e ficam para depois, já com a API pronta."
sources:
  spec: docs/superpowers/specs/2026-07-23-grounding-mcp-nested-field-design.md
  plan: docs/superpowers/plans/2026-07-23-grounding-mcp-nested-field-impl.md
requiredSignals:
  - unit
  - lint
phases:
  - id: "phase-1"
    name: "Planning"
    prevc: "P"
    status: in_progress
    summary: "Bug reproduzido com evidência (docs-mcp-server presente no .mcp.json; a mensagem de erro exibe o comentário inline colado ao valor). Levantada a extensão real: 4 consumidores com parser ad-hoc porque readField só lê o bloco git:. Spec aprovado com escopo travado em migrar apenas o grounding-mcp."
  - id: "phase-2"
    name: "Execution"
    prevc: "E"
    status: pending
    required_sensors:
      - tests
      - lint
    required_artifacts:
      - handoff-summary
    summary: "TDD RED→GREEN em 2 tasks. Task 1: namedBlock(text,name) + readBlockField exportada + CLI read-block-field, 8 testes (incluindo o do comentário inline e o de não-vazamento entre blocos). Task 2: remover parseGrounding do doctor e migrar o check, 4 testes — incluindo o do alerta legítimo (server ausente → WARN), porque corrigir falso-positivo não pode virar falso-negativo."
  - id: "phase-3"
    name: "Validation"
    prevc: "V"
    status: pending
    summary: "Sinais unit e lint observados no ledger do verify-gate (ADR-013). 12 testes novos; não-regressão dos consumidores da lib (readField/readAutoFinish/readVersioning seguem via gitBlock→namedBlock). Verificação no repo real: o doctor deve sair de 2 WARN para 1 WARN (o restante é o claude mcp list, alheio)."
lastUpdated: "2026-07-23T00:00:00.000Z"
---

# `readBlockField` — o doctor para de re-parsear config aninhada — tracking

> **Spec:** [`docs/superpowers/specs/2026-07-23-grounding-mcp-nested-field-design.md`](../../docs/superpowers/specs/2026-07-23-grounding-mcp-nested-field-design.md)
> **Plano executável:** [`docs/superpowers/plans/2026-07-23-grounding-mcp-nested-field-impl.md`](../../docs/superpowers/plans/2026-07-23-grounding-mcp-nested-field-impl.md)

## O bug

O `/devflow:devflow-doctor` emite um WARN permanente e falso:

```
⚠ grounding ativo (mode: docs-only        # docs-first | docs-only) mas o
  docsMcpServer 'docs-mcp-server  # server canônico de documentação' não está no .mcp.json
```

O `docs-mcp-server` **está** lá. A própria mensagem exibe o sintoma: o comentário inline vem colado ao valor, porque a regex ad-hoc do doctor (`/^docsMcpServer:\s*(.+)$/`) engole o resto da linha.

Impacto: o comando que existe para dizer a verdade sobre a saúde do contexto mente de forma fixa — e um alerta que sempre grita treina o operador a ignorá-lo.

## A causa raiz

`readField` é hard-coded ao bloco `git:`. Não há leitor para campos aninhados, então quem precisa deles escreve o próprio parser:

| consumidor | bloco | estado |
|---|---|---|
| `doctor.mjs` (`grounding-mcp`) | `grounding:` | **bug vivo** |
| `instinct-config.mjs` | `instincts:` | funciona |
| `orchestrator-config.mjs` | `orchestrator:` | funciona |
| `standard-audit.mjs` | — | funciona |

O ADR-011 proíbe parse ad-hoc, mas a lib não oferecia alternativa. **A violação é lacuna de API, não indisciplina.**

## O achado que encolhe a correção

A lib **já** resolve o que o doctor reintroduziu: `findScalar` chama `stripInlineComment` (`/\s+#.*$/`), e `gitBlock` é genérico exceto por uma linha (`/^git:\s*$/`). Não há parser novo a escrever — basta parametrizar o nome do bloco.

## Decisões

- **D1** — `gitBlock(text)` → `namedBlock(text, name)`; `gitBlock` permanece como atalho, e os 3 call-sites internos seguem inalterados (retrocompatibilidade por construção).
- **D2** — `readBlockField(src, block, field)` exportada + CLI `read-block-field`. Herda remoção de comentário e ancoragem por `:` de graça. `readField` **não** é deprecada.
- **D3** — migrar **só** o `grounding-mcp`. Os outros 3 funcionam, não têm defeito conhecido, e mexer neles seria refactor com risco de regressão sem ganho imediato.

## Fora de escopo

Migrar `instinct-config`/`orchestrator-config`/`standard-audit`; deprecar `readField`; aninhamento de mais de um nível (YAGNI); trocar o subset-parser por dependência YAML real (decisão do ADR-011).

## Guardrails de ADR

| ADR | Aplicação |
|---|---|
| 011 | É *o* ADR em questão: a entrega remove uma violação **e o motivo dela**. |
| 013 | `requiredSignals: [unit, lint]`; a fase V observa o ledger. |
| 009 | O comportamento de `findScalar`/`stripInlineComment`/`gitBlock` foi lido no código, não recuperado de memória. |

## Execution History

> Last updated: 2026-07-23 | Progress: 0%
