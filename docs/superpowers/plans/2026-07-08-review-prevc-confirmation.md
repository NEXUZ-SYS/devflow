# Revisão prevc-confirmation — Plano de Implementação (rev. pós-review R)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development ou superpowers:executing-plans. Steps usam checkbox (`- [ ]`).
>
> **DevFlow workflow:** `review-prevc-confirmation` · **Scale:** MEDIUM→LARGE · **Phase:** R→E
> **Spec:** `docs/superpowers/specs/2026-07-08-review-prevc-confirmation-design.md` · **ADR:** `011-devflow-config-single-parser`

**Goal:** Corrigir os 15 achados da `prevc-confirmation`, com parser único de config (`devflow-config.mjs`) e a **lógica determinística da finalização extraída para helpers `.mjs` testáveis** (a skill invoca por referência). E2E hermético só onde há executável.

**Architecture:** O que é comportamento vira **código testável** (`scripts/lib/devflow-config.mjs` + helpers de finalização). A `SKILL.md` passa a **referenciar** esses helpers (prosa mínima). Hook e skill consomem o mesmo parser. E2E dirige os **helpers/CLI** contra fixture git isolado (bare remote + stub `gh` + env higienizado) — nunca a prosa-LLM.

**Tech Stack:** Node ESM (`node --test`), bash (hooks + `.sh`), git (fixtures + bare).

## Mudanças desta revisão (pós-review R)
- **[C-CRÍTICO]** E2E não testa prosa-LLM. Extrair a lógica determinística (base-sync/rebase, out-de-escopo, mergeStrategy, CHANGELOG gate) para helpers `.mjs`; E2E dirige os helpers. "#4 ancora **T2** (hook/lib), não T4."
- **[B-ALTO]** Migrar `git.versioning` (hook L234) junto com `autoFinish` (senão viola ADR-011).
- **[B-ALTO]** Fail-safe `$(node … 2>/dev/null || echo disabled)` sob `set -e`; regressão **não-circular** (golden do Python atual); paridade compara **classificação**, não bytes.
- **[A-MÉDIO]** Parser: colon-anchored + escopo bloco `git:` + fronteira granular + `\s`(tab); cap de tamanho; grep negativo ampliado; +vetores RED (tab, substring, fora-de-git, granular+irmão, CRLF).
- **[E/F]** Fatiar tasks; T3 com RED; **faseamento A→C com checkpoints**.

## Global Constraints
- **Parser único (ADR-011):** `git.autoFinish` E `git.versioning` só via `scripts/lib/devflow-config.mjs`; NUNCA awk/grep/regex ad-hoc (inclui o hook L234). Strip de comentário inline. Fallback = `disabled`/`local` em TODO erro (ENOENT/read/parse), idêntico com/sem PyYAML.
- **Hook `post-tool-use` é advisory** (async, injeta contexto; não nega) — o gate de branch-protection é o `pre-tool-use` (não tocado). Preservar o "sempre-sai-0": toda `$(node …)` recebe `2>/dev/null || echo <default>`.
- **Saída canônica do granular:** `{bump,commit,push,merge}` normalizado (não-listada=false). Mudança de string intencional vs o `json.dumps` cru do Python — consumidor do hook (L419-421) e paridade comparam **classificação**.
- **E2E isolado (memória):** fixture em `mktemp -d` **fora da árvore do repo**; `origin` = `git init --bare` local (nunca URL); env do spawn higienizado (`HOME`/`GIT_CONFIG_GLOBAL`/`GIT_CONFIG_SYSTEM` em tmp, `unset GH_TOKEN GITHUB_TOKEN`, `GH_CONFIG_DIR=<tmp>`, `GIT_TERMINAL_PROMPT=0`, `GIT_ASKPASS=/bin/true`); PATH com stub `gh` só no filho; stub inerte (loga argv, simula no bare, sem eval/rede/rm); asserção de que `gh` real nunca rodou.
- Repo do plugin; `versioning: pipeline` (não bumpar version files manual). Finalizar honrando autoFinish:true.

---

