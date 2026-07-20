# Fix: prevc-confirmation honra `git.autoFinish: true` — Plano

> **DevFlow workflow:** confirmation-release-signpost | **Scale:** SMALL | **Phase:** P→E→V
> **Autonomy:** supervised
>
> **Estado (2026-07-20):** Camada A (merge-honor) **JÁ ENTREGUE na main** (commit `9b8a6af`; `tests/skills/test-confirmation-autofinish.sh` verde). A branch `origin/feature/fix-confirmation-autofinish-honor` está mergeada (stale — pode deletar). **Trabalho restante = só a Camada B (signpost de release pendente)** → escala rebaixada de MEDIUM para SMALL. Task 1 abaixo fica como referência histórica (concluída).

**Goal:** A skill `devflow:prevc-confirmation`, com `git.autoFinish: true`, deve **(A)** auto-executar a finalização (incl. sincronizar base defasada) sem menu, pausando só por risco irreversível específico; e **(B)** sob `versioning: pipeline`, **sinalizar explicitamente o release pendente** ao concluir — nunca declarar "Workflow Complete" deixando o release órfão e silencioso.

**Bug (2 camadas):**
- **A — merge-honor:** com `autoFinish: true`, o Step 4 não especificava base defasada/commit fora-de-escopo → enquete genérica (viola "config decidida não se re-pergunta"). *[largamente já refletido na skill 1.29.0 — validar e fechar o teste.]*
- **B — release-trigger (novo, descoberto em 2026-07-20):** sob `versioning: pipeline`, a pipeline de finalização **não tem passo que dispara o release**, e **não avisa** que ele ficou pendente. O `release.yml` é `workflow_dispatch` (só manual) e abre um *release PR*; o `tag-release.yml` publica no merge desse PR. A skill mergeia a feature, declara "Workflow Complete" (Step 9) e o release fica órfão, dependente de um `gh workflow run release.yml -f bump=X` que a skill **nunca faz nem menciona**. `autoFinish: true` é estruturalmente inalcançável para o release; o defeito nuclear é o **silêncio** (mesmo anti-padrão de "concluído sem merge", um nível acima).

**Decisão de design (operador, 2026-07-20):** a correção é **sinalizar, não auto-disparar**. Release é ação outward-facing e o *tipo* de bump é julgamento semver → permanece decisão humana explícita. A skill passa a **denunciar o release pendente + dar o comando exato + sugerir o bump derivado dos commits**. Sem auto-`workflow run`. (Auto-disparo via `git.autoRelease` opt-in foi considerado e adiado — fora deste escopo.)

## Global Constraints
- Repo do plugin DevFlow; `versioning: pipeline` → **NÃO** editar version files manual; **não** bumpar local.
- Testes: `.sh` grep-based (`tests/skills/`); se houver helper JS, `node:test` (`tests/lib/finalize/`).
- Editar **só** `skills/prevc-confirmation/SKILL.md` (+ opcional helper `scripts/lib/finalize/`) + testes. Sem tocar outras skills.
- Genérico p/ projetos-cliente: o signpost vale para qualquer projeto `versioning: pipeline` com um `release.yml` (GitHub). Em `prCli: glab`/outros forges, ver "Fora de escopo".

---

## Task 1 (Camada A): merge-honor — ✅ CONCLUÍDA (main `9b8a6af`, teste verde) — referência histórica

**Files:** Create `tests/skills/test-confirmation-autofinish.sh` · Modify `skills/prevc-confirmation/SKILL.md`

- [ ] **Step 1 (RED):** `tests/skills/test-confirmation-autofinish.sh` assertando na `SKILL.md`:
  1. Step 4 autoFinish:true menciona **sincronização de base** automática (`fetch`+`rebase` sobre `origin/main`) sem pergunta.
  2. **Única exceção de pausa** (risco irreversível / commit fora-de-escopo) com motivo específico — proíbe menu genérico.
  3. Detecção de `mergeStrategy` quando a config não define (convenção do repo, não assumir `--squash`).
  4. Step 0 cobre **commits fora-de-escopo** na branch (`git log origin/main..HEAD`), não só working-tree.
  5. Anti-pattern: NUNCA rotular "concluído" antes do merge.
- [ ] **Step 2:** rodar → observar quais asserts já passam na 1.29.0 (Steps 0/4/anti-patterns parecem presentes) e quais faltam.
- [ ] **Step 3 (GREEN):** fechar só as lacunas reais na `SKILL.md`.
- [ ] **Step 4:** rodar → PASS. **Step 5:** commit.

---

## Task 2 (Camada B): sinalização de release pendente — RED→GREEN

**Agent:** devops-specialist / documentation-writer
**Files:** Modify `skills/prevc-confirmation/SKILL.md` (Step 8 + anti-patterns) · opcional Create `scripts/lib/finalize/suggest-bump.mjs` + `tests/lib/finalize/test-suggest-bump.mjs` · Modify `tests/skills/test-confirmation-autofinish.sh`

### O contrato do signpost (o que a skill passa a emitir)

No **Step 8 (Completion Summary)**, **quando `versioning: pipeline` E o `## [Unreleased]` do CHANGELOG está não-vazio** (há algo a lançar), emitir um bloco de **RELEASE PENDENTE** — antes de qualquer "Workflow Complete":

