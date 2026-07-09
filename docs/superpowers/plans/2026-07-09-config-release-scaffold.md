# Config: aviso + scaffold de pipeline de release — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development ou superpowers:executing-plans. Steps usam checkbox (`- [ ]`).
>
> **DevFlow workflow:** `config-release-scaffold` · **Scale:** MEDIUM · **Phase:** P→R
> **Spec:** `docs/superpowers/specs/2026-07-09-config-release-scaffold-design.md` · **ADR:** `012-ci-scaffold-verbatim-provenance`

**Goal:** O `devflow:config` avisa quando `versioning: pipeline` é escolhido sem CI, oferece scaffold **verbatim** de uma pipeline de release (gate git+GitHub), e rebaixa `versioning: local` a "solo/simples".

**Architecture:** Assets **verbatim** em `assets/release-scaffold/` (2 workflows + `bump-version.sh` genérico + libs). Um applier copia sem interpolação, nunca sobrescreve. O drift é governado por `provenance-sync` (hash): intocado→atualiza, editado→preserva, ausente→não recria.

**Tech Stack:** bash (script genérico), Node ESM (`node --test`, libs), GitHub Actions (workflows), git (fixtures).

## Global Constraints (ADR-012)
- **Verbatim:** artefato scaffoldado é copiado byte-a-byte; **NUNCA** interpolar/templatizar (a proveniência por hash só cobre verbatim). Config por projeto = **detecção em runtime**.
- **CI não alcança o plugin:** nenhum arquivo sob `assets/release-scaffold/` pode conter `CLAUDE_PLUGIN_ROOT`.
- **Nunca sobrescrever** arquivo existente do usuário; preservar e reportar.
- **Gate:** só oferece scaffold com repositório git **e** remote `github.com`. Sem git → só avisa. Sem GitHub → avisa (workflows são GH Actions).
- **Não recusar** `versioning: pipeline` sem CI (é não-verificável) — avisar + oferecer + registrar a escolha.
- Testes em **tmpdir**; nunca mutar dirs versionados nem tocar remote/CI real.
- Repo do plugin: `versioning: pipeline` (não bumpar version files manual). Finalizar honrando `autoFinish:true`.
- **Gotcha operacional:** NÃO stashar o WIP durante edições (reverte `.context/permissions.yaml` e dispara deny fail-closed de Write/Edit). Finalizar com merge sem `--delete-branch` + cleanup manual.

## Estrutura de arquivos
- Create: `assets/release-scaffold/{release.yml,tag-release.yml,bump-version.sh}` + `assets/release-scaffold/lib/{changelog-cut.mjs,changelog-extract.mjs,changelog-guard.mjs,version-guard.mjs}`
- Create: `scripts/lib/release-scaffold.mjs` (gate + copy applier) · `tests/lib/release-scaffold.test.mjs`
- Create: `tests/scripts/test-bump-version-generic.sh` · `tests/assets/test-release-scaffold-verbatim.test.mjs`
- Create: `tests/e2e/release-scaffold.e2e.test.mjs`
- Modify: `skills/config/SKILL.md` (P5b) · `scripts/lib/gen-known-hashes.mjs` (indexar os assets) · `skills/context-sync/SKILL.md` (escopo do scaffold)
- Create: `tests/skills/test-config-p5b-scaffold.sh`

---

## Task A: `bump-version.sh` genérico (asset, verbatim)
**Files:** Create `assets/release-scaffold/bump-version.sh`, `tests/scripts/test-bump-version-generic.sh`
**Interfaces:** Produces CLI `bump-version.sh [patch|minor|major]` — detecta manifests presentes, semver, corta CHANGELOG se existir. Consumido por `release.yml` do scaffold.

