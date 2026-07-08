# Revisão prevc-confirmation — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) ou superpowers:executing-plans. Steps usam checkbox (`- [ ]`).
>
> **DevFlow workflow:** `review-prevc-confirmation` · **Scale:** MEDIUM (beira LARGE) · **Phase:** P→R
> **Spec:** `docs/superpowers/specs/2026-07-08-review-prevc-confirmation-design.md` · **ADR:** `011-devflow-config-single-parser`

**Goal:** Corrigir os 15 achados da auditoria da `prevc-confirmation`, com o parser único de config (`devflow-config.mjs`) na raiz, e uma suíte de **E2E de comportamento** da finalização.

**Architecture:** `scripts/lib/devflow-config.mjs` vira a fonte única de `git.autoFinish`/`git.versioning`; hook e skill consomem. A skill passa a tratar autoFinish per-step, gates verificáveis (CHANGELOG, out-de-escopo) e mergeStrategy por convenção. E2E roda a finalização de verdade em repo-fixture tmpdir + remote bare + stub de `gh`.

**Tech Stack:** Node ESM (`node --test`), bash (hooks + testes `.sh`), git (fixtures + bare remote).

## Global Constraints
- **Parser único (ADR-011):** ler `git.autoFinish`/`git.versioning` SÓ via `scripts/lib/devflow-config.mjs`; NUNCA `awk`/grep ad-hoc. Strip de comentário inline. Fallback idêntico com/sem PyYAML.
- **Testes não mutam dirs versionados** (memória): E2E só em **tmpdir** + `git init --bare` como remote + **stub de `gh`**. Jamais no repo real.
- **Repo do plugin; `versioning: pipeline`:** NÃO bumpar version files manual.
- **Hook é sensível:** preservar 100% do comportamento atual (teste de regressão obrigatório antes de trocar o parser).
- **pt-BR** em toda doc/skill.

## Estrutura de arquivos
- Create: `scripts/lib/devflow-config.mjs` · `tests/lib/devflow-config.test.mjs` · `tests/lib/devflow-config-parity.test.mjs`
- Create: `tests/e2e/confirmation-finalize.e2e.test.mjs` + `tests/e2e/_harness.mjs` (fixture git+bare+gh-stub)
- Modify: `hooks/post-tool-use` (adota a lib) · `skills/prevc-confirmation/SKILL.md` (Steps 0/1/2/3/4/C.x/6 + checklist) · `skills/config/SKILL.md` (cross-check P5×P5b) · `tests/validation/test-prevc-confirmation-autofinish.mjs` (relaxar `--squash`)

---

## Task 1: `devflow-config.mjs` — parser único (raiz D1)

**Files:** Create `scripts/lib/devflow-config.mjs`, `tests/lib/devflow-config.test.mjs`
**Interfaces:** Produces `readAutoFinish(src)→'disabled'|'all'|{bump,commit,push,merge}` e `readVersioning(src)→'local'|'pipeline'|'none'` (src = texto do yaml).

- [ ] **Step 1 (RED):** escrever `tests/lib/devflow-config.test.mjs`:
```js
import { test } from 'node:test'; import assert from 'node:assert/strict';
import { readAutoFinish, readVersioning } from '../../scripts/lib/devflow-config.mjs';
test('escalar true → all', () => assert.equal(readAutoFinish('git:\n  autoFinish: true\n'), 'all'));
test('escalar false → disabled', () => assert.equal(readAutoFinish('git:\n  autoFinish: false\n'), 'disabled'));
test('ausente → disabled', () => assert.equal(readAutoFinish('git:\n  prCli: gh\n'), 'disabled'));
test('comentário inline não vaza', () => assert.equal(readAutoFinish('git:\n  autoFinish: true  # nota\n'), 'all'));
test('granular parcial → objeto com não-listada=false', () => {
  assert.deepEqual(readAutoFinish('git:\n  autoFinish:\n    bump: true\n    merge: false\n'),
    { bump: true, commit: false, push: false, merge: false });
});
test('yaml inválido → fallback disabled', () => assert.equal(readAutoFinish('::: not yaml :::'), 'disabled'));
test('versioning pipeline/none/local/default', () => {
  assert.equal(readVersioning('git:\n  versioning: pipeline\n'), 'pipeline');
  assert.equal(readVersioning('git:\n  versioning: none\n'), 'none');
  assert.equal(readVersioning('git:\n  prCli: gh\n'), 'local');
});
```
- [ ] **Step 2:** `node --test tests/lib/devflow-config.test.mjs` → FAIL (módulo ausente).
- [ ] **Step 3 (GREEN):** implementar `devflow-config.mjs` — parser mínimo de subset YAML do bloco `git:` (regex line-based, sem dep): localizar o bloco `git:`, ler `autoFinish` (escalar após strip de `\s+#.*$`; se a linha `autoFinish:` não tem valor, coletar sub-chaves indentadas `bump/commit/push/merge`), `versioning`. Sem `eval`/exec/rede. Try/catch → fallback (`'disabled'`/`'local'`).
- [ ] **Step 4:** `node --test` → PASS (todos).
- [ ] **Step 5:** teste "linter puro" (grep no source: sem `eval`/`child_process`/`fetch`) + commit.

