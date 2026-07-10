# Config: aviso + scaffold de pipeline de release — Plano (rev. pós-review R)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development ou superpowers:executing-plans. Steps usam checkbox (`- [ ]`).
>
> **DevFlow workflow:** `config-release-scaffold` · **Scale:** MEDIUM · **Phase:** R (re-gate)
> **Spec:** `docs/superpowers/specs/2026-07-09-config-release-scaffold-design.md` (rev.) · **ADR:** `012-ci-scaffold-verbatim-provenance` (a evoluir p/ v1.1.0)

**Goal:** `devflow:config` avisa quando `versioning: pipeline` é escolhido sem CI e oferece scaffold **verbatim** de uma pipeline de release (v1 = 3 arquivos), com **enforcement real** (confirmação + dry-run + contenção), rebaixando `versioning: local`.

**Architecture:** Assets verbatim em `assets/release-scaffold/`. Um applier **próprio** (`release-scaffold.mjs`) copia sem interpolação, **recusa sem confirmação humana**, nunca sobrescreve, e mantém contenção por allowlist. O update usa `syncScaffold` (reusa só `loadRegistry`+`decideArtifact`) e **exige diff+confirmação** para artefatos classe-CI.

**Tech Stack:** bash, Node ESM (`node --test`), GitHub Actions, git (fixtures).

## Mudanças desta revisão (pós-review R)
- **[architect BLOCK]** Escopo cortado a **3 arquivos** (v1): `tag-release.yml`/`version-guard`/`changelog-guard`/`changelog-extract` **não podem ser verbatim-genéricos** → v2, após `detect-version.mjs`.
- **[architect BLOCK]** `provenance-sync.applySync` é contido a `.context/` e `resolveArtifacts` só gera dests `.context/` → **applier/sync próprios**. `gen-known-hashes` filtra `.md`/`.js` → **estender p/ `.yml`/`.sh`/`.mjs`**.
- **[architect]** Assertiva falsa removida: a proveniência exige identidade **asset↔cópia**, não asset↔`scripts/lib/`.
- **[security HIGH]** O applier escreve via `node:fs` → **invisível ao `pre-tool-use`**. Enforcement vira **código + teste**: `confirmed:true` obrigatório, dry-run, conteúdo exibido, proibido em autônomo.
- **[security MED-HIGH]** `syncScaffold` **nunca** auto-sobrescreve classe-CI: `untouched`+mudou → `needsConfirm` com diff.
- **[security MED]** `sed` **ancorado** (deps intocadas) + validação `^X.Y.Z$` fail-loud (incl. `VERSION`).
- **[security]** Guard-tests dos assets (sem `pull_request_target`; inputs `type: choice`; `env:`-indireção); gate GitHub **ancorado por host**; higiene E2E completa.

## Global Constraints (ADR-012 + review R)
- **Verbatim:** cópia byte-a-byte do **asset**; NUNCA interpolar. Config por projeto = **detecção em runtime**.
- **CI não alcança o plugin:** nenhum arquivo sob `assets/release-scaffold/` contém `CLAUDE_PLUGIN_ROOT`.
- **Nunca sobrescrever** arquivo do usuário no scaffold inicial. **Nunca auto-overwrite** classe-CI no update (diff+OK).
- **Applier recusa sem `confirmed: true`**; proibido em modo autônomo sem gate humano; branch protegida → work branch.
- **Contenção:** dest dentro de `projectRoot`, **só** os paths da allowlist; recusa symlink e `..`.
- **Gate:** git **e** remote com host **exatamente** `github.com` (parsing ancorado). Sem git → só avisa.
- Testes em **tmpdir**; nunca tocar repo/remote/CI real; `origin` dos fixtures é **path local**.
- Repo do plugin: `versioning: pipeline`. Finalizar honrando `autoFinish:true`. **Gotcha:** não stashar o WIP durante edições (deny fail-closed do `permissions.yaml`); finalizar com merge sem `--delete-branch` + cleanup manual.

