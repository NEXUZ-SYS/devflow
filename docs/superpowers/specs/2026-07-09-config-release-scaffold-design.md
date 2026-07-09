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
- **D7 [novo, endurecido no re-gate] — Enforcement real, não prosa.** A oferta exige **confirmação humana estruturada** (enumerando os arquivos + aviso "isto roda na SUA CI com token de escrita"), **exibição do conteúdo** e **`--dry-run` obrigatório**. Além disso, dois controles **mecânicos** (porque `confirmed: true` é flag auto-setável e a escrita via `node:fs` é **invisível ao `pre-tool-use`**):
  - **D7a — Guard de autonomia:** `applyScaffold` lê a **fonte real da autonomia** — `.context/workflow/status.yaml` (a mesma de `hooks/post-tool-use:272-281`; o `.devflow.yaml` **não** tem esse campo, ler dele falharia **aberto**) — e **RECUSA em `autonomous`/`assisted`**, independentemente de `confirmed`. Ausente → `supervised` (default do hook). "Proibido em autônomo" deixa de ser prosa.
  - **D7b — Escrita de workflow pela ferramenta `Write`:** `.github/workflows/**` **NÃO** é escrito por `node:fs`. O applier devolve o conteúdo e a **skill grava via `Write`**, caindo no gate de permissões (`mode: prompt`) + branch protection — um gate humano que o agente **não forja**. `node:fs` fica restrito a `scripts/**`.
  Em branch protegida, rotear por work branch/PR.
- **D8 [novo] — Update de artefato classe-CI exige diff + confirmação.** `syncScaffold` **nunca** faz auto-overwrite silencioso: `untouched` + conteúdo do plugin mudou → **mostra diff e pede OK**; `edited` → preserva e reporta; `ausente` → **não recria**.
- **D9 [novo] — Applier/sync próprios, com contenção equivalente.** Não passar por `provenance-sync.applySync` (contido a `.context/`). Reusar apenas as funções **puras** `loadRegistry`+`decideArtifact`. Contenção: dest **dentro de `projectRoot`**, **apenas** os paths exatos da allowlist, **recusa symlink e `..`**. `gen-known-hashes` estende o filtro para `.yml`/`.sh`/`.mjs` e indexa `assets/release-scaffold/**`.

## 3. Design (v1)

### 3.1 Assets verbatim — `assets/release-scaffold/` (3 arquivos)
| Copiado para | Papel |
|---|---|
| `.github/workflows/release.yml` | `workflow_dispatch(bump: patch\|minor\|major)` → `scripts/bump-version.sh` → abre **release PR**. Fix do PR #71 (`git add` do CHANGELOG). `bump` é `type: choice` e chega ao `run:` via **`env:`** (não `${{ }}` inline). **[re-gate N1] 100% genérico:** NÃO contém `.claude-plugin`/`.cursor-plugin`/`known-hashes` nem `grep` de manifest fixo. |
| `scripts/bump-version.sh` | **Genérico e endurecido**: detecta manifests **na raiz apenas** (sem walk); valida `^X.Y.Z$` **fail-loud**; **`sed` ancorado** (nunca toca `version =` de dependências); chama `lib/changelog-cut.mjs` por path **relativo ao script**; **sem** bloco `gen-known-hashes --append`. |
| `scripts/lib/changelog-cut.mjs` | `[Unreleased]` → `[X.Y.Z] — data` + `[Unreleased]` novo vazio. Idempotente. |

Detecção (raiz, ordem; **source of truth** = primeiro encontrado; todos os presentes são atualizados): `package.json` → `pyproject.toml` → `Cargo.toml` → `VERSION`. (Sem `.claude-plugin/plugin.json`: o guardrail anti-hardcode da ADR-012 v1.1.0 o proíbe — o asset roda no repo do usuário.)