## Task 2: Hook adota a lib (regressão-segura)

**Files:** Modify `hooks/post-tool-use` (funções `parse_auto_finish` ~79-106; leitura de versioning). Create `tests/skills/test-hook-config-parser.sh`
**Interfaces:** Consumes Task 1.

- [ ] **Step 1 (RED/regressão):** escrever `tests/skills/test-hook-config-parser.sh` que roda o hook (ou a função extraída) contra fixtures de `.devflow.yaml` (escalar/granular/ausente) e assere a MESMA classificação que `devflow-config.mjs` (chama `node .../devflow-config.mjs` e compara). Rodar → FAIL (hook ainda usa Python inline; provar divergência no granular).
- [ ] **Step 2:** substituir o `parse_auto_finish` inline por chamada `node "${PLUGIN_ROOT}/scripts/lib/devflow-config.mjs" read-autofinish "$YAML_PATH"` (adicionar CLI à lib: `if (import.meta.url===...) { imprime a classificação }`). Preservar a saída consumida em 379-425 (`disabled|all|{json}`).
- [ ] **Step 3:** rodar o teste + os testes existentes do hook (se houver) → PASS, sem regressão.
- [ ] **Step 4:** commit.

## Task 3: Teste de paridade hook×skill (+ sem PyYAML)

**Files:** Create `tests/lib/devflow-config-parity.test.mjs`

- [ ] **Step 1 (RED):** para cada fixture (escalar true/false, ausente, granular {merge:false}, comentário inline), asserir que a saída da lib (via CLI) == a classificação que o hook produz. Incluir caso "sem PyYAML" (a lib não depende de PyYAML → mesma saída). Rodar → deve passar após Task 2 (é o trava-contrato).
- [ ] **Step 2:** commit.

## Task 4: Step 4 da skill — autoFinish per-step + base-sync + mergeStrategy + out-de-escopo (#1,#2,#9,#10,#15)

