# Fix: prevc-confirmation honra `git.autoFinish: true` — Plano

> **DevFlow workflow:** fix-confirmation-autofinish-honor | **Scale:** SMALL | **Phase:** P→E→V
> **Autonomy:** supervised

**Goal:** A skill `devflow:prevc-confirmation` deve, com `git.autoFinish: true`, **auto-executar** a finalização (incl. sincronizar base defasada via rebase) sem apresentar menu; pausar só por risco irreversível específico. E nunca rotular "concluído" antes do merge.

**Bug:** com `autoFinish: true`, o Step 4 não especifica como tratar base defasada nem commit fora-de-escopo → o agente cai numa enquete genérica (violando "config decidida não se re-pergunta").

## Global Constraints
- Repo do plugin DevFlow; `versioning: pipeline` → **NÃO** editar version files manual.
- Testes: `.sh` grep-based (convenção de `tests/skills/`).
- Só editar `skills/prevc-confirmation/SKILL.md` + 1 teste. Sem tocar outras skills.

## Task 1: Teste do comportamento autoFinish (RED→GREEN)

**Files:**
- Create: `tests/skills/test-confirmation-autofinish.sh`
- Modify: `skills/prevc-confirmation/SKILL.md`

- [ ] **Step 1 (RED):** escrever `tests/skills/test-confirmation-autofinish.sh` assertando na `SKILL.md`:
  1. Step 4 autoFinish:true menciona **sincronização de base** automática (`fetch` + `rebase` sobre `origin/main`) sem pergunta.
  2. Define a **única exceção de pausa** (risco irreversível / commit fora-de-escopo) com motivo específico — e proíbe menu genérico nesse modo.
  3. Detecção de `mergeStrategy` quando a config não define (respeitar convenção do repo, não assumir `--squash`).
  4. Step 0 pre-check cobre **commits fora-de-escopo** na branch (não só working-tree).
  5. Anti-pattern: NUNCA rotular "concluído" antes do merge.
- [ ] **Step 2:** rodar → FAIL (regras ausentes).
- [ ] **Step 3 (GREEN):** editar `SKILL.md`:
  - Step 4 / autoFinish:true → adicionar sub-passo "sincronizar base (fetch+rebase sobre origin/main) automaticamente se defasada"; definir a exceção de pausa (motivo específico + remédio `rebase --onto`, nunca menu); esclarecer mergeStrategy (config > convenção do repo > fallback).
  - Step 0 → estender pre-check para commits fora-de-escopo na branch (`git log origin/main..HEAD`), oferecendo isolamento (rebase --onto) em vez de arrastar pra main.
  - Anti-patterns → linha "NUNCA 'concluído' antes do merge".
- [ ] **Step 4:** rodar → PASS.
- [ ] **Step 5:** commit.

## Gate P→E
- [x] Plano escrito (test-first)
- [ ] Link ao workflow

## Finalização
Ao finalizar: **honrar `autoFinish: true`** — auto-executar (base atual → merge conforme convenção do repo = merge commit → cleanup), demonstrando o próprio fix. Sem push/PR extra além do necessário; sem bump manual (pipeline).