**[re-gate N1] Interface A↔B (contrato):** o `release.yml` **nunca** re-grepa um manifest para descobrir a versão nova. O `bump-version.sh`:
- escreve `version=<X.Y.Z>` em `$GITHUB_OUTPUT` quando a variável está setada, **e**
- imprime a versão nova como **último token de stdout** (fallback fora do CI);
- imprime, em `$GITHUB_OUTPUT`, `files=<lista dos manifests atualizados>` — o `release.yml` **stageia essa lista + `CHANGELOG.md`** (ou usa `git add -A`, já que o checkout de CI é limpo). Nada de pathspec fixo.

**[re-gate N4] Trade-off documentado do v1:** sem `version-guard`/`changelog-guard`, o pipeline scaffoldado **não** falha com `[Unreleased]` vazio. A confirmação da skill deve dizer explicitamente: *"seu pipeline v1 não tem changelog-guard — confira as notas do release à mão"*.

**v2 (fora deste escopo):** `tag-release.yml` + `version-guard`/`changelog-guard`/`changelog-extract` genéricos, após `detect-version.mjs` compartilhado.

### 3.2 `scripts/lib/release-scaffold.mjs`
- `checkGate(cwd) → { git, github, reason }` — **host ancorado**. Parsing: para SSH (`git@host:path`) o host é entre `@` e `:`; para URL, o host é **após o último `@` do componente authority** (userinfo descartado) e antes de `/`|`:`. Exige `host === "github.com"`.
  **[re-gate N2] Casos fixados por teste:** `https://github.com.evil.tld/x/y` → `false`; `https://evilgithub.com/x/y` → `false`; **`https://github.com@evil.tld/x/y` → `false`** (userinfo, host real = `evil.tld`); **`https://user@github.com/x/y` → `true`**; `git@github.com:x/y.git` → `true`; GHE (`github.company.com`) → `false` (documentado); multi-remote com um GitHub → `true`.
- `planScaffold(cwd) → [{ src, dest, content, status: 'create'|'exists', writer: 'fs'|'tool' }]` — `writer: 'tool'` para `.github/workflows/**` (D7b: a skill grava via `Write`); `'fs'` para `scripts/**`.
- `applyScaffold(cwd, { dryRun, confirmed }) → { created, preserved, refused, mustWriteViaTool }` —
  **(D7a, auxiliar) RECUSA se a autonomia lida de `.context/workflow/status.yaml` for `autonomous`/`assisted`**, mesmo com `confirmed: true`. ⚠️ **Fonte: `status.yaml`, NUNCA `.devflow.yaml`** (lá não existe campo de autonomia — leria vazio e o guard **falharia aberto**). Ausente → `supervised`.
  recusa tudo se `confirmed !== true`; **nunca** escreve `.github/workflows/**` por `node:fs` (devolve em `mustWriteViaTool`); `exists` → `preserved` (nunca sobrescreve); contenção (D9) com `realpath` do **diretório-pai** antes de escrever (não só do dest). Recusa também em **branch protegida** (evita `scripts/**` órfãos quando o `Write` do workflow for negado).
- `verifyWritten(cwd) → { ok:[], mismatch:[] }` — **[N6a]** após o `Write` do workflow, re-verifica `hash(dest) === hash(asset)` **fail-loud**. Sem isso o único artefato que **executa em CI** seria o único **sem** garantia de bytes (o conteúdo transita pelo LLM).

> **Enquadramento honesto dos controles (3º re-gate):** **D7b é o controle mecânico load-bearing** (`.github/**` fora de `allow.fs.write` → `mode: prompt`; branch protegida → DENY duro). **D7a é defense-in-depth e auto-contornável** (`status.yaml` vive sob `.context/**`, que é gravável e branch-exempt). Não creditar D7a como inforjável.
> **Vetor residual conhecido (pré-existente, global, fora deste escopo):** um agente não-cooperativo pode escrever `.github/**` por **Bash** (`printf >`, `cp`) contornando D7a **e** D7b — o hook de Bash só guarda `git push|gh pr merge|git commit`. **Follow-up de produto:** endurecer `permissions.yaml` contra escrita em `.github/**` via Bash.
- `syncScaffold(cwd, { confirm }) → { updated, preserved, skipped, needsConfirm: [{dest, diff}] }` — reusa **só** as puras `loadRegistry`+`decideArtifact`: `untouched` & asset mudou → entra em `needsConfirm` e **não escreve**; 2ª chamada com `confirm` → `updated`; `edited` → `preserved`; ausente → `skipped` (não recria). *(assinatura reconciliada com o plano: `{ confirm }`, não `{ onDiff }`)*

