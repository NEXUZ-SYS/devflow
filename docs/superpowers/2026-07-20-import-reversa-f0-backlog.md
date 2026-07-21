# Backlog — F0: suporte ao modo *reverse* do Reversa no `import-reversa`

**Data:** 2026-07-20 · **Origem:** validação E2E do import-reversa (findings `2026-07-20-import-reversa-fidelity-findings.md`).
**Item-mãe (F0):** o importador só suporta o modo **forward/greenfield** do Reversa; o modo **reverse/brownfield** degenera silenciosamente. Endereçado em 3 níveis incrementais.

> Regra: correção vive no repo **devflow** (+ standalone se tocar Standards). Nunca patch no sandbox nem nos fontes Reversa.

---

## N0 — Detectar modo + avisar (mata a falha silenciosa) — **EM ANDAMENTO**
**Objetivo:** o importador reconhece que a fonte é modo reverse e **avisa** em vez de "concluir" entregando PRD vazio / 0 ADRs. É o piso de honestidade; não implementa suporte reverse.
**Escopo:**
- Lib: função de detecção de modo (`forward` | `reverse` | `ambiguous`) por sinais estruturais; expõe `mode` + racional no resultado do detect/pipeline.
- Skill: ao detectar reverse (ou degradação — features-fantasma / PRD vazio / 0 ADRs apesar de `adrs/`), **avisa forte e escala** (decisão de UX no brainstorming: abortar vs confirmar-parcial vs preserve-only).
**Aceite:** contra o OKR → aviso claro de modo/limitação; contra o attio (forward) → sem aviso, import normal (sem regressão).
**Esforço:** S. **TDD obrigatório.**

## N1 — Suporte reverse mínimo (aproveita o que já é parseável) — **PENDENTE**
**Objetivo:** importação reverse útil, reusando o conteúdo rico que já existe.
**Escopo:**
- Features-módulo: subdir com `requirements.md`+`tasks.md` = feature (não `<feat>/spec.md`); subdir de análise (`adrs/`,`traceability/`,`flowcharts/`,`user-stories/`) = preservar como ref.
- ADRs prontos: ler `_reversa_sdd/adrs/*.md` e copiar/linkar (hoje 0 emitidos apesar de 5 reais).
- `requirements.md` como spec + reuso de `scanMarkers` (🟢🟡🔴 nativos) apontando para o arquivo certo.
- `tasks.md` (T-NN, "origem no legado") como tarefas; "Ordem de build" → ondas.
- soul: fallback `.reversa/soul.md` **ou** `documentation/assets/data/soul.json`.
**Esforço:** M. **TDD obrigatório.**

## N2 — Fidelidade plena reverse (polimento) — **PENDENTE**
**Objetivo:** aproveitar o restante do acervo reverse.
**Escopo:** `gaps.md`/`questions.md` → `ir.gaps`; `user-stories/` linkadas; `traceability/`/`erd-complete.md`/`c4-*`/`code-analysis.md` → `.context/engineering/` (knowledge/architecture).
**Esforço:** M–L. **TDD obrigatório.**

## Transversal — F3 (afeta os DOIS modos) — **PRIORIZAR junto/antes de N1**
Nenhum Reversa real casa o formato de decisão esperado (`## D-NN —`) → **0 ADRs mesmo no forward** (attio). Corrigir o parser de decisões (aceitar `paradigm-decision.md` real + `adrs/*.md`) melhora forward e reverse.

## Dívida de fixture da suíte — **PENDENTE**
`makeReversaFixture` modela só o forward idealizado. Adicionar fixtures reais (`reverse`, `forward-real` derivados de amostras attio/okr) para a suíte deixar de ser verde sobre um contrato que os reais não cumprem.

---

**Ordem:** N0 (agora) → F3 → N1 → dívida de fixture → N2.
