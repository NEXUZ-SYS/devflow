---
type: plan
name: Enforcement determinístico de standards e entrega de contexto
description: Tracking dotcontext. Plano executável canônico em docs/superpowers/plans/2026-09-26-standards-enforcement-context-delivery.md. Spec em docs/superpowers/specs/2026-09-26-standards-enforcement-context-delivery-design.md.
planSlug: standards-enforcement-context-delivery
scope: LARGE
autonomy: supervised
status: filled
progress: 0
generated: "2026-09-26"
scaffoldVersion: "2.0.0"
summary: "Standards viram gate: engine único, nível block/warn/review, baseline com catraca, hook síncrono bloqueante, CLI para pre-commit/CI e sinal standards na fase V. Normas entregues antes da edição e a subagentes. Corrige P0 (pre-tool-use anula o próprio JSON de decisão) e P1 (fase V lê ADRs no caminho legado). Origem: caso de um projeto real × DDC, 68 desvios após a Fase 0."
requiredSignals: [unit, integration, e2e, lint]
sources:
  spec: docs/superpowers/specs/2026-09-26-standards-enforcement-context-delivery-design.md
  plan: docs/superpowers/plans/2026-09-26-standards-enforcement-context-delivery.md
  adrs:
    - .context/engineering/adrs/015-deterministic-standards-enforcement-v1.0.0.md
    - .context/engineering/adrs/007-default-standards-library-v3.1.0.md
    - .context/engineering/adrs/013-verifiable-signal-pipeline-v1.1.0.md
phases:
  - id: "phase-1"
    name: "Planning"
    prevc: "P"
    status: completed
    summary: "Análise do caso de um projeto real confirmada no código e na doc do Claude Code. Spec aprovada (D1–D6), ADR-015 criada, 007 e 013 evoluídas (minor). Plano test-first de 20 tasks em 3 releases."
  - id: "phase-1r"
    name: "Review"
    prevc: "R"
    status: in_progress
    summary: "Revisão por architect + security-auditor. Foco: (1) o P0 é falha de segurança condicional — validar que nenhum caminho do pre-tool-use volta a imprimir texto antes do JSON; (2) a catraca não tem bypass pelo agente (baseline, rebaixar nível); (3) hook síncrono não degrada a edição além do orçamento; (4) SI-4 intacto. Rodada 1 (2026-09-26): os dois REPROVARAM com D1–D6 mantidas; todos os achados incorporados na spec, no plano (23 tasks) e nas ADRs 015/007/013; decisões D7–D10 do operador. Rodada 2 (re-revisão sobre 7f94137): os dois APROVADO-COM-RESSALVAS; 11 ressalvas incorporadas (impressão digital por clone, catálogo do harness, nota sem --ci, faixa de versão, rótulo validado por ator code owner, adoção conferida contra a árvore da base, realpath, regex de escrita). Pendente: aprovação R→E pelo operador."
  - id: "phase-2"
    name: "Execution"
    prevc: "E"
    status: pending
    required_sensors:
      - tests-passing
    required_artifacts:
      - handoff-summary
    summary: "Release 1 (T1–T8): P0 com emit_decision e teste de propriedade, P1, protocolo v2, nível e parser único de std, baseline multiconjunto, engine com raiz confiável e contrato D4, CLI com catraca sob o operador, linters. Release 2 (T9–T13): contexto pré-edição emoldurado, session-start-norms, SubagentStart, sinal standards reservado, fases P/V. Release 3 (T14–T23): hook síncrono só block, anti-loop por sessão, guard semântico Edit/Write, guard Bash/NotebookEdit/MCP, gate contra o merge-base, shim e oferta de gates, omp, CI do repo, E2E com agente adversário, medição real."
  - id: "phase-3"
    name: "Validation"
    prevc: "V"
    status: pending
    required_sensors:
      - tests-passing
    required_artifacts:
      - handoff-summary
    summary: "Sinais unit, integration, e2e e lint observados no ledger (ADR-013). Rodada no omp. Medição somente leitura numa cópia do projeto real medido (T23)."
lastUpdated: "2026-09-26T17:36:04.125Z"
---

# Enforcement determinístico de standards e entrega de contexto — Plano (dotcontext tracking)

> Este arquivo é o **tracking** dotcontext. O plano executável canônico (20 tasks TDD-first em 3 releases) está em [`docs/superpowers/plans/2026-09-26-standards-enforcement-context-delivery.md`](../../docs/superpowers/plans/2026-09-26-standards-enforcement-context-delivery.md). O design aprovado está em [`docs/superpowers/specs/2026-09-26-standards-enforcement-context-delivery-design.md`](../../docs/superpowers/specs/2026-09-26-standards-enforcement-context-delivery-design.md).

