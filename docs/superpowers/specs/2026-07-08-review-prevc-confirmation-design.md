# Spec — Revisão completa da skill `prevc-confirmation` + E2E

> **Workflow DevFlow:** `review-prevc-confirmation` · **Escala:** MEDIUM (beira LARGE) · **Fase:** P → R
> **Modo:** Full · **Autonomia:** supervised · **Data:** 2026-07-08 · **Status:** design aprovado (D1/D2) — aguardando plano

## 1. Contexto e problema

Auditoria ponto-a-ponto da `skills/prevc-confirmation/SKILL.md` (Steps 0→9) cruzada com o parser autoritativo `hooks/post-tool-use` e o gerador `skills/config/SKILL.md` encontrou **15 achados**. A **causa-raiz** de vários é que a skill **re-parseia** `.context/.devflow.yaml` com bash frágil (`awk -F: '{print $2}'`), **duplicando** o parser do hook (Python/PyYAML) — e os dois **divergem** (para config granular: skill→"menu", hook sem PyYAML→"disabled"; para o mesmo YAML, dois comportamentos errados dependentes de ambiente). Não existe lib de config compartilhada.

Testes atuais são **estruturais (grep de texto)** — não exercitam o comportamento da finalização. Falta **E2E de comportamento**.

## 2. Decisões (aprovadas no brainstorming)

- **D1 — Parser único compartilhado.** Extrair `scripts/lib/devflow-config.mjs` (parser único de `git.autoFinish`/`git.versioning` → `disabled|all|{granular}` / `local|pipeline|none`, com strip de comentário inline e **fallback explícito idêntico**). **Tanto a skill quanto o `hooks/post-tool-use` consomem essa lib** (o hook passa a chamar `node devflow-config.mjs` em vez do Python inline). Um parser, testável, sem divergência.
- **D2 — Escopo completo.** Corrigir os **15 achados** + cross-check no `devflow:config` (par contraditório) + **14 cenários E2E**. Deixa a skill redonda.

## 3. Achados (15) — do relatório de auditoria

| # | Step/local | Sev | Problema (resumo) |
|---|---|---|---|
| 1 | Step 4 (~186) | 🔴 CRÍTICO | `awk` só lê escalar; granular → "menu"; contradiz hook + linha 194 |
| 2 | Step 4 (192-263) | 🟠 ALTO | Skill = "all-or-menu"; hook = per-step (bump/commit/push/merge). `{merge:false}` diverge |
| 3 | Step C.x (157-177) | 🟠 ALTO | ADR sweep cria ADR **após** commit e **antes** do merge → fica fora do PR; não está no checklist |
| 4 | Step 2 gate × config | 🟡 MÉDIO | `autoFinish.bump:true` + `versioning:pipeline` vence em silêncio; config sem cross-check |
| 5 | Step 2 pipeline (105) | 🟠 ALTO | "garanta `[Unreleased]`" sem verificação → gate pulável (reusar `changelog-extract.mjs`) |
| 6 | Step 3 (148-153) | 🟡 MÉDIO | Hardcode "chore: bump to vX.Y.Z" mesmo sem bump (pipeline/none) |
| 7 | Step 3 (155) | 🟡 MÉDIO | Texto stale "pre-commit auto-bumpa (como neste projeto)" — falso (bump é pipeline) |
| 8 | Step 1 (81-92) | 🟡 MÉDIO | Histórico de versão não fecha em pipeline (versão desconhecida no finish) |
| 9 | Step 4 (223/227/261 + teste) | 🟡 MÉDIO | Inconsistência: "não assuma squash" vs anúncio hardcoda `--squash` vs teste exige `--squash` |
| 10 | Step 4 (223) | 🔵 BAIXO | Detecção por `--merges` não enxerga squash-based (usar `--first-parent`) |
| 11 | Step 4 (186-187) | 🔵 BAIXO | `awk` não tira comentário inline (mesma classe do bug do permissions.yaml) |
| 12 | Step C.x (171) | 🔵 BAIXO | `adr-decision.mjs` referenciado relativo (sem `${CLAUDE_PLUGIN_ROOT}`) |
| 13 | Step 6 Lite (311-316) | 🔵 BAIXO | Paths v1 (`.context/docs/...`); DDC v2 moveu p/ `.context/engineering/` |
| 14 | Checklist (16-25) | 🔵 BAIXO | Omite Step C.x e 8.5 (ordem declarada ≠ real) |
| 15 | Step 4(0) rebase (205-213 vs 251-258) | 🟡 MÉDIO | Conflito real de rebase sub-especificado; out-de-escopo pausa tarde (após bump) |

+ **paridade hook×skill (sem PyYAML)** — nota transversal: fallback deve ser idêntico (resolvido por D1).
+ **fora do alvo:** `prevc-validation` Step 2.6 hardcoda paths de ADR (alinhar ao `path-resolver` — follow-up cross-skill).

## 4. Design do fix (por grupo)

### 4.1 `scripts/lib/devflow-config.mjs` (novo — coração de D1)
- `readAutoFinish(yamlText|projectRoot) → 'disabled' | 'all' | { bump, commit, push, merge }` (booleans). Strip de comentário inline; `false`/ausente → `'disabled'`; `true` → `'all'`; objeto → normaliza as 4 sub-flags (não-listada = `false`).
- `readVersioning(...) → 'local' | 'pipeline' | 'none'` (default `local`).
- **Fallback explícito e documentado** (sem YAML parseável → `disabled`/`local`, o mesmo nos dois consumidores).
- Consumidores: `prevc-confirmation` (remove o `awk`) e `hooks/post-tool-use` (substitui o Python inline `parse_auto_finish` por `node .../devflow-config.mjs`). **Corrige #1, #4-seed, #11, #13-paridade.**