- [ ] **Step 1 (RED):** `tests/scripts/test-bump-version-generic.sh` — fixtures em `mktemp -d`:
  1. `package.json` com `"version": "1.2.3"` → `minor` → `1.3.0`.
  2. `pyproject.toml` com `version = "0.1.0"` → `patch` → `0.1.1`.
  3. `Cargo.toml` → `major` → bump correto.
  4. **Múltiplos manifests** presentes → todos atualizados; source of truth = o primeiro na ordem (`package.json`).
  5. **Nenhum manifest** → exit != 0 com mensagem clara (não corrompe nada).
  6. `CHANGELOG.md` presente + `lib/changelog-cut.mjs` → seção `[Unreleased]` vira `[1.3.0] — data`.
  7. Sem `CHANGELOG.md` → bump ok, sem erro.
  Rodar → FAIL (script ausente).
- [ ] **Step 2 (GREEN):** implementar. Ordem de detecção: `package.json` → `pyproject.toml` → `Cargo.toml` → `.claude-plugin/plugin.json` → `VERSION`. Semver estrito `X.Y.Z`. Atualiza **todos** os presentes. Chama `lib/changelog-cut.mjs` (caminho **relativo ao script**, nunca `${CLAUDE_PLUGIN_ROOT}`).
- [ ] **Step 3:** rodar → PASS. **Step 4:** commit.

## Task B: Assets do scaffold (verbatim) + guard anti-`CLAUDE_PLUGIN_ROOT`
**Files:** Create `assets/release-scaffold/{release.yml,tag-release.yml}` + `assets/release-scaffold/lib/*.mjs` (cópias verbatim de `scripts/lib/{changelog-cut,changelog-extract,changelog-guard,version-guard}.mjs`). Create `tests/assets/test-release-scaffold-verbatim.test.mjs`
**Interfaces:** Consumes Task A.