```
⚠ RELEASE PENDENTE (versioning: pipeline) — o merge NÃO dispara o release.
  A entrega está na main, mas a versão só sobe pela pipeline, que é manual.
  Para lançar:
    gh workflow run release.yml -f bump=<minor>     # sugestão derivada dos commits
  → abre um RELEASE PR (bump + version files + known-hashes).
  Ao mergear esse PR, o tag-release.yml publica a tag vX.Y.Z + GitHub Release.
  Nota: os checks do release PR nascem em `action_required` (PR do bot); aprovar os runs
  (não usar --admin) para os required checks ficarem verdes.
```

Regras do contrato:
- **Condicional:** só sob `versioning: pipeline` **e** `[Unreleased]` não-vazio (lido pelo parser único — `assertUnreleasedNonEmpty` já existe). `versioning: local` (o bump já subiu) e `none` (não há release) → **sem** signpost.
- **Sugestão de bump derivada, não afirmada:** varrer `git log origin/main..HEAD` (ou o range mergeado) por tipo de conventional commit — `!`/`BREAKING CHANGE` → **major**; algum `feat` → **minor**; só `fix`/`chore`/`docs`/`refactor`/`test` → **patch**. É **sugestão** no comando (`bump=<X>`), o humano confirma ao rodar.
- **Nunca auto-dispara.** A skill emite o comando; não o executa. (Coerente com a decisão: release é outward-facing + bump é julgamento.)
- **Substitui o silêncio:** o "Workflow Complete"/"What to do next" do Step 8 passa a **conter** este bloco em vez de omitir o release.

### Passos

- [ ] **Step 1 (RED — skill):** estender `tests/skills/test-confirmation-autofinish.sh` (ou novo `test-confirmation-release-signpost.sh`) assertando que a `SKILL.md`:
  1. No Step 8, sob `versioning: pipeline`, instrui a emitir o bloco de **RELEASE PENDENTE** com o comando `gh workflow run release.yml -f bump=`.
  2. Deriva a sugestão de bump dos tipos de commit (menciona feat→minor / fix→patch / breaking→major).
  3. Menciona o fluxo em 2 passos (release PR → `tag-release.yml` no merge) e a fricção `action_required`.
  4. Torna o signpost **condicional** a `pipeline` + `[Unreleased]` não-vazio.
  5. Anti-pattern novo: *"'Workflow Complete' sob versioning:pipeline sem sinalizar o release pendente → o release fica órfão e silencioso."*
- [ ] **Step 2:** rodar → FAIL (a skill hoje não tem nada disso no Step 8).
- [ ] **Step 3 (GREEN — helper opcional, test-first):** se optar pelo helper de derivação:
  - `tests/lib/finalize/test-suggest-bump.mjs` (RED): `suggestBump(commitSubjects[]) → 'patch'|'minor'|'major'`. Casos: `['fix: x']`→patch; `['feat: y','fix: z']`→minor; `['feat!: w']`/`['fix: x\n\nBREAKING CHANGE: ...']`→major; `[]`→patch (default seguro).
  - `scripts/lib/finalize/suggest-bump.mjs` (GREEN): zero-dep, puro, nunca lança. (Alternativa: derivação em prosa no próprio Step 8, sem helper — menos testável.)
- [ ] **Step 4 (GREEN — skill):** editar `skills/prevc-confirmation/SKILL.md`:
  - **Step 8:** inserir o bloco de RELEASE PENDENTE (contrato acima), condicional; se helper, chamar `node scripts/lib/finalize/suggest-bump.mjs` para a sugestão.
  - **Anti-patterns:** adicionar a linha do release órfão.
  - (Coerência) o Step 9 "Gate Check / Workflow Complete" só declara completo **depois** do signpost — o release pendente é parte do "what's next", não escondido.
- [ ] **Step 5:** rodar todos os testes → PASS.
- [ ] **Step 6:** commit.

---

## Nota de processo (Camada 0 — não é bug do plugin, é disciplina)

O incidente que expôs a Camada B: a finalização foi feita **inline** (push/`gh pr create`/merge manuais), **sem invocar `devflow:prevc-confirmation`**, e com um menu de 4 opções — violando o `autoFinish: true` já honrado no Step 4 da skill. Ou seja: a skill (Camada A) estava certa, mas **nada força a Confirmation a passar por ela** — o orquestrador pode derivar para finalização inline. **Fora de escopo deste plano** (é sobre o roteamento prevc-flow→prevc-confirmation, não sobre o conteúdo da skill), mas registrado para não se perder: vale um follow-up "a fase C sempre invoca a skill, nunca finaliza inline".

## Fora de escopo
- **Auto-disparo do release** (`git.autoRelease` opt-in) — adiado por decisão; release permanece humano.
- **`prCli: glab`/GitLab** — o signpost cita `release.yml` (GitHub). No GitLab o gatilho equivalente é outro (ver [[project_gitlab_scaffold_design]] / lacuna do glab); o signpost deve ser **neutro de forge** ou ramificar por `prCli`. Follow-up, alinhado à lacuna do glab já conhecida.
- **Roteamento prevc-flow → prevc-confirmation** (Camada 0 acima).

## Gate P→E
- [x] Plano escrito (test-first, 2 camadas)
- [ ] Decisão de design registrada (sinalizar, não auto-disparar) ✓
- [ ] Link ao workflow

## Finalização
Ao finalizar **este** fix: honrar `autoFinish: true` **via a skill** (não inline) — demonstrando o próprio fix, incl. o novo signpost de release pendente ao fim.
