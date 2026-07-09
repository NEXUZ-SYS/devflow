# Spec — `devflow:config` avisa + scaffolda pipeline de release

> **Workflow DevFlow:** `config-release-scaffold` · **Escala:** MEDIUM · **Fase:** P → R
> **Modo:** Full · **Autonomia:** supervised · **Data:** 2026-07-09 · **Status:** design aguardando aprovação

## 1. Contexto e problema

`skills/config/SKILL.md` P5b é **detecção pura**: procura um mecanismo de versão (`scripts/bump-version.sh` | `package.json:version` | `.claude-plugin/plugin.json`) e, se acha, pergunta **"bump local no finish"** vs **"pipeline de release (CI)"**. Grava a chave `versioning` no `.devflow.yaml`. **Não cria nada.**

**Gap 1 — pipeline fantasma.** Escolher `versioning: pipeline` num projeto **sem** CI de release faz o finish (`prevc-confirmation` Step 2) **pular o bump** confiando numa pipeline que o DevFlow nunca criou → bump vira **no-op silencioso**, sem release.

**Gap 2 — o default é o modo mais frágil.** `ausente = local` (retrocompat). O modo `local` bumpa **na feature branch** (version files viram ímã de conflito em trabalho paralelo), sobe a versão **antes** do merge (se o PR não mergear, a versão "queimou"), só toca **arquivos** (tag/GitHub Release/notas continuam manuais) e **não corta o CHANGELOG** quando o projeto não tem `bump-version.sh` (ex.: usa `npm version`) → drift. Não há equivalente ao `changelog-guard` nesse caminho.