## Objetivo

Fazer a norma valer: entregue ao agente antes da decisão e obrigatória depois dela.

## O achado que moldou o design

| Sinal | Estado encontrado |
|---|---|
| Linter dos standards | Hook `PostToolUse` async, `exit 0` sempre — lembrete que chega no turno seguinte |
| Pre-commit / CI / fase V | Nenhum roda os linters dos standards |
| Corpo da norma antes da edição | Não chega; só índices no SessionStart |
| Knowledge on-demand no `pre-tool-use` | Texto puro no stdout: não chega ao modelo e anula o JSON de decisão seguinte (P0) |

## Decisões (D1–D6)

1. **D1** — tudo por hooks (portável Claude Code + omp).
2. **D2** — baseline com catraca: bloqueia só violação nova.
3. **D3** — nível por std e por regra; defaults `warn`, autorais `block`.
4. **D4** — hook falha aberto; CLI/CI/V falham fechado.
5. **D5** — engine único.
6. **D6** — só o humano aumenta o baseline ou rebaixa nível.

## Revisão R — rodada 1 (2026-09-26)

**Veredito:** architect REPROVADO, security-auditor REPROVADO. O desenho D1–D6 se sustenta; os defeitos estavam no plano e nos testes.

**Decisões do operador:**

7. **D7** — corrigir dentro da fase R e pedir re-revisão curta, sem voltar à P.
8. **D8** — catraca em camadas completas: guard semântico no Edit/Write, guard heurístico em Bash/NotebookEdit/MCP (hook dedicado), CLI que exige terminal interativo, `gate` no CI contra o merge-base + CODEOWNERS. Locais = atrito; CI = garantia.
9. **D9** — hook síncrono roda só os linters de std com nível máximo `block`; `warn`/`review` ficam no async.
10. **D10** — o `additionalContext` do PreToolUse chega junto do resultado da ferramenta; aceito e medido na T23.

**Achados de peso incorporados:** catraca contornável por Bash/CLI e CI confiando no baseline da branch; 12 bypasses do guard (PoC); impressão digital como conjunto (PoC); linter quebrado contava como limpo (PoC); C0 no `file_path` anulava o deny (PoC); gate inexistente no projeto-cliente; std `block` sem sinal passava no gate; contexto injetado sem moldura; pluginRoot por consumidor (D5); regressão no omp; teto de 10k caracteres; testes de hook em bash fora de qualquer sinal. Tabela achado → task no plano, seção "Revisão R".

**Fora do escopo, para o operador decidir:** o SessionStart deste repo já tem ~22,1k caracteres (o Claude recebe prévia de 2k); o git-guard ADV-6 do `pre-tool-use` é código morto (matcher só `Edit|Write`); 26 dos 29 `tests/hooks/*.sh` não rodam em nenhum sinal.

## Revisão R — rodada 2 (re-revisão sobre 7f94137)

**Veredito:** architect APROVADO-COM-RESSALVAS, security-auditor APROVADO-COM-RESSALVAS. Todas as ressalvas incorporadas; a tabela ressalva → task está no plano, seção "Revisão R › Rodada 2".

- Impressão digital estável entre hook, `--staged`, `--all` e clones (caminho relativo + `stripRoots`).
- Catálogo do harness traduz o sinal reservado; `doctor` avisa caminho sumido.
- Sem `--ci`, violação da catraca é nota (V local); com `--ci`, é 1.
- `appliesFrom`/`appliesUntil`/`framework` e versões do `.devflow.yaml` entram na comparação (guard e gate).
- Rótulo `standards-ratchet-approved` só vale com ator code owner da base, distinto do autor e não bot.
- Adoção: baseline novo conferido contra os achados da árvore do merge-base.
- Guard avalia o `realpath`; `WRITE` não casa `/dev/null`, `>&`, `->` nem `node` sem `-e`; baseline recusa fp repetida.

**Achado lateral:** o loader não preenche `std.framework`, então std com faixa de versão hoje fica sempre fora quando há `.devflow.yaml` — item separado (ADR-008).

## Sequência (fora deste plano)

- **Subprojeto 3 — doutrina de engenharia:** reabrir a D6 de 2026-05-30, 346 referências órfãs em `assets/stacks/`, fonte do DDC versionada e sincronizada.
- **Subprojeto 4 — conflito entre normas:** detector std × ADR × doutrina.

Evidência de ambos na §9 da spec.

## Evidências

- Spec: `docs/superpowers/specs/2026-09-26-standards-enforcement-context-delivery-design.md` (commit `6d19003`)
- ADRs: commit `e33ef39`
- Branch: `docs/standards-enforcement-context-delivery`

## Execution History

> Last updated: 2026-09-26T17:36:04.125Z | Progress: 0%
