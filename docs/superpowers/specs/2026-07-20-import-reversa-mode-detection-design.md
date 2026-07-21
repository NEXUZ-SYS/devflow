# Design: Detecção de modo do Reversa + abort no reverse (N0)

> **DevFlow workflow:** import-reversa-mode-detection | **Escala:** SMALL | **Fase:** P → E → V
> **Data:** 2026-07-20 · **Autonomia:** supervised
> **Origem:** validação E2E do `import-reversa` (findings `docs/superpowers/2026-07-20-import-reversa-fidelity-findings.md`; backlog `…-f0-backlog.md`).
> **Fontes reais de referência (read-only):** `reversa-com-attio` (forward) · `reversa-modulo-odoo-17-okr` (reverse).

## 1. Objetivo & escopo

O importador Reversa→DevFlow (`devflow:import-reversa`, v1.21.0) só produz importação fiel quando a
fonte é um projeto Reversa em modo **forward/greenfield**. Contra o modo **reverse/brownfield** ele
**degenera silenciosamente**: "conclui" entregando PRD vazio, 0 ADRs (apesar de `_reversa_sdd/adrs/`
real), features-fantasma. Isso é a falha F0 da validação E2E.

**N0 é o piso de honestidade:** o importador passa a **reconhecer o modo reverse e abortar com um
aviso claro**, em vez de entregar uma importação degenerada com aparência de sucesso. N0 **não**
implementa suporte reverse (isso é N1) — só impede o resultado enganoso.

**Não-objetivo (YAGNI):** derivar artefatos a partir do layout reverse; flag de override
(`--force`); modo preserve-only; detecção-por-degradação (via sinais do resultado). Tudo N1+.

## 2. Regra de detecção (conservadora — nunca bloquear um forward legítimo)

Uma fonte é classificada **`reverse`** *se e somente se* **todas** as condições valem:

1. `_reversa_forward/` está **ausente** ou **sem subdiretórios de feature** (vazio); **e**
2. **nenhum** `_reversa_sdd/*/spec.md` existe (nenhum subdir traz o `spec.md` que o modo forward usa); **e**
3. **≥1 artefato de análise reversa** presente em `_reversa_sdd/`:
   `code-analysis.md`, `erd-complete.md`, `traceability/` (dir), `revalidation-report.md`,
   `confidence-report.md` ou `inventory.md`.

Caso contrário → **`forward`** (comportamento atual, **zero regressão**).

O `state.target.kind` (ex.: `remote-odoo-live-preview`) entra **apenas** no campo `reasons` como
reforço informativo — **nunca decide sozinho** (um projeto forward também pode ter um target remoto).

**Prova contra os reais/fixtures:**

| Fonte | forward vazio? | sem `*/spec.md`? | análise reversa? | → modo |
|---|---|---|---|---|
| `reversa-com-attio` | ❌ (15 features) | ❌ (18 specs) | — | **forward** |
| `reversa-modulo-odoo-17-okr` | ✅ | ✅ | ✅ (`code-analysis.md`, `erd-complete.md`, `traceability/`) | **reverse** |
| `makeReversaFixture green/yellow` | ❌ (`001-feat-a/`) | — | — | **forward** |

A conjunção (E de 3) é o que garante conservadorismo: basta um subdir de feature no forward, ou um
único `spec.md`, para a fonte permanecer forward.

## 3. Arquitetura (componentes)

Segue a fronteira da lib existente: **lib pura reporta; a skill decide o interativo** (§2.2 do design do importador).

- **`scripts/reversa-import/mode.mjs`** *(novo)* — `detectMode(sourceDir)` puro (`node:fs`/`node:path` só-leitura). Retorna:
  ```
  { mode: 'forward' | 'reverse', reasons: string[] }
  ```
  `reasons` explica a classificação (quais sinais dispararam) — alimenta a mensagem e é testável.
- **`scripts/reversa-import/pipeline.mjs`** — `runPipeline` chama `detectMode` e inclui `mode` (e `modeReasons`) no objeto de resultado. A lib **continua pura** — só reporta o modo, não aborta.
- **`skills/import-reversa/SKILL.md`** — nova **Etapa 1b (gate de modo)**, logo após a validação do source (Etapa 1) e **antes** do destino/bootstrap/escrita: se `mode === 'reverse'`, emitir o aviso de abort (modo detectado + limitação + ponteiro para o backlog N1) e **encerrar sem escrever nada**. Se `forward`, seguir o fluxo atual.
- **`tests/reversa-import/fixtures/make-fixture.mjs`** — novo profile **`reverse`**: `_reversa_forward/` vazio + `_reversa_sdd/` com `code-analysis.md`, `erd-complete.md`, `traceability/` e um módulo (`mod-a/` com `requirements.md`+`tasks.md`, **sem** `spec.md`) + `reconstruction-plan.md`. Também reduz a dívida de fixture (a suíte passa a exercitar o layout reverse).

## 4. Comportamento observável

- **Reverse** (`import-reversa <okr>`): a skill imprime o aviso e aborta antes de qualquer escrita —
  nenhum `.context/` derivado, nenhum artefato degenerado. Mensagem (conteúdo):
  > ⛔ Reversa em modo **reverse** (brownfield) não é suportado. Hoje só o modo forward/greenfield
  > importa com fidelidade. Motivos: `<reasons>`. Backlog do suporte: N1 (`…-f0-backlog.md`).
  > Importação abortada.
- **Forward** (`import-reversa <attio>`): sem aviso de modo, fluxo idêntico ao de hoje (sem regressão).

## 5. Testes (TDD — RED → GREEN → REFACTOR)

`tests/reversa-import/mode.test.mjs` (via `node --test`, padrão do repo):
1. fixture `reverse` → `mode === 'reverse'`, `reasons` cita os 3 sinais.
2. fixture `green` e `yellow` → `mode === 'forward'`.
3. edge: forward vazio **mas** com um `spec.md` em algum subdir → `forward` (critério 2 falha).
4. edge: forward vazio, sem `spec.md`, **sem** artefato de análise → `forward` (critério 3 falha) — degrada como antes, não aborta.
5. integração: `runPipeline(reverseFixture).mode === 'reverse'`.

Sem dependência de paths externos ao repo (os reais attio/okr ficam só no plano E2E existente, como
teste de fumaça manual).

## 6. Compliance & entrega

- Sem ADR nova (mudança comportamental menor, dentro do design aprovado do importador). O
  comportamento fica registrado neste spec + CHANGELOG.
- `CHANGELOG.md`: entrada em `[Unreleased]` (versionamento `pipeline` — sem bump local).
- Branch `feature/import-reversa-mode-detection`; commits seletivos (WIP não-relacionado preservado);
  finalização pelo trilho (sem PR/merge/push autônomo).

## 7. Arquivos tocados

| Arquivo | Ação |
|---|---|
| `scripts/reversa-import/mode.mjs` | novo — `detectMode` puro |
| `scripts/reversa-import/pipeline.mjs` | expõe `mode`/`modeReasons` no resultado |
| `skills/import-reversa/SKILL.md` | Etapa 1b — gate de modo (abort no reverse) |
| `tests/reversa-import/fixtures/make-fixture.mjs` | profile `reverse` |
| `tests/reversa-import/mode.test.mjs` | novo — testes de detecção |
| `CHANGELOG.md` | entrada `[Unreleased]` |