- [ ] **Step 1 (RED):** teste assertando: (a) **nenhum** arquivo sob `assets/release-scaffold/` contém `CLAUDE_PLUGIN_ROOT` (guardrail ADR-012); (b) `release.yml` faz `git add` do `CHANGELOG.md` (já nasce com o fix do PR #71); (c) `tag-release.yml` dispara em `push:main` + mudança de version file e extrai notas do CHANGELOG; (d) as libs copiadas são **byte-idênticas** às de `scripts/lib/` (sem drift na origem). Rodar → FAIL.
- [ ] **Step 2:** criar os assets (adaptar `release.yml`/`tag-release.yml` deste repo para paths genéricos: `scripts/bump-version.sh`, `scripts/lib/version-guard.mjs`; remover o que é específico do devflow — `gen-known-hashes`, os 3 manifests hardcoded).
- [ ] **Step 3:** PASS. **Step 4:** commit.

## Task C: Applier `release-scaffold.mjs` (gate + cópia verbatim)
**Files:** Create `scripts/lib/release-scaffold.mjs`, `tests/lib/release-scaffold.test.mjs`
**Interfaces:** Produces
`checkGate(cwd) → { git:bool, github:bool, reason }`
`planScaffold(cwd) → [{ src, dest, status:'create'|'exists' }]`
`applyScaffold(cwd, {dryRun}) → { created:[], preserved:[], refused:[] }` — copia **verbatim** (byte-a-byte); `exists` → **preserved** (nunca sobrescreve).

- [ ] **Step 1 (RED):** fixtures tmpdir + env isolado (`HOME`/`GIT_CONFIG_GLOBAL` em tmp, `GIT_TERMINAL_PROMPT=0`):
  1. Sem `git init` → `checkGate` `{git:false}` e `applyScaffold` **não cria nada**.
  2. `git init` sem remote → `{git:true, github:false}`.
  3. `git init` + `remote add origin https://github.com/x/y.git` → `{git:true, github:true}`.
  4. `applyScaffold` com gate ok → cria os 7 arquivos; **hash de cada destino == hash do asset** (verbatim).
  5. Arquivo de destino **já existe** → volta em `preserved`, conteúdo original **intacto**.
  6. `dryRun` → não escreve nada, retorna o plano.
  Rodar → FAIL.
- [ ] **Step 2:** implementar (`node:fs` + `execFileSync("git", ["-C", cwd, ...])`; sem `shell:true`). **Step 3:** PASS. **Step 4:** commit.

## Task D: Proveniência dos assets
**Files:** Modify `scripts/lib/gen-known-hashes.mjs`. Create casos em `tests/lib/release-scaffold.test.mjs`
**Interfaces:** Consumes Task B/C.

- [ ] **Step 1 (RED):** (a) `gen-known-hashes` passa a indexar `assets/release-scaffold/**`; (b) cópia verbatim → `provenance-sync` classifica **intocado** (atualizável); (c) editar 1 byte → classifica **preservado**; (d) arquivo **ausente** → **não recria**. Rodar → FAIL.
- [ ] **Step 2:** estender o indexador + wiring. **Step 3:** PASS. **Step 4:** commit.

## Task E: `skills/config/SKILL.md` — P5b reformulada
**Files:** Modify `skills/config/SKILL.md`. Create `tests/skills/test-config-p5b-scaffold.sh`

- [ ] **Step 1 (RED):** grep-asserts: (a) `pipeline` rotulado **RECOMENDADO**; (b) `local` rotulado "solo/simples, sem CI" **com os riscos** (bump na branch/conflito; tag+release manuais; CHANGELOG não cortado); (c) detecção de pipeline existente (`.github/workflows/*release*`); (d) **aviso** quando `pipeline` sem CI (não recusa); (e) oferta de scaffold **condicionada** a git+GitHub, listando os arquivos; (f) "nunca sobrescrever". Rodar → FAIL.
- [ ] **Step 2:** editar P5b + regras de geração. **Step 3:** PASS + regressão `tests/skills`. **Step 4:** commit.

## Task F: `/devflow update` aplica proveniência ao scaffold
**Files:** Modify `skills/context-sync/SKILL.md` (novo escopo). Casos em `tests/lib/release-scaffold.test.mjs`

- [ ] **Step 1 (RED):** teste/estrutural: o sync cobre os caminhos scaffoldados, reporta `{updated, preserved}` e **não recria** ausentes. Rodar → FAIL. **Step 2:** editar. **Step 3:** PASS. **Step 4:** commit.

## Task G: E2E do scaffold (fixture isolado)
**Files:** Create `tests/e2e/release-scaffold.e2e.test.mjs`

- [ ] **Step 1 (RED→GREEN por A-D):** repo-fixture `mktemp -d` **fora da árvore**, `git init` + remote **bare local** com URL simulando GitHub, env higienizado (`HOME`/`GIT_CONFIG_GLOBAL` em tmp, `unset GH_TOKEN GITHUB_TOKEN`, `GIT_TERMINAL_PROMPT=0`):
  1. `applyScaffold` → 7 arquivos criados, verbatim.
  2. Rodar `scripts/bump-version.sh minor` **dentro do fixture** → version files bumpados + `CHANGELOG.md` cortado (`[1.3.0]` não-vazio).
  3. `scripts/lib/version-guard.mjs` no fixture → **aprova** a transição.
  4. Asserção de defesa: **nenhum** comando tocou o repo real nem rede (o bare é local; `gh` nunca é invocado).
  **Step 2:** commit.

## Self-Review
- **Cobertura do spec:** §3.1→A/B; §3.2→E; §3.3→D/F; §4 (segurança: nunca sobrescrever, gate, verbatim)→C/B/E; §5→A,C,D,E,G. Sem lacuna.
- **Test-first:** todo task começa por RED. Tipos: A unit(.sh); B unit(.mjs, guard); C unit+integração(git fixtures); D proveniência; E estrutural (skill = prosa); G **E2E** (CLI tool + fluxo de release → E2E obrigatório).
- **Placeholders:** nenhum "TODO"; cada task tem os casos concretos e o contrato das funções.
- **Consistência de tipos:** `checkGate/planScaffold/applyScaffold` definidos em C e consumidos em D/F/G com as mesmas assinaturas.

## Gate P→R
- [x] Spec aprovado pelo operador + ADR-012 (gate 13/13)
- [x] Plano test-first (E2E obrigatório para o fluxo de release)
- [ ] Aprovação do operador para P→R