> **Nota de validação:** o que foi aposentado (PRs #55/#56; header do `release.yml`: *"Substitui o auto-bump local **por commit** (causa do 'pulo' de versão)"*) foi o **auto-bump a cada commit** (pre-commit), **não** o modo `versioning: local` (bump uma vez no finish). O pre-commit hoje só **valida** (`version-guard`). Portanto `local` não está morto — está **mal-posicionado** (default sendo o modo mais frágil).

**Restrição descoberta:** o workflow de release roda num **runner do GitHub, sem o plugin DevFlow**. Logo o scaffold **não pode** chamar `${CLAUDE_PLUGIN_ROOT}/scripts/...` — "scaffoldar" significa **copiar código para o repo do usuário**, o que cria risco de **drift**.

## 2. Decisões (aprovadas)

- **D1 — Scaffold self-contained + provenance.** Copiar para o projeto: os **dois workflows** (release PR + publish) **e** os scripts de que eles dependem (bump genérico, `changelog-cut`, `version-guard`). O drift é governado pelo mecanismo **provenance-aware já existente** (`scripts/lib/provenance-sync.mjs` + `assets/provenance/known-hashes.json`): deploy **intocado** → `/devflow update` atualiza; **editado localmente** → preserva; novo → adiciona.
- **D2 — `versioning: local` REBAIXADO (não removido).** P5b passa a apresentar **`pipeline` como RECOMENDADA** (com oferta de scaffold) e `local` rotulado **"solo/simples, sem CI"** com os riscos explicitados. O **default de ausência continua `local`** (retrocompat: projetos existentes não quebram).
- **D3 — Gate do scaffold: git + remote GitHub.** Sem repositório git → **não oferece** scaffold (só avisa). Com git mas **sem remote `github.com`** → avisa que o scaffold é **GitHub Actions** e não oferece (ou oferece explicitando que é inerte fora do GitHub).
- **D4 — Avisar + oferecer + permitir seguir (NÃO recusar).** Diferente do par contraditório `autoFinish.bump:true` + `versioning ∈ {pipeline,none}` (logicamente impossível → recusa), "pipeline sem CI detectada" é apenas **não-verificável**: a CI pode viver fora do GitHub (GitLab/Jenkins), ser adicionada depois, ou o release ser externo. Então: aviso alto + oferta + registra a escolha se o usuário seguir.
- **D5 — Artefatos scaffoldados são VERBATIM (derivada de D1).** A proveniência por hash **só cobre artefatos verbatim** (`context-sync` SKILL.md:155). Logo **nada de templating/interpolação** nos arquivos copiados → o `bump-version.sh` genérico precisa **detectar os version files em runtime**, não ser gerado por substituição.

## 3. Design

### 3.1 Novo asset: `assets/release-scaffold/` (verbatim, indexado por known-hashes)
| Arquivo copiado para | Origem no plugin | Papel |
|---|---|---|
| `.github/workflows/release.yml` | `assets/release-scaffold/release.yml` | `workflow_dispatch(bump: patch\|minor\|major)` → bump + guard → abre **release PR**. **Já nasce com o fix do PR #71** (`git add CHANGELOG.md`). |
| `.github/workflows/tag-release.yml` | `assets/release-scaffold/tag-release.yml` | on `push: main` + version file muda → cria tag `vX.Y.Z` + GitHub Release com notas do CHANGELOG. Idempotente. |
| `scripts/bump-version.sh` | `assets/release-scaffold/bump-version.sh` | **Genérico**: detecta e atualiza os version files presentes; semver `patch\|minor\|major` incrementando do atual; chama `changelog-cut` se `CHANGELOG.md` existir. |
| `scripts/lib/changelog-cut.mjs` | reuso do lib atual | `[Unreleased]` → `[X.Y.Z] — data`, insere `[Unreleased]` novo vazio. Idempotente. |
| `scripts/lib/version-guard.mjs` (+ `changelog-guard.mjs`, `changelog-extract.mjs`) | reuso | barra pulo/regressão de versão e release sem notas (fail-loud). |

**`bump-version.sh` genérico — detecção em runtime** (ordem, todos os presentes são atualizados; a **source of truth** é o primeiro encontrado):
`package.json` → `pyproject.toml` → `Cargo.toml` → `.claude-plugin/plugin.json` → `VERSION`. Semver estrito (`X.Y.Z`), consistente com o `version-guard`.

### 3.2 `skills/config/SKILL.md` — P5b reformulada

1. **Detecção de pipeline existente:** procurar workflow de release no projeto (`.github/workflows/*.yml` com `workflow_dispatch` e que toque version files / nome `*release*`).
2. **Ordem/rotulagem das opções (D2):**
   - **Pipeline de release (CI) — RECOMENDADO** → bump único, controlado, com tag/Release automáticos.
   - **Bump local no finish — solo/simples, sem CI** → ⚠️ bump na branch conflita em paralelo; tag/Release manuais; CHANGELOG não cortado sem `bump-version.sh`.
   - **Sem versionamento** (`none`).
3. **Se escolheu `pipeline` E não detectou pipeline:**
   - **sem git** → **aviso** ("o finish NÃO vai bumpar; sem git não há o que scaffoldar") e segue (D3/D4).
   - **git sem remote GitHub** → aviso ("o scaffold é GitHub Actions; seu remote não é GitHub") e segue.
   - **git + remote GitHub** → **oferecer scaffold** (opt-in explícito, listando os arquivos que serão criados). Se já existir algum dos arquivos → **preservar** (nunca sobrescrever), reportar.
4. Grava `versioning: pipeline` de qualquer forma se o usuário confirmar (D4).

### 3.3 Proveniência e `/devflow update`
- `scripts/lib/gen-known-hashes.mjs` passa a indexar `assets/release-scaffold/**`.
- Um escopo de sync (`context-sync`/`/devflow update`) aplica `provenance-sync` aos caminhos copiados (`.github/workflows/{release,tag-release}.yml`, `scripts/bump-version.sh`, `scripts/lib/{changelog-cut,version-guard,changelog-guard,changelog-extract}.mjs`): **intocado → atualiza; editado → preserva; ausente → não recria** (o scaffold é opt-in, o update não ressuscita o que o usuário apagou).

## 4. Segurança
| Risco | Mitigação |
|---|---|
| Escrever em `.github/workflows/` do usuário é **sensível** (executa CI) | Opt-in **explícito**, listando cada arquivo antes de criar; nunca sobrescrever arquivo existente; nunca criar sem git+GitHub |
| Scripts copiados executam no CI do usuário | Verbatim do plugin (auditável), sem interpolação (D5); `version-guard`/`changelog-guard` são fail-loud, não fail-open |
| Drift silencioso das cópias | Proveniência por hash: editado localmente → **preservado** e reportado |
| `bump-version.sh` genérico tocar arquivo errado | Detecção explícita por nome de manifest conhecido; `--dry-run` no scaffold para o usuário conferir |

## 5. Estratégia de testes (TDD)
- **Unit** `bump-version.sh` genérico: detecção por manifest (package.json/pyproject/Cargo/plugin.json/VERSION), semver patch/minor/major, no-op quando não há manifest, corte do CHANGELOG quando existe. Fixtures em **tmpdir** (memória: testes não mutam dirs versionados).
- **Unit/Integração** do gate: git ausente / git sem remote GitHub / git+GitHub → decisão correta (avisar vs oferecer).
- **Estrutural** `skills/config/SKILL.md`: pipeline rotulado RECOMENDADO; `local` com os riscos; aviso de pipeline-sem-CI; oferta condicionada ao gate; nunca sobrescreve.
- **E2E** do scaffold: num repo-fixture tmpdir com remote **bare local** simulando GitHub, aplicar o scaffold → arquivos criados verbatim; rodar `bump-version.sh minor` → version files + CHANGELOG cortado; `version-guard` aprova. Nunca tocar repo/CI real.
- **Proveniência:** copiar verbatim → hash casa (intocado, atualizável); editar 1 byte → hash não casa (preservado).

## 6. ADR
D1 (scaffold self-contained de infra de CI + proveniência por hash para artefatos **fora de `.context/`**) + D5 (verbatim obrigatório) formam decisão arquitetural com guardrails recorrentes ("artefato scaffoldado é verbatim; nunca interpolar", "nunca sobrescrever arquivo existente do usuário", "CI não alcança o plugin"). Rodar o check de oportunidade (Step 3.5) — provável CREATE, relacionada à ADR de proveniência/sync.

## 7. Referências
`skills/config/SKILL.md` (P5b ~153-177, geração ~418-430); `scripts/bump-version.sh`; `.github/workflows/{release,tag-release}.yml`; `scripts/lib/{provenance-sync,gen-known-hashes,changelog-cut,changelog-guard,changelog-extract,version-guard}.mjs`; `assets/provenance/known-hashes.json`; `skills/context-sync/SKILL.md:142-155` (proveniência cobre só verbatim); `skills/prevc-confirmation/SKILL.md` Step 2 (`VERSIONING-MODE-GATE`).