**Files:** Modify `skills/prevc-confirmation/SKILL.md` (Step 4, ~186-263, e Step 0). Modify `tests/skills/test-confirmation-autofinish.sh` (estende). Modify `tests/validation/test-prevc-confirmation-autofinish.mjs` (#9).

- [ ] **Step 1 (RED):** estender `test-confirmation-autofinish.sh` assertando: (a) Step 4 lê autoFinish via `devflow-config.mjs`, NÃO via `awk`; (b) trata as 4 sub-flags per-step ("executa só as true; não-listada/false=SKIP"); (c) anúncio usa `<STRATEGY_FLAG resolvido>`, não hardcoda `--squash`; (d) detecção de convenção usa `--first-parent`; (e) conflito real de rebase = pausa (não segue meio-rebaseado); (f) out-de-escopo bloqueia ANTES do bump/commit (não só no Step 4). Relaxar o `.mjs` que exige `--squash`. Rodar → FAIL.
- [ ] **Step 2:** editar Step 4 + Step 0 conforme o design §4.2/§4.5/§4.6 do spec. Remover o `awk`; referenciar `devflow-config.mjs`.
- [ ] **Step 3:** rodar → PASS + regressão (tests/skills). Commit.

## Task 5: Step 2 — versioning gate + CHANGELOG gate + avisos (#4,#5,#6,#7,#8)

**Files:** Modify `skills/prevc-confirmation/SKILL.md` (Steps 1,2,3). Modify `tests/skills/test-confirmation-bump.mjs`/`test-prevc-confirmation-autofinish.mjs` conforme couber; Create casos no `test-confirmation-autofinish.sh`.

- [ ] **Step 1 (RED):** teste assertando: (a) modo pipeline exige `## [Unreleased]` não-vazio via `changelog-extract.mjs` (gate bloqueante); (b) `bump:true`+pipeline → aviso ALTO (não silencioso); (c) mensagem de commit ramifica por modo (sem "bump" em pipeline/none); (d) removido o texto stale "(como neste projeto)"; (e) histórico de versão do README condicionado a `versioning: local`. Rodar → FAIL.
- [ ] **Step 2:** editar Steps 1/2/3 conforme §4.3/§4.4.
- [ ] **Step 3:** PASS + commit.

## Task 6: Step C.x ADR sweep + checklist + path (#3,#12,#14)

**Files:** Modify `skills/prevc-confirmation/SKILL.md` (Step C.x, checklist 16-25).

- [ ] **Step 1 (RED):** teste `.sh`: (a) C.x roda ANTES do Step 3 OU há commit dedicado das ADRs tocadas antes do merge; (b) checklist inclui C.x e 8.5; (c) `adr-decision.mjs` prefixado com `${CLAUDE_PLUGIN_ROOT}`. Rodar → FAIL.
- [ ] **Step 2:** editar. **Step 3:** PASS + commit.

## Task 7: devflow:config cross-check (#4-config)

**Files:** Modify `skills/config/SKILL.md` (regras de geração ~418-427). Create `tests/skills/test-config-autofinish-versioning-crosscheck.sh`.

- [ ] **Step 1 (RED):** teste assertando que o config skill recusa/avisa o par `autoFinish.bump:true` + `versioning ∈ {pipeline,none}`. Rodar → FAIL.
- [ ] **Step 2:** adicionar a regra de cross-check na geração. **Step 3:** PASS + commit.

## Task 8: Step 6 Lite paths DDC v2 (#13)

**Files:** Modify `skills/prevc-confirmation/SKILL.md` (Step 6, ~311-316).

- [ ] **Step 1 (RED):** teste `.sh` que os paths do Step 6 Lite não usam `.context/docs/` v1 (usam `.context/engineering/` ou `context-paths.mjs`). Rodar → FAIL. **Step 2:** editar. **Step 3:** PASS + commit.

## Task 9: Suíte E2E de comportamento (14 cenários)

**Files:** Create `tests/e2e/_harness.mjs` + `tests/e2e/confirmation-finalize.e2e.test.mjs`
**Interfaces:** harness `makeFixture()→{dir,remote,gh}` — cria repo git em tmpdir, `git init --bare` remote, stub de `gh` (script no PATH que loga o comando e simula merge), seed de commits/CHANGELOG/.devflow.yaml.

- [ ] **Step 1 (RED, harness + exemplar):** escrever `_harness.mjs` (fixture git tmpdir + bare remote + gh-stub) e o **cenário exemplar #4** (autoFinish granular `{bump:true,commit:true,merge:false}` × versioning local → bumpa+commita, NÃO merge, NÃO menu). Rodar → FAIL (comportamento atual cai no menu — é o RED que ancora Task 4).
- [ ] **Step 2 (GREEN dependente):** confirmar que, após Task 4, o cenário #4 passa.
- [ ] **Step 3 (demais cenários):** implementar os 13 restantes (inventário abaixo), cada um com fixture próprio, RED→GREEN contra os fixes das Tasks 4-8.
- [ ] **Step 4:** `node --test tests/e2e/*.e2e.test.mjs` → todos PASS. Commit por lote.

**Inventário E2E (do spec §5):** (1) autoFinish true×local; (2) false→menu; (3) ausente→menu; (4) granular {bump,commit,~merge}×local; (5) granular {merge}×pipeline (sem double-bump, CHANGELOG check); (6) pipeline sem [Unreleased]→bloqueia; (7) pipeline msg-commit sem "bump"; (8) base defasada→rebase limpo; (9) base defasada→conflito real→pausa; (10) commit fora-de-escopo→pausa antes do bump; (11) mergeStrategy convenção (merge vs squash first-parent); (12) ADR sweep→ADR entra no PR; (13) paridade parser (coberto por Task 3, referência); (14) versioning:none.

## Self-Review
- **Cobertura do spec:** §4.1→T1/T2/T3; §4.2/§4.5/§4.6→T4; §4.3(CHANGELOG)+§4.4→T5; §4.3(ADR)→T6; §4.4(config)→T7; §4.6(Lite)→T8; §5(E2E)→T9. Sem lacuna.
- **Test-first:** todo task começa por RED. Tipos: T1 unit; T2/T3 integração/paridade; T9 E2E (obrigatório — a skill orquestra finalização de branch, fluxo crítico, memória "testes não mutam versionado").
- **Placeholders:** exemplares com código real (T1, T9-#4); demais E2E com inventário + comportamento esperado explícito (não "TODO").

## Gate P→R
- [x] Spec aprovado (D1/D2) + ADR-011 (gate 13/13)
- [x] Plano test-first (T1→T9, E2E obrigatório)
- [ ] Aprovação do operador (R) antes de E