# FASE A — Parser único (núcleo; isola o toque no hook sensível) · checkpoint no fim

## Task A1: `devflow-config.mjs` — parser único + CLI
**Files:** Create `scripts/lib/devflow-config.mjs`, `tests/lib/devflow-config.test.mjs`
**Interfaces:** Produces `readAutoFinish(src)→'disabled'|'all'|{bump,commit,push,merge}`, `readVersioning(src)→'local'|'pipeline'|'none'`. CLI: `node devflow-config.mjs read-autofinish <path>` / `read-versioning <path>` imprime o token (via `import.meta.url` guard).

- [ ] **Step 1 (RED):** `tests/lib/devflow-config.test.mjs` — vetores: escalar true/false, ausente, comentário inline (`true  # x`), granular parcial (`{bump:true,merge:false}`→4 chaves normalizadas), **tab-indent**, **chave-substring** (`autoFinishMode: true` NÃO casa), **`autoFinish:` fora do bloco `git:`** (ignora), **granular seguido de irmão** (`versioning:` na linha após as sub-chaves — para no irmão), **CRLF**, YAML inválido→`disabled`, arquivo > cap→`disabled`. Idem `readVersioning` (local/pipeline/none/default). Rodar → FAIL.
- [ ] **Step 2:** implementar: localizar bloco `git:` (abre em `^git:`, fecha na 1ª linha não-indentada); dentro dele `^\s*autoFinish:\s*(.*)$` (colon-anchored, `\s` p/ tab); strip `\s+#.*$`; escalar→disabled/all; sem valor→coletar sub-chaves indentadas até dedent/irmão; `readVersioning` análogo. `readFileSync` com **cap** (ex.: 256KB→fallback) em try/catch → fallback. Sem `eval`/`vm`/`child_process`/`fetch`/`import()` dinâmico/`process.env`. CLI guard.
- [ ] **Step 3:** rodar → PASS. **Step 4:** teste "linter puro" (grep negativo ampliado). **Step 5:** commit.

## Task A2: Hook adota a lib (autoFinish **e** versioning), fail-safe
**Files:** Modify `hooks/post-tool-use` (`parse_auto_finish` ~79-106; `read_yaml_field "versioning"` L234; consumidor L379-425). Create `tests/hooks/test-post-tool-use-config-golden.sh`
**Interfaces:** Consumes A1.

- [ ] **Step 1 (RED, golden não-circular):** capturar o **comportamento atual do Python** (rode o hook/heredoc antes do swap) como **literais golden** para autoFinish {true/false/ausente/granular/inline-comment} e versioning {local/pipeline/none/ausente} + o caminho de supressão do merge-warning (L215-250). O teste roda o hook e compara com os golden. Rodar → estabelece a baseline (documenta a normalização granular como diferença intencional).
- [ ] **Step 2:** trocar `parse_auto_finish` por `AUTO_FINISH=$(node "${PLUGIN_ROOT}/scripts/lib/devflow-config.mjs" read-autofinish "$YAML_PATH" 2>/dev/null || echo disabled)`; trocar o `read_yaml_field … versioning` (L234) por `$(node … read-versioning … 2>/dev/null || echo local)`. `${PLUGIN_ROOT}` (BASH_SOURCE), nunca `$CLAUDE_PLUGIN_ROOT`. Remover heredocs órfãos.
- [ ] **Step 3:** rodar golden → PASS (classificação, não bytes). Rodar testes existentes do hook → sem regressão. **Step 4:** commit.

## Task A3: Paridade lib × Python-com-PyYAML (RED próprio)
**Files:** Create `tests/lib/devflow-config-parity.test.mjs`
- [ ] **Step 1 (RED):** golden da semântica **Python-com-PyYAML** (o autoritativo) para os mesmos vetores; assere que a lib classifica igual (incl. caso "sem PyYAML" → a lib não depende, mesma saída). Escrever de forma que **falharia** contra o bug de divergência (granular). Rodar → PASS após A2 (trava-contrato). **Step 2:** commit. **⛳ Checkpoint Fase A** (parser único aterrissado; hook alinhado).

