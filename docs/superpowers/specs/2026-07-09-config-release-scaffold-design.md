# Spec — `devflow:config` avisa + scaffolda pipeline de release (rev. pós-review R)

> **Workflow DevFlow:** `config-release-scaffold` · **Escala:** MEDIUM · **Fase:** R (revisado)
> **Modo:** Full · **Autonomia:** supervised · **Data:** 2026-07-09 · **Status:** revisado após BLOCK (architect) + REVISE-HIGH (security)

## 1. Contexto e problema

`skills/config/SKILL.md` P5b é **detecção pura**: procura mecanismo de versão (`scripts/bump-version.sh` | `package.json:version` | `.claude-plugin/plugin.json`) e, se acha, pergunta **"bump local no finish"** vs **"pipeline de release (CI)"**. Grava `versioning` no `.devflow.yaml`. **Não cria nada.**

**Gap 1 — pipeline fantasma.** `versioning: pipeline` sem CI faz o finish **pular o bump** confiando numa pipeline inexistente → bump vira **no-op silencioso**.

**Gap 2 — o default é o modo mais frágil.** `ausente = local`. O modo `local` bumpa **na feature branch** (version files viram ímã de conflito em paralelo), sobe a versão **antes** do merge, só toca **arquivos** (tag/Release manuais) e **não corta o CHANGELOG** sem `bump-version.sh` → drift.