### 3.3 `skills/config/SKILL.md` — P5b
Detecção de pipeline existente (`.github/workflows/*release*`); opções reordenadas (**pipeline RECOMENDADO**, `local` "solo/simples" com riscos, `none`); se `pipeline` sem CI: **avisa** e — só com git+GitHub — **oferece scaffold** com confirmação estruturada (D7). Nunca sobrescreve. Branch protegida → work branch.

## 4. Segurança (controles, não prosa)
| Risco | Controle exigido |
|---|---|
| Escrever `.github/workflows/` planta código com `contents/PR write` **fora do gate de permissões** (`pre-tool-use` só intercepta Edit/Write; `node *` está em `allow.exec`) | **D7b:** workflow é gravado pela ferramenta **`Write`** (cai em `mode: prompt` + branch protection — gate humano **inforjável**); `node:fs` só p/ `scripts/**`. **D7a:** applier **recusa se `autonomy: autonomous`**, mesmo com `confirmed:true`. Mais: confirmação estruturada enumerando arquivos + aviso de token de escrita; **mostrar conteúdo**; `--dry-run` obrigatório; testes "sem confirmação → não escreve" e "autônomo + confirmed → refused" |
| `confirmed: true` ser **teatro** (flag auto-setável pelo próprio agente) | Os controles D7a/D7b são **mecânicos** e não dependem da boa-fé do chamador: o guard de autonomia lê a config, e a escrita do workflow passa pelo gate de tools |
| Asset `release.yml` embarcar hardcode do devflow → CI do usuário nasce quebrada | **[N1]** Interface A↔B (`$GITHUB_OUTPUT`/último token) + `git add` genérico; guard-test asserindo ausência de `.claude-plugin`, `.cursor-plugin`, `known-hashes`, `grep …plugin.json` |
| Gate GitHub burlado por **userinfo** (`https://github.com@evil.tld/…`) | **[N2]** host = após o **último `@`** do authority; casos adversariais fixados por teste |
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
ADR-012 (`ci-scaffold-verbatim-provenance`) precisa de **EVOLVE minor → v1.1.0** com:
- (a) guardrail "artefato classe-CI exige **diff + confirmação** no update; nunca auto-overwrite";
- (b) guardrail "applier **recusa** escrever sem confirmação humana; **recusa em `autonomy: autonomous`**; `.github/workflows/**` é gravado pela ferramenta `Write` (gate de permissões), nunca por `node:fs`";
- (c) **[N1]** guardrail mais amplo: "NUNCA deixar hardcode específico do plugin (`.claude-plugin/`, `.cursor-plugin/`, `known-hashes`, grep de manifest fixo) num asset de release-scaffold" — o guardrail atual só proíbe `CLAUDE_PLUGIN_ROOT`;
- (d) **fronteira de confiança** nas Consequências: proveniência por hash = detecção de **deriva local**, **não** atestação de supply-chain;
- (e) **[N3]** promover `status: Proposto` → **`Aprovado`** (guardrail só é gate-enforced quando aprovado) e **estender `## Enforcement`** com entradas para os guardrails novos, linkando os testes (C.9 sem-confirmação, C.9b autônomo, D.1c diff, C.13 contenção, B.1h anti-hardcode).

## 7. Referências
`skills/config/SKILL.md`; `scripts/bump-version.sh:8,19,42,54-61`; `.github/workflows/release.yml:11-18,20-22,47`; `.github/workflows/tag-release.yml:9-15,34`; `scripts/lib/provenance-sync.mjs:34-40,83,90,97,106,114`; `scripts/lib/gen-known-hashes.mjs:28-34,85`; `scripts/lib/version-guard.mjs:19-23,58-66`; `hooks/pre-tool-use:168-284`; `.context/permissions.yaml:86-97`; `skills/context-sync/SKILL.md:142-155`.