---

# FASE B — Helpers determinísticos + wiring da skill · checkpoint no fim

> Extrair a lógica que hoje é prosa para código testável; a skill passa a **invocar por referência**.

## Task B1: `scripts/lib/finalize/base-sync.mjs` (#15 base-sync/rebase)
**Files:** Create lib + `tests/lib/finalize/base-sync.test.mjs`
**Interfaces:** `analyzeBase(cwd, {baseRef}) → { behind:int, action:'ok'|'rebase'|'pause', reason }` (não executa git destrutivo por si; `rebaseOnto()` separado com resultado `{ok}|{conflict, remedy}`).
- [ ] **Step 1 (RED):** fixture git tmpdir + bare; casos: em dia→`ok`; atrás→`rebase`; rebase limpo→`{ok}`; conflito real→`{conflict, remedy}` (não deixa árvore meio-rebaseada — `rebase --abort`). Rodar → FAIL.
- [ ] **Step 2:** implementar (usa `git -C <cwd>` isolado). **Step 3:** PASS. **Step 4:** commit.

## Task B2: `scripts/lib/finalize/scope-guard.mjs` (#15 out-de-escopo)
**Files:** Create lib + teste
**Interfaces:** `outOfScopeCommits(cwd, baseRef) → [{sha,subject}]`; usado como gate que **bloqueia antes do bump/commit**.
- [ ] **Step 1 (RED):** fixture com commit alheio em `origin/main..HEAD` → retorna-o com remédio `rebase --onto`; branch limpa → `[]`. Rodar → FAIL. **Step 2:** impl. **Step 3:** PASS. **Step 4:** commit.

## Task B3: `scripts/lib/finalize/merge-strategy.mjs` (#9/#10)
**Files:** Create lib + teste
**Interfaces:** `resolveMergeStrategy(cwd, {configStrategy}) → 'merge'|'squash'|'rebase'` — config > convenção (`git log origin/main --first-parent -5`: `Merge pull request` → merge; `… (#N)` → squash) > fallback `squash`.
- [ ] **Step 1 (RED):** fixture (a) histórico merge-commit → `merge`; (b) squash first-parent `(#N)` → `squash`; config explícita vence. Rodar → FAIL. **Step 2:** impl (`--first-parent`, não `--merges`). **Step 3:** PASS. **Step 4:** commit.

## Task B4: `scripts/lib/finalize/changelog-gate.mjs` (#5)
**Files:** Create lib (reusa `changelog-extract.mjs` `extractSection`) + teste
**Interfaces:** `assertUnreleasedNonEmpty(changelogText) → {ok}|{empty}`.
- [ ] **Step 1 (RED):** `## [Unreleased]` com conteúdo→`ok`; vazio→`empty`. Rodar → FAIL. **Step 2:** impl. **Step 3:** PASS. **Step 4:** commit.

## Task B5: `devflow:config` cross-check (#4)
**Files:** Modify `skills/config/SKILL.md` (~418-427). Create `tests/skills/test-config-crosscheck.sh`
- [ ] **Step 1 (RED):** recusa/avisa `autoFinish.bump:true` + `versioning ∈ {pipeline,none}`. → FAIL. **Step 2:** editar geração. **Step 3:** PASS. **Step 4:** commit.

## Task B6: `SKILL.md` — wiring por referência aos helpers + fixes de prosa (#1,#2,#3,#6,#7,#8,#12,#13,#14)
**Files:** Modify `skills/prevc-confirmation/SKILL.md` (Steps 0/1/2/3/4/C.x/6 + checklist). Modify `tests/skills/test-confirmation-autofinish.sh` (estende, estrutural).
- [ ] **Step 1 (RED, estrutural):** grep-asserts: Step 4 lê autoFinish via `devflow-config.mjs` (sem `awk`) e trata per-step (bump/commit/push/merge, não-listada=SKIP); base-sync/scope-guard/merge-strategy/changelog-gate referenciados pelos **helpers** (não reimplementados em prosa); out-de-escopo bloqueia **antes** do bump; anúncio usa `<STRATEGY_FLAG resolvido>`; C.x roda **antes** do Step 3 (ou commit dedicado das ADRs antes do merge) e está no checklist junto com 8.5; `adr-decision.mjs` com `${CLAUDE_PLUGIN_ROOT}`; Step 3 msg ramifica por modo (sem "bump" em pipeline/none); remove texto stale "(como neste projeto)"; Step 1 histórico condicionado a `versioning: local`; Step 6 Lite paths DDC v2. → FAIL.
- [ ] **Step 2:** editar a SKILL.md conforme. **Step 3:** PASS + regressão `tests/skills`. **Step 4:** commit. **⛳ Checkpoint Fase B.**