### 4.2 Step 4 — execução granular per-step (#2)
Reescrever a tabela/fluxo para tratar `bump/commit/push/merge` individualmente, espelhando o contrato do hook (linhas 418-422): "executa só as `true`; não-listada/`false` = SKIP". Fim do modelo "all-or-menu".

### 4.3 Gates verificáveis
- **CHANGELOG (#5):** em `versioning: pipeline`, gate que **exige `## [Unreleased]` não-vazio** via `changelog-extract.mjs` (`extractSection(text,'Unreleased')`) antes do Step 3. Bloqueia se vazio.
- **ADR sweep (#3):** rodar C.x **antes** do Step 3 (ou commit dedicado das ADRs tocadas antes do merge). Incluir C.x e 8.5 no checklist (#14).
- **Out-de-escopo (#15):** mover a checagem `origin/main..HEAD` para gate que **bloqueia antes do bump/commit**; conflito real de rebase = pausa com motivo+remédio (abortar rebase, escalar), nunca árvore meio-rebaseada.

### 4.4 Consistência versioning/bump
- **Cross-check no `devflow:config` (#4):** recusar/avisar `autoFinish.bump:true` + `versioning ∈ {pipeline,none}` (P5×P5b). No Step 2, se bump pedido mas suprimido pelo modo → **avisar alto**, não silencioso.
- **#6/#7/#8:** mensagem de commit ramificada por modo (sem "bump" em pipeline/none); remover texto stale do pre-commit; condicionar histórico de versão do README a `versioning: local`.

### 4.5 Estratégia de merge (#9/#10)
Anúncio (261) usa `<STRATEGY_FLAG resolvido>` (não hardcoda `--squash`); detecção por `git log origin/main --first-parent -5` (títulos `… (#NN)` = squash; "Merge pull request" = merge). Relaxar o teste `.mjs` que exige `--squash`.

### 4.6 Staleness (#12/#13)
`${CLAUDE_PLUGIN_ROOT}/scripts/adr-decision.mjs`; Step 6 Lite → paths DDC v2 (`.context/engineering/...`) ou `context-paths.mjs`.

## 5. Estratégia de testes (TDD)
- **Unit (`devflow-config.mjs`):** RRED→GREEN para readAutoFinish/readVersioning: escalar true/false, ausente, granular completo/parcial, comentário inline, YAML inválido (fallback).
- **Paridade (#13-cenário):** um teste alimenta o MESMO yaml à lib e ao caminho do hook → mesma classificação; inclui o caso sem-PyYAML (fallback idêntico).
- **E2E de comportamento (14 cenários — do relatório):** repo-fixture git em **tmpdir** + **remote bare local** (`git init --bare`) + **stub de `gh`**; nunca mutar repo real (memória `feedback_tests_no_mutate_tracked`). Cenários: autoFinish true/false/granular/ausente × versioning local/pipeline/none; base defasada→rebase (limpo e conflito); commit fora-de-escopo→pausa; mergeStrategy convenção (merge vs squash); CHANGELOG gate (bloqueia se vazio); ADR-sweep-entra-no-PR; `versioning:none`.
- Os testes que hoje **exigem** comportamento errado (#9 `--squash`; #1 "menu" no granular) são reescritos como RED que ancoram os fixes.

## 6. Riscos
| Risco | Mitigação |
|---|---|
| Tocar `hooks/post-tool-use` (arquivo sensível de segurança) p/ chamar a lib | Preservar 100% do comportamento atual (teste de regressão do hook); a lib replica a semântica do `parse_auto_finish`; fallback idêntico; sem shell:true |
| E2E que faz merge/rebase | Só em tmpdir + remote bare + stub de `gh`; jamais no repo real |
| Escopo grande (15 + 14 E2E) | Faseado no plano (grupos A→E) com checkpoints; parser (D1) primeiro (destrava o resto) |
| `versioning: pipeline` do próprio repo | Não bumpar version files manual; finalizar honrando autoFinish:true (corrigido) |

## 7. ADR
D1 (parser único de config, consumido por hook + skill, fallback idêntico) é decisão arquitetural com guardrails recorrentes ("nunca re-parsear `.devflow.yaml` por consumidor; usar `devflow-config.mjs`"). Rodar o check de oportunidade de ADR (Step 3.5) — provável CREATE, relacionada a ADR-004 (parser de permissions vendor-neutral) e ao incidente do parser de `permissions.yaml` (memória).

## 8. Referências
`skills/prevc-confirmation/SKILL.md`; `hooks/post-tool-use` (parse_auto_finish 79-106, read_yaml_field 31-75, branch 379-425, BUMP WARNING 227-248); `skills/config/SKILL.md` (P5/P5b); `scripts/lib/changelog-extract.mjs`, `changelog-guard.mjs`, `path-resolver.mjs`, `context-paths.mjs`; `tests/skills/test-confirmation-autofinish.sh`, `tests/validation/test-prevc-confirmation-autofinish.mjs`.