## Estrutura de arquivos
- Create: `assets/release-scaffold/{release.yml,bump-version.sh}` + `assets/release-scaffold/lib/changelog-cut.mjs`
- Create: `scripts/lib/release-scaffold.mjs` · `tests/lib/release-scaffold.test.mjs`
- Create: `tests/scripts/test-bump-version-generic.sh` · `tests/assets/test-release-scaffold-guards.test.mjs`
- Create: `tests/e2e/release-scaffold.e2e.test.mjs`
- Modify: `scripts/lib/gen-known-hashes.mjs` · `skills/config/SKILL.md` · `skills/context-sync/SKILL.md`
- Create: `tests/skills/test-config-p5b-scaffold.sh`
- Evolve: `.context/engineering/adrs/012-…` → v1.1.0

---

## Task 0: EVOLVE ADR-012 → v1.1.0 + promover a `Aprovado`
**Files:** `.context/engineering/adrs/012-ci-scaffold-verbatim-provenance-v1.0.0.md` (via `adr-evolve.mjs --kind=minor`)

- [ ] **Step 1:** adicionar guardrails: (a) "NUNCA aplicar update em artefato **classe-CI** sem **diff + confirmação**"; (b) "NUNCA escrever scaffold sem confirmação humana; **NUNCA escrever com `autonomy: autonomous`**; `.github/workflows/**` é gravado pela ferramenta **`Write`** (gate de permissões), nunca por `node:fs`"; (c) **[N1]** "NUNCA deixar hardcode específico do plugin (`.claude-plugin/`, `.cursor-plugin/`, `known-hashes`, grep de manifest fixo) num asset de release-scaffold". Consequências: **fronteira de confiança** — proveniência por hash = deriva **local**, não atestação de supply-chain.
- [ ] **Step 2 [N3]:** promover `status: Proposto` → **`Aprovado`** (guardrail inerte na governança enquanto Proposto) e **estender `## Enforcement`** linkando os testes: C.9 (sem-confirmação), **C.9b (autônomo)**, D.1c (diff), C.13 (contenção), **B.1h (anti-hardcode)**.
- [ ] **Step 3:** `adr-evolve --kind=minor --apply` + `adr-audit --enforce-gate` → PASS. **Step 4:** commit.

## Task A: `bump-version.sh` genérico e endurecido
**Files:** Create `assets/release-scaffold/bump-version.sh`, `tests/scripts/test-bump-version-generic.sh`
**Interfaces:** Produces CLI `bump-version.sh [patch|minor|major]`.

- [ ] **Step 1 (RED):** fixtures `mktemp -d`:
  1. `package.json` `"version":"1.2.3"` → `minor` → `1.3.0`.
  2. `pyproject.toml` `[project] version = "0.1.0"` → `patch` → `0.1.1`.
  3. **`pyproject.toml` com deps** (`requests = "2.31.0"`, `version = "1.0.0"` em `[tool.poetry.dependencies]`) → **só o canônico muda; deps intocadas** (segurança: `sed` ancorado).
  4. `Cargo.toml` `[package] version` → `major`; deps em `[dependencies]` **intocadas**.
  5. **Múltiplos manifests** → todos atualizados; source of truth = `package.json`.
  6. **Nenhum manifest** → exit != 0, mensagem clara, nada alterado.
  7. **`VERSION` com conteúdo malicioso** (`1.0.0"; touch /tmp/pwn`) → **recusa** (`^X.Y.Z$` fail-loud), nada executado, `/tmp/pwn` não existe.
  8. **`VERSION` não-semver** (`v1.0`, `2024.07`) → recusa limpa.
  9. `subdir/package.json` presente e raiz sem manifest → **ignora o subdir** (raiz-apenas), exit != 0.
  10. `CHANGELOG.md` + `lib/changelog-cut.mjs` → `[Unreleased]` vira `[1.3.0] — data`; sem CHANGELOG → bump ok.
  11. **[N1 — interface A↔B]** com `GITHUB_OUTPUT` setado (arquivo tmp) → o script grava `version=1.3.0` **e** `files=package.json` nele; sem `GITHUB_OUTPUT` → a versão nova é o **último token de stdout**. (Assim o `release.yml` nunca re-grepa manifest.)
  12. **[N4]** leitura da versão ATUAL também é ancorada: `pyproject.toml` com pin `foo = { version = "9.9.9" }` antes do `[project] version` → CURRENT lido é o canônico, não o pin.
  Rodar → FAIL (script ausente).