---

# FASE C — E2E hermético + relax · checkpoint final

## Task C1: `tests/e2e/_harness.mjs` (fixture isolado)
**Files:** Create `tests/e2e/_harness.mjs`
**Interfaces:** `makeFixture()→{dir,bare,ghLog,env,cleanup}` — `mktemp -d` fora do repo; `git init` + `git init --bare` remote (path); `git -C` sempre; env higienizado (ver Global Constraints); stub `gh` inerte no PATH do filho; seed de commits/CHANGELOG/`.devflow.yaml` parametrizável.
- [ ] **Step 1:** implementar + um self-test que assere o isolamento (**`gh` real nunca chamado**; `git remote get-url origin` = bare do tmp; `HOME` isolado). **Step 2:** commit.

## Task C2: E2E hook+lib (config → classificação) — cenários #1,#2,#3,#4,#14
**Files:** Create `tests/e2e/hook-config.e2e.test.mjs`
- [ ] **Step 1 (RED→GREEN por A1/A2):** para `.devflow.yaml` (escalar true/false, ausente, granular {bump,commit,~merge}, versioning none) rodar o caminho hook+lib e asserir a classificação/instrução emitida. Ancora **A2** (não a prosa). **Step 2:** commit.

## Task C3: E2E dos helpers determinísticos — cenários #8,#9,#10,#11,#5
**Files:** Create `tests/e2e/finalize-helpers.e2e.test.mjs`
- [ ] **Step 1 (RED→GREEN por B1-B4):** dirigir os helpers no fixture: base defasada→rebase limpo (#8); conflito real→pausa sem árvore meio-rebaseada (#9); commit fora-de-escopo→lista+remédio (#10); mergeStrategy merge vs squash por convenção (#11); CHANGELOG `[Unreleased]` vazio→gate bloqueia (#5). **Step 2:** commit.

## Task C4: Relaxar o teste que exige `--squash` (#9)
**Files:** Modify `tests/validation/test-prevc-confirmation-autofinish.mjs` (~L44)
- [ ] **Step 1:** trocar a asserção fixa `--squash` por "estratégia resolvida coerente" (aceita merge/squash/rebase conforme convenção). Rodar a suíte → verde. **Step 2:** commit. **⛳ Checkpoint Fase C.**

## Self-Review
- **Cobertura:** 15 achados → #1(A1/A2/B6) #2(B6) #3(B6) #4(B5) #5(B4/C3) #6(B6) #7(B6) #8(B1/C3) #9(B1/C3/C4) #10(B2/C3) #11(B3/C3) #12(B6) #13(B6) #14(B6) #15(B1/B2). Paridade→A3/C2. Isolamento→C1. Sem órfão.
- **Test-first:** todo task começa por RED (inclusive A3, agora com golden próprio). Helpers com unit+E2E; skill com estrutural (correto — prosa não é E2E-ável).
- **Faseamento:** A (parser, checkpoint) → B (helpers+skill, checkpoint) → C (E2E, checkpoint). Parser primeiro (destrava).

## Gate R→E
- [x] Spec aprovado + ADR-011 registrada (`Proposto`; enforcement fecha quando A1/A3 aterrissam)
- [x] Review R incorporado (BLOCK do architect resolvido: helpers extraídos, E2E re-escopado, versioning+fail-safe)
- [ ] Aprovação do operador para R→E
