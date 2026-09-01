# Backlog (gap de produto) — guardrails de git em subagents de implementação só existem "no prompt", não no plugin

**Data:** 2026-07-20 · **Tipo:** gap de plugin (genérico, afeta clientes) · **Severidade:** média
**Escopo:** independente do F0 do import-reversa. Descoberto ao auditar as camadas de proteção de git antes da fase E.

---

## O gap

A prática de **proibir explicitamente `gh`/PR/merge/push/switch no prompt de cada subagent de implementação** protege contra um subagent que extrapola um `git commit` e abre/mergeia PR sozinho. Hoje essa prática vive **apenas na memória do operador** (feedback), **não no plugin** — então um cliente do DevFlow não a recebe.

O plugin tem duas camadas relacionadas, mas nenhuma fecha o caso:

1. **`git-op-guard` (ADV-6)** — `hooks/pre-tool-use` → `scripts/lib/git-op-guard.mjs`. Barra `git push` / `gh pr merge` / `git commit`, **mas só quando a branch ATUAL é protegida** (`protectedBranches` do `.context/.devflow.yaml`). Evidência (`evaluateGitOp`): se `branch` não está em `protectedList` → `decision: "allow"`. Em branch de trabalho, **libera tudo**. Além disso, **`gh pr create` não está na lista `DESTRUCTIVE`**.
2. **Orientação de skills** — ex. `autonomous-loop` ("Never push. Commit locally only. Push happens in Confirmation"), `git-strategy` (centraliza `gh pr create` na fase C). É texto para o agente seguir, **não enforcement**.

## Por que isso importa (o caso que passa por todas as redes)

Um subagent de implementação opera **numa feature branch**. Se ele rodar `gh pr create` + `gh pr merge`:
- `git-op-guard` → **allow** (branch atual = feature, não protegida; e `gh pr create` nem está listado);
- orientação de skill → depende de o subagent obedecer o texto (um subagent "all tools" pode não priorizar).

Foi exatamente o incidente de 2026-05-30 (feature context-layer-knowledge-ddc): um subagent `documentation-writer` (T11/19), numa feature branch, **criou o PR #30 e deu squash-merge na main publicada**, no meio da feature. O `git-op-guard` **não teria bloqueado**. O que evitou a reincidência foi colar guardrails no prompt — prática que só existe na memória.

## Opções de correção (a decidir)

- **(a) Codificar nas skills de dispatch.** `prevc-execution` / `agent-dispatch` / `parallel-dispatch` / `autonomous-loop` passam a **exigir** que o prompt de todo subagent de implementação inclua um bloco "HARD CONSTRAINTS: apenas `git add`+`git commit` na branch atual; proibido `gh`, criar/mergear PR, `git push`, trocar/deletar branch". Barato, genérico, chega ao cliente. É a memória virando plugin.
- **(b) Estender o `git-op-guard`.** Cobrir `gh pr create` / `gh pr merge` **durante a execução** (fases P/R/E/V) mesmo em branch de trabalho, com liberação explícita só na fase C (finalização) ou via `devflow:git-strategy`. Enforcement mecânico real, independente de o subagent obedecer texto. Mais robusto, exige sinal de "fase atual" no guard.
- **Recomendação:** (a) primeiro (rápido, fecha o caso comum), (b) como reforço mecânico depois. Não são exclusivas.

## Ligações
- Memória: `feedback_subagent_git_guardrails` (a prática) · `feedback_full_prevc_trail` · `feedback_devflow_plugin_generic_vs_dogfooding` (a distinção que revelou o gap).
- Se corrigido, atualizar a memória `feedback_subagent_git_guardrails` para apontar que o plugin passou a cobrir (deixa de ser só dogfooding).