- [ ] **Step 2 (GREEN):** implementar. `REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"`; detecção raiz-apenas; `validate_semver()` antes de qualquer uso; read **e** write **ancorados por seção/campo canônico** (`/^\[project\]/,/^\[/` etc., `^version\s*=` a início de linha); emitir `version=`/`files=` em `$GITHUB_OUTPUT` quando setado + versão como último token de stdout; `node "$REPO_ROOT/scripts/lib/changelog-cut.mjs"`; **sem** `gen-known-hashes --append`; sem `CLAUDE_PLUGIN_ROOT`.
- [ ] **Step 3:** PASS. **Step 4:** commit.

## Task B: Assets v1 + guard-tests
**Files:** Create `assets/release-scaffold/release.yml`, `assets/release-scaffold/lib/changelog-cut.mjs` (cópia verbatim de `scripts/lib/changelog-cut.mjs`), `tests/assets/test-release-scaffold-guards.test.mjs`
**Interfaces:** Consumes Task A.

- [ ] **Step 1 (RED):** asserts: (a) nenhum arquivo sob `assets/release-scaffold/` contém `CLAUDE_PLUGIN_ROOT`; (b) `release.yml` stageia o `CHANGELOG.md` (fix #71); (c) **nenhum `pull_request_target`** nem `pull_request` com acesso a secrets; (d) `workflow_dispatch` input `bump` é `type: choice`; (e) o `run:` usa **`env:`** (`BUMP: ${{ inputs.bump }}` + `bash scripts/bump-version.sh "$BUMP"`), **não** `${{ }}` inline; (f) `permissions:` é o mínimo (`contents: write`, `pull-requests: write`); (g) `changelog-cut.mjs` do asset é byte-idêntico ao de `scripts/lib/` **na criação** (garante origem; não é contrato futuro);
  **(h) [N1 — anti-hardcode] o asset `release.yml` NÃO contém** `.claude-plugin`, `.cursor-plugin`, `marketplace.json`, `known-hashes`, nem `grep` de manifest fixo (`plugin.json`);
  **(i) [N1] a versão nova vem do `bump-version.sh`** (via `steps.<id>.outputs.version` de `$GITHUB_OUTPUT`), nunca de um `grep` no workflow;
  **(j) [N1] o staging é genérico** (`git add -A` ou a lista `files=` emitida pelo script), sem pathspec fixo. Rodar → FAIL.
- [ ] **Step 2:** criar os assets. Adaptar `release.yml` deste repo: paths genéricos (`scripts/bump-version.sh`); **remover** o step `version-guard` e o `known-hashes` (fora do v1); **genericizar a leitura da versão** (consumir `outputs.version`) **e o `git add`** (sem `.claude-plugin`/`.cursor-plugin`); ajustar o corpo do PR (checklist v1: "sem changelog-guard — confira as notas"). **Step 3:** PASS. **Step 4:** commit.

## Task C: `release-scaffold.mjs` — gate + `applyScaffold` (enforcement real)
**Files:** Create `scripts/lib/release-scaffold.mjs`, `tests/lib/release-scaffold.test.mjs`
**Interfaces:** Produces
`checkGate(cwd) → { git:boolean, github:boolean, reason:string }`
`planScaffold(cwd) → [{ src, dest, content, status:'create'|'exists', writer:'fs'|'tool' }]` — `writer:'tool'` p/ `.github/workflows/**` (D7b)
`applyScaffold(cwd, { dryRun=false, confirmed=false }) → { created:[], preserved:[], refused:[], mustWriteViaTool:[] }` — **recusa se `autonomy: autonomous`** (D7a) e **nunca** grava `.github/workflows/**` por `node:fs`

- [ ] **Step 1 (RED):** fixtures tmpdir + env isolado (`HOME`/`GIT_CONFIG_GLOBAL`/`GH_CONFIG_DIR` em tmp; `GIT_CONFIG_SYSTEM=/dev/null`; `GIT_CONFIG_NOSYSTEM=1`; `GIT_TERMINAL_PROMPT=0`; identidade git local):
  1. sem `git init` → `{git:false}`; `applyScaffold` **não cria nada**.
  2. `git init` sem remote → `{git:true, github:false}`.
  3. remote `https://github.com/x/y.git` → `{github:true}`.
  4. remote `git@github.com:x/y.git` (SSH) → `{github:true}`.
  5. **`https://github.com.evil.tld/x/y.git` → `{github:false}`** (host ancorado).
  6. **`https://evilgithub.com/x/y.git` → `{github:false}`**.
  7. `https://github.company.com/...` (GHE) → `{github:false}` (documentado).
  8. multi-remote com um GitHub → `{github:true}`.
  8b. **[N2 userinfo] `https://github.com@evil.tld/x/y.git` → `{github:false}`** (host real = `evil.tld`).
  8c. **[N2 userinfo] `https://user@github.com/x/y.git` → `{github:true}`**.
  8d. **[3º re-gate] `ssh://git@github.com:22/x/y.git` → `{github:true}`** (forma URL de SSH: ramo URL + last-`@` + strip de porta).
  8e. **[3º re-gate] `https://github.com:443/x/y.git` → `{github:true}`** (porta) · `https://GitHub.com/x/y` → `{github:true}` (host **lowercased** antes do `===`).
  9. **`applyScaffold` sem `confirmed:true` → `refused` (nada escrito)** ← controle HIGH.
  **9b. [D7a — fecha o HIGH] `.context/workflow/status.yaml` com `autonomy: autonomous` + `confirmed:true` → `refused` (nada escrito).** O guard lê a **fonte real da autonomia** (a mesma de `hooks/post-tool-use:272-281`, não o `.devflow.yaml` — lá não existe esse campo) e recusa independentemente da flag. Casos: `assisted` → refused; `supervised` → permitido; `status.yaml` ausente → tratado como `supervised` (mesmo default do hook).
  **9c. [D7b] `.github/workflows/release.yml` NUNCA é escrito por `node:fs`** — sai em `mustWriteViaTool` (com `content`); só `scripts/**` é criado pelo applier.
  **9d. [N6a] `verifyWritten(cwd)`** — após o workflow ser gravado (pela ferramenta `Write`), `hash(dest) === hash(asset)`; **1 byte alterado → `mismatch` fail-loud**. (O conteúdo transita pelo LLM; sem isto o único artefato que executa em CI seria o único sem garantia de bytes.)
  **9e.** branch protegida → `applyScaffold` recusa (evita `scripts/**` órfãos quando o `Write` for negado).
  10. `confirmed:true, dryRun:true` → nada escrito, retorna plano.
  11. `confirmed:true` + gate ok → cria os arquivos `writer:'fs'`; **hash dest == hash asset** (verbatim).
  12. dest **já existe** → `preserved`; conteúdo original **intacto**.
  13. dest é **symlink** ou path com `..` → `refused` (contenção).
  **13b. [hardening] diretório-pai é symlink apontando fora do `projectRoot` → `refused`** (`realpath` do pai + re-checagem de contenção antes de escrever; `isWithinDir` é léxico e não segue symlink).
  Rodar → FAIL.
- [ ] **Step 2:** implementar (`node:fs` + `execFileSync("git", ["-C", cwd, ...])`; sem `shell:true`). `parseHost()` ancorado (userinfo descartado: host = após o **último `@`** do authority). Guard de autonomia lê `.context/workflow/status.yaml` (fonte real; default `supervised` quando ausente). Qualquer leitura de `.devflow.yaml` usa `devflow-config.mjs` (ADR-011 — **nunca** re-parsear ad-hoc). **Step 3:** PASS. **Step 4:** commit.

## Task D: `syncScaffold` (update seguro) + `gen-known-hashes`
**Files:** Modify `scripts/lib/gen-known-hashes.mjs`; extend `scripts/lib/release-scaffold.mjs` + testes
**Interfaces:** Produces `syncScaffold(cwd, { confirm }) → { updated:[], preserved:[], skipped:[], needsConfirm:[{dest, diff}] }` (reusa `loadRegistry`+`decideArtifact` de `provenance-sync.mjs` — **funções puras apenas**).

- [ ] **Step 1 (RED):** (a) `gen-known-hashes` indexa `assets/release-scaffold/**` por um **`walk` SEPARADO com seu próprio conjunto de extensões** (`.yml`/`.sh`/`.mjs`) — **NÃO ampliar o filtro global** (`distributableFiles` só varre `skills/**` e `assets/standards/profiles/**` com `.md`/`.js`; ampliá-lo poluiria o registry compartilhado com `.yml`/`.mjs` de skills). Teste: hashes do scaffold entram; **nenhum `.yml`/`.mjs` de `skills/**` entra**; (b) cópia verbatim → `decideArtifact` = `untouched`; (c) `untouched` + asset mudou → **`needsConfirm` com diff; NÃO escreve** sem `confirm`; (d) `confirm` → `updated`; (e) editado 1 byte → `preserved`; (f) ausente → `skipped` (**não recria**); (g) contenção mantida (symlink/`..`/pai-symlink → refused). Rodar → FAIL.
- [ ] **Step 2:** implementar. **Step 3:** PASS. **Step 4:** commit.

## Task E: `skills/config/SKILL.md` — P5b + confirmação estruturada
**Files:** Modify `skills/config/SKILL.md`; Create `tests/skills/test-config-p5b-scaffold.sh`

- [ ] **Step 1 (RED):** grep-asserts: (a) `pipeline` rotulado **RECOMENDADO**; (b) `local` "solo/simples, sem CI" **com os riscos** (bump na branch/conflito; tag+Release manuais; CHANGELOG não cortado); (c) detecção de pipeline existente; (d) **avisa** (não recusa) quando `pipeline` sem CI; (e) oferta **condicionada** a git+GitHub; (f) confirmação **estruturada** enumerando os 3 arquivos + aviso **"roda na SUA CI com `contents:write`/`pull-requests:write`"**; (g) **mostrar o conteúdo** e rodar **`--dry-run`** antes da 1ª escrita; (h) "**nunca sobrescrever**"; (i) **proibido em modo autônomo** (a skill afirma; o **enforcement mecânico** vive em C.9b); (j) branch protegida → work branch; **(k) [D7b] a skill grava `.github/workflows/**` pela ferramenta `Write`** (consumindo `mustWriteViaTool`), **nunca** deixando o applier escrever por `node:fs`; **(l) [N4] a confirmação avisa** "seu pipeline v1 não tem `changelog-guard` — confira as notas do release à mão". Rodar → FAIL.
- [ ] **Step 2:** editar P5b + regras de geração. **Step 3:** PASS + regressão `tests/skills`. **Step 4:** commit.

## Task F: `/devflow update` chama `syncScaffold` (código, não prosa)
**Files:** Modify `skills/context-sync/SKILL.md`; casos em `tests/lib/release-scaffold.test.mjs`

- [ ] **Step 1 (RED):** o sync do scaffold é invocado **fora** do `provenance-sync.applySync` (que recusaria dests fora de `.context/`), reporta `{updated, preserved, skipped, needsConfirm}` e **não recria** ausentes; classe-CI só atualiza após confirmação. Rodar → FAIL. **Step 2:** editar + wiring. **Step 3:** PASS. **Step 4:** commit.

## Task G: E2E isolado
**Files:** Create `tests/e2e/release-scaffold.e2e.test.mjs`

- [ ] **Step 1 (RED→GREEN por A-D):** fixture `mktemp -d` **fora da árvore**; `git init` + `origin` = **path local** (bare), jamais URL de rede; env: `HOME`/`GIT_CONFIG_GLOBAL`/`GH_CONFIG_DIR` em tmp, `GIT_CONFIG_SYSTEM=/dev/null`, `GIT_CONFIG_NOSYSTEM=1`, `GIT_TERMINAL_PROMPT=0`, `unset GH_TOKEN GITHUB_TOKEN`, identidade git local. Cenários: (1) **[N6a, redação corrigida]** `applyScaffold({confirmed:true})` → **2 arquivos `writer:'fs'` materializados verbatim + 1 em `mustWriteViaTool`** (o workflow); o teste então **grava o workflow via ferramenta `Write`** e roda **`verifyWritten` → `hash(dest)===hash(asset)`**; mutar 1 byte antes do Write → `mismatch` fail-loud; (2) `bash scripts/bump-version.sh minor` no fixture → version files + `CHANGELOG.md` cortado (`[1.3.0]` não-vazio); (3) **asserção positiva: nenhum `git push` e nenhum `gh` foi invocado** (stub que marca sentinel; ausência do sentinel = pass); (4) o gate GitHub é testado em unidade (Task C), **não** com URL real.
  **Step 2:** commit.

## Self-Review
- **Cobertura do spec (rev.):** §3.1→A/B; §3.2→C/D; §3.3→E; §3.3(update)→F; §4 (todos os controles)→A(sed/semver), B(guards), C(confirmed/contenção), D(diff), E(confirmação/autônomo), G(higiene); §6→Task 0. Sem lacuna.
- **BLOCKs endereçados:** escopo cortado (B/C/D do architect); applier/sync próprios + filtro de extensões (A do architect); assertiva falsa removida; contrato de `syncScaffold` definido (E do architect).
- **Controles de segurança viraram RED tests:** HIGH (Task C.9, E.f-i), MED-HIGH (D.c), MED (A.3/A.4/A.7/A.8), gate (C.5-C.8), E2E (G.3).
- **Test-first:** todo task abre por RED. Task E estrutural (skill = prosa) — correto. Task G **E2E obrigatório** (ferramenta CLI + fluxo de release).

## Gate R (2º re-gate)
- [x] Spec (D6-D10) + plano reescritos
- [x] BLOCKs do architect (1-6) endereçados
- [x] **HIGH fechado mecanicamente:** D7a guard de autonomia (C.9b, lendo `status.yaml` — a fonte real) + D7b workflow gravado via ferramenta `Write` (C.9c, E.k) → não depende mais de `confirmed:true` (que era teatro contra o vetor autônomo)
- [x] **N1** (asset `release.yml` genérico: interface A↔B via `$GITHUB_OUTPUT` + `git add` genérico + guard-test anti-hardcode B.1h-j)
- [x] **N2** (userinfo no gate: C.8b/C.8c) · **N3** (ADR → `Aprovado` + Enforcement, Task 0) · **N4** (aviso "sem changelog-guard", E.l) · nits (assinatura `{confirm}`; walk separado no `gen-known-hashes`; symlink do pai C.13b)
- [x] **3º re-gate: PROCEED** — security declara **HIGH e MED-HIGH mitigados**. Condições vinculantes aplicadas: **N6b** (spec §3.2 lia `.devflow.yaml` → corrigido p/ `status.yaml`; ao pé da letra o D7a falharia aberto) e **N6a** (`verifyWritten`: o workflow — único que roda em CI — era o único **sem** garantia de bytes, pois o conteúdo transita pelo LLM). +`marketplace.json` na denylist, `ssh://…:port`/porta/lowercase no gate, `applyScaffold` recusa em branch protegida.
- [x] **Enquadramento honesto:** **D7b é o controle mecânico** (`.github/**` fora de `allow.fs.write` → `mode: prompt`; branch protegida → DENY). **D7a é auxiliar e auto-contornável** (`status.yaml` é gravável e branch-exempt).
- [ ] Aprovação do operador para R→E

## Vetor residual conhecido (pré-existente, global — follow-up de produto)
Um agente não-cooperativo escreve `.github/**` por **Bash** (`printf >`, `cp`), contornando D7a **e** D7b: o `hooks/pre-tool-use` só guarda `git push|gh pr merge|git commit` em Bash e faz `exit 0` para `TOOL_NAME != Edit/Write`. **Não é introduzido por esta feature** (é o buraco global "Bash escreve qualquer arquivo"). Follow-up: endurecer `permissions.yaml` contra escrita em `.github/**` via Bash.