> **Validação registrada:** o aposentado (PRs #55/#56; header do `release.yml`) foi o **auto-bump por commit** (pre-commit), **não** o modo `versioning: local` (bump uma vez no finish). O pre-commit hoje só **valida**. `local` não está morto — está **mal-posicionado**.

**Restrições descobertas (fase P) e confirmadas no review (fase R):**
1. **A CI não alcança o plugin** → scaffoldar = **copiar código** para o repo do usuário.
2. **A proveniência por hash só cobre verbatim** → nada de templating; config por projeto = **detecção em runtime**.
3. **[R] O registry é um set plano de hashes de conteúdo** (`known-hashes.json` = `{schema, hashes[]}`; `decideArtifact` faz `registry.has(hash)`) — **path-agnóstico**. Renomear `assets/…/release.yml` → `.github/workflows/release.yml` **não quebra** o registry. **Mas:**
4. **[R-BLOCK] `provenance-sync.applySync` é contido a `.context/`** (`isWithinDir(dest, contextRoot)` → recusa todo dest fora) e `resolveArtifacts` só gera dests `.context/`. O scaffold precisa de **applier/sync próprios**.
5. **[R-BLOCK] `gen-known-hashes` filtra `.md`/`.js`** — `".mjs".endsWith(".js")` é **false** → assets `.yml`/`.sh`/`.mjs` nunca entram no registry.
6. **[R-BLOCK] `tag-release.yml` e `version-guard.mjs` não podem ser verbatim-genéricos:** o primeiro tem trigger estático **e** `grep` da versão hardcodado (repo `package.json` → `V=""` → tag lixo); o segundo tem `VERSION_FILES` fixo nos 3 manifests do devflow → CI do usuário **sempre vermelha**.
7. **[R-HIGH-segurança] O gate de permissões NÃO cobre o applier.** `hooks/pre-tool-use` só intercepta `Edit`/`Write` e ops git de Bash; `node *` está em `allow.exec`; `.github/**` não está em `allow.fs.write`. Escrita via `node:fs` dentro do applier é **invisível ao gate** → o "opt-in" viveria só na prosa.
8. **[R-MED-HIGH] `decideArtifact` untouched → `applySync` sobrescreve sem prompt.** Aceitável para skills em `.context/`; **inaceitável** para workflows executáveis (um plugin alterado reescreveria a CI do usuário num update de rotina).
9. **[R-MED] `sed` do bump não é ancorado** — `pyproject.toml`/`Cargo.toml` têm vários `version = "..."` (pins de dependência) → o bump genérico **corromperia as deps**. O arquivo `VERSION` tem conteúdo arbitrário → exige validação `^X.Y.Z$` fail-loud.

## 2. Decisões (D1-D5 da fase P; D6-D9 do review R)

- **D1 — Scaffold self-contained + proveniência.** Copiar workflow(s) + scripts necessários; drift governado por hash.
- **D2 — `versioning: local` REBAIXADO (não removido).** P5b apresenta **`pipeline` como RECOMENDADA** (com oferta de scaffold); `local` rotulado **"solo/simples, sem CI"** com riscos explícitos. Default de ausência continua `local` (retrocompat).
- **D3 — Gate: git + remote GitHub**, com **parsing ancorado por host** (não substring). Sem git → só avisa.
- **D4 — Avisar + oferecer + permitir seguir** (não recusar): "pipeline sem CI" é **não-verificável**.
- **D5 — Verbatim obrigatório.** A identidade exigida é **asset ↔ cópia no projeto** — **não** asset ↔ lib do devflow. (Correção: a assertiva anterior "byte-idêntico a `scripts/lib/`" era falsa e impedia genericidade.)
- **D6 [novo] — v1 mínimo: 3 arquivos.** `release.yml` + `bump-version.sh` genérico + `lib/changelog-cut.mjs`. **Cortados para v2:** `tag-release.yml`, `version-guard.mjs`, `changelog-guard.mjs`, `changelog-extract.mjs` — dependem de um `detect-version.mjs` genérico compartilhado (a criar) e de um `version-guard` genérico. v1 fecha o Gap 1 e elimina 3 dos 4 BLOCKs.
- **D7 [novo] — Enforcement real, não prosa.** A oferta de scaffold exige **confirmação humana estruturada** (enumerando os arquivos + aviso "isto roda na SUA CI com token de escrita"), **exibição do conteúdo**, **`--dry-run` obrigatório** antes da 1ª escrita, e o applier **recusa executar sem `confirmed: true`**. **Proibido em modo autônomo** sem gate humano. Em branch protegida, rotear por work branch/PR.
- **D8 [novo] — Update de artefato classe-CI exige diff + confirmação.** `syncScaffold` **nunca** faz auto-overwrite silencioso: `untouched` + conteúdo do plugin mudou → **mostra diff e pede OK**; `edited` → preserva e reporta; `ausente` → **não recria**.
- **D9 [novo] — Applier/sync próprios, com contenção equivalente.** Não passar por `provenance-sync.applySync` (contido a `.context/`). Reusar apenas as funções **puras** `loadRegistry`+`decideArtifact`. Contenção: dest **dentro de `projectRoot`**, **apenas** os paths exatos da allowlist, **recusa symlink e `..`**. `gen-known-hashes` estende o filtro para `.yml`/`.sh`/`.mjs` e indexa `assets/release-scaffold/**`.

## 3. Design (v1)

### 3.1 Assets verbatim — `assets/release-scaffold/` (3 arquivos)
| Copiado para | Papel |
|---|---|
| `.github/workflows/release.yml` | `workflow_dispatch(bump: patch\|minor\|major)` → `scripts/bump-version.sh` → abre **release PR**. **Já nasce com o fix do PR #71** (`git add CHANGELOG.md`). `bump` é `type: choice` e chega ao `run:` via **`env:`** (não `${{ }}` inline). |
| `scripts/bump-version.sh` | **Genérico e endurecido**: detecta manifests **na raiz apenas** (sem walk); valida `^X.Y.Z$` **fail-loud**; **`sed` ancorado** (nunca toca `version =` de dependências); chama `lib/changelog-cut.mjs` por path **relativo ao script**; **sem** bloco `gen-known-hashes --append`. |
| `scripts/lib/changelog-cut.mjs` | `[Unreleased]` → `[X.Y.Z] — data` + `[Unreleased]` novo vazio. Idempotente. |

Detecção (raiz, ordem; **source of truth** = primeiro encontrado; todos os presentes são atualizados): `package.json` → `pyproject.toml` → `Cargo.toml` → `.claude-plugin/plugin.json` → `VERSION`.

**v2 (fora deste escopo):** `tag-release.yml` + `version-guard`/`changelog-guard`/`changelog-extract` genéricos, após `detect-version.mjs` compartilhado.

### 3.2 `scripts/lib/release-scaffold.mjs`
- `checkGate(cwd) → { git, github, reason }` — **host ancorado**: extrai o host do remote (após scheme ou `@`, até `/`|`:`) e exige `host === "github.com"`. Rejeita `github.com.evil.tld`, `evilgithub.com`; aceita SSH `git@github.com:`; múltiplos remotes → qualquer GitHub conta (explícito).
- `planScaffold(cwd) → [{ src, dest, status: 'create'|'exists' }]`
- `applyScaffold(cwd, { dryRun, confirmed }) → { created, preserved, refused }` — **recusa tudo se `confirmed !== true`**; `exists` → `preserved` (nunca sobrescreve); contenção (D9).
- `syncScaffold(cwd, { onDiff }) → { updated, preserved, skipped, needsConfirm }` — usa `loadRegistry`+`decideArtifact`: `untouched` & plugin mudou → `needsConfirm` (com diff) e **só escreve após OK**; `edited` → `preserved`; ausente → `skipped` (não recria).

### 3.3 `skills/config/SKILL.md` — P5b
Detecção de pipeline existente (`.github/workflows/*release*`); opções reordenadas (**pipeline RECOMENDADO**, `local` "solo/simples" com riscos, `none`); se `pipeline` sem CI: **avisa** e — só com git+GitHub — **oferece scaffold** com confirmação estruturada (D7). Nunca sobrescreve. Branch protegida → work branch.

## 4. Segurança (controles, não prosa)
| Risco | Controle exigido |
|---|---|
| Escrever `.github/workflows/` planta código com `contents/PR write` **fora do gate de permissões** | Confirmação estruturada enumerando arquivos + aviso explícito de token de escrita; **mostrar conteúdo**; `--dry-run` obrigatório; applier **recusa sem `confirmed:true`**; **proibido em autônomo**; teste "sem confirmação → não escreve" |
| Update silencioso reescrevendo a CI | **D8**: diff + confirmação para classe-CI; nunca auto-overwrite |
| Proveniência ≠ atestação | Documentado na ADR-012 (fronteira de confiança): hash detecta **deriva local**, **não** plugin comprometido |
| Contenção de path relaxada | **D9**: allowlist exata sob `projectRoot`; recusa symlink e `..` |
| Bump corromper versões de dependências | `sed` **ancorado** ao campo canônico da seção (`[project]`/`[tool.poetry]`/`[package]`); RED test com multi-`version =` |
| Manifest malicioso (`VERSION` arbitrário) | Validar `^[0-9]+\.[0-9]+\.[0-9]+$` **antes** de qualquer uso; fail-loud |
| Deriva de trigger no workflow copiado | Guard-test: **sem `pull_request_target`**; inputs `type: choice`; `env:`-indireção |
| Gate GitHub por substring | Parsing **ancorado por host** + casos adversariais |

## 5. Estratégia de testes (TDD)
- **Unit `bump-version.sh`** (fixtures tmpdir): detecção por manifest; semver patch/minor/major; **nenhum manifest → falha limpa**; **versão não-semver/metacaracteres → recusa sem executar**; **pyproject/Cargo com múltiplos `version =` → deps intocadas**; CHANGELOG cortado quando presente; **raiz-apenas** (subdir com `package.json` é ignorado).
- **Unit assets (guard):** nenhum `CLAUDE_PLUGIN_ROOT`; nenhum `pull_request_target`; inputs `type: choice`; `release.yml` faz `git add CHANGELOG.md`.
- **Unit `release-scaffold.mjs`:** gate (sem git / git sem remote / GitHub https / SSH / `github.com.evil.tld` / `evilgithub.com` / GHE / multi-remote); `applyScaffold` **sem `confirmed` → não escreve**; verbatim (hash dest == hash asset); `exists` → preservado, conteúdo intacto; `dryRun` não escreve; symlink/`..` → recusado.
- **Unit `syncScaffold`:** intocado + plugin mudou → `needsConfirm` (não escreve sozinho); editado → preservado; ausente → skipped.
- **E2E** (tmpdir fora da árvore; `HOME`/`GIT_CONFIG_GLOBAL`/`GH_CONFIG_DIR` em tmp; `GIT_CONFIG_SYSTEM=/dev/null`; `GIT_CONFIG_NOSYSTEM=1`; `GIT_TERMINAL_PROMPT=0`; `unset GH_TOKEN GITHUB_TOKEN`; identidade git local; **`origin` = path local**, jamais URL de rede): scaffold → `bump-version.sh minor` → version files + CHANGELOG cortado. **Asserção positiva: nenhum `git push` nem `gh` foi invocado.**

## 6. ADR
ADR-012 (`ci-scaffold-verbatim-provenance`) precisa de **EVOLVE minor**: (a) guardrail "artefato classe-CI exige diff + confirmação no update; nunca auto-overwrite"; (b) guardrail "applier recusa escrever sem confirmação humana explícita; proibido em modo autônomo"; (c) registrar a **fronteira de confiança** (proveniência por hash = deriva local, não atestação de supply-chain).

## 7. Referências
`skills/config/SKILL.md`; `scripts/bump-version.sh:8,19,42,54-61`; `.github/workflows/release.yml:11-18,20-22,47`; `.github/workflows/tag-release.yml:9-15,34`; `scripts/lib/provenance-sync.mjs:34-40,83,90,97,106,114`; `scripts/lib/gen-known-hashes.mjs:28-34,85`; `scripts/lib/version-guard.mjs:19-23,58-66`; `hooks/pre-tool-use:168-284`; `.context/permissions.yaml:86-97`; `skills/context-sync/SKILL.md:142-155`.
