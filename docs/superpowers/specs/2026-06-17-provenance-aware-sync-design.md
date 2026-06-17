# Design — Sync provenance-aware (context-sync / project-init)

> **DevFlow workflow:** provenance-aware-sync | **Scale:** MEDIUM | **Phase:** P→R
> **Data:** 2026-06-17 | **Idioma:** pt-BR

## Objetivo

Tornar o `context-sync` (e `project-init`) **provenance-aware**: distinguir um **deploy intocado** (deve auto-atualizar para a versão nova do plugin) de uma **edição local real** (deve preservar + reportar), ao copiar artefatos (skills, agents, standards) do plugin para o `.context/` do projeto.

## Contexto e diagnóstico

Hoje a cópia é guiada por prosa nas skills, com testes grosseiros:
- `skills/context-sync/SKILL.md` (linha ~142): só copia artefato **ausente**; qualquer um que **existe** é pulado — sem olhar conteúdo. ("Não sobrescrever arquivos já editados", mas o teste real é só existência.)
- `skills/project-init/SKILL.md` (linhas 19/231/518/568): pula por `status: filled`. Como todo deploy nasce `filled`, também não distingue intocado de editado.

**Consequência (caso motivador):** no `nxz-odoo-migration`, `odoo-development/SKILL.md` e `frontend-specialist-odoo/SKILL.md` eram **idênticos à v1.19.1** (deploys intocados) e o sync **deveria** tê-los atualizado para v1.22.0, mas pulou — junto com o agente que tinha edição local legítima. O sync é cego: não compara conteúdo vs. o que foi deployado.

**Padrão de referência no repo:** o importador Reversa (`scripts/reversa-import/`) já usa manifesto de proveniência + diff por hash (`emitters/manifest.mjs`, `reimport-diff.mjs`: `sha256(readFileSync)` por artefato).

## Decisões (fechadas com o usuário)

| # | Decisão | Escolha |
|---|---------|---------|
| D1 | Migração (projetos sem proveniência) | **Registry de hashes históricos no plugin**, gerado por **histórico de commits** (não por git tags — só existe `v1.0.0`; releases são commits). Projeto cujo hash bate com qualquer versão histórica daquele artefato = intocado → atualiza; não bate = editado → preserva |
| D2 | Conflito (arquivo editado localmente) | **Preservar + reportar** (sem merge UI; lista "editado localmente — pulado: `<path>`") |
| D3 | Store de proveniência | **Manifesto único `.context/.provenance.json`** |
| D4 | Escopo de artefatos | **skills + standards** (copiados verbatim). **Agents FORA** — são scaffold de template preenchido por projeto (`fillSingle`/enrich), nunca byte-idênticos ao plugin; seguem o fluxo próprio. Stacks fora (shape de manifest). |
| D5 | Execução da decisão | **Lib determinística testada** (`scripts/lib/provenance-sync.mjs`), invocada pelas skills — não por prosa. Inclui a **resolução de paths** (profiles compostos → lista `{src,dest,framework}`) na lib, não na prosa. |
| D6 | Contenção (segurança) | **`isWithinDir` (path-guard)** — `src` contido no plugin, `dest` contido em `.context/`; **recusa de symlink** na cópia (espelha `reversa-import/write.mjs`). Traversal/symlink → `refused` reportado. |

## Arquitetura

```
PLUGIN
├── assets/provenance/known-hashes.json   ⟵ NOVO  set de sha256 de cada versão histórica dos artefatos verbatim
├── scripts/lib/provenance-sync.mjs       ⟵ NOVO  lib + CLI: resolve artefatos + decisão 3-way + cópia contida + manifesto + report
├── scripts/lib/gen-known-hashes.mjs      ⟵ NOVO  gera/append o registry (backfill via HISTÓRICO DE COMMITS + append no release)
├── scripts/lib/path-guard.mjs            (reuso) isWithinDir — contenção de src/dest
├── scripts/bump-version.sh               + chama gen-known-hashes --append no release
├── skills/context-sync/SKILL.md          passa a invocar provenance-sync (substitui regra "ausente → skip") — só skills+standards
└── skills/project-init/SKILL.md          idem no re-scaffold (substitui "status: filled → skip" para artefatos verbatim existentes)

PROJETO (.context/)
└── .context/.provenance.json             ⟵ NOVO  { schema, artifacts:[{path, hash, sourceVersion, framework}] }
```

> **Escopo verbatim:** a proveniência por hash cobre **skills** (`cp -r`) e **standards de profile** (`assets/standards/profiles/<fw>/`). **Agents NÃO** — são preenchidos por projeto no deploy (`fillSingle`/enrich), nunca byte-idênticos; seguem o fluxo atual. **Standards default da raiz** (`assets/standards/std-*.md`) são live-loaded, nunca copiados — fora também.

### Store de proveniência (`.context/.provenance.json`)

```json
{
  "schema": 1,
  "artifacts": [
    { "path": ".context/skills/odoo-development/SKILL.md", "hash": "<sha256>", "sourceVersion": "1.22.0", "framework": "odoo" }
  ]
}
```
Espelha o `manifest.json` do reversa. Centralizado, não toca o conteúdo dos artefatos, versionável e inspecionável.

### Registry de hashes históricos (`assets/provenance/known-hashes.json`)

```json
{ "schema": 1, "hashes": ["<sha256>", "<sha256>", "..."] }
```
Set **deduplicado** de sha256 dos artefatos **verbatim** (`skills/**`, `assets/standards/profiles/**` — `.md` e `machine/*.js`) ao longo de **cada versão no histórico de commits** (não tags). Usado só na migração: responde "esse arquivo é output de alguma versão passada? → intocado". Não precisa mapear versão (a atualização sempre vai para o bundle atual). **Agents e std-*.md raiz NÃO entram** (não são copiados verbatim).

### Decisão 3-way (por artefato) — `provenance-sync.mjs`

Entradas: `projHash` (arquivo no projeto, ou null), `pluginHash` (bundle atual, ou null), `recorded` (hash no manifesto, ou null), `registry` (set de hashes históricos).

| Situação | Ação |
|---|---|
| `pluginHash == null` (src ilegível/ausente) | **SKIP** — reporta `refused`, nunca grava `hash:null` |
| projeto ausente (`projHash == null`) | **ADD** — copia, grava hash no manifesto |
| `projHash === pluginHash` | **CURRENT** — no-op; garante entrada no manifesto |
| `recorded != null` & `projHash === recorded` | **UNTOUCHED** — atualiza p/ plugin, regrava hash |
| `recorded != null` & `projHash !== recorded` | **EDITED** — preserva + reporta |
| `recorded == null` & `projHash ∈ registry` | **UNTOUCHED (stale)** — atualiza + semeia manifesto |
| `recorded == null` & `projHash ∉ registry` | **EDITED (assumido)** — preserva + reporta |

Após ADD/UPDATE: grava o hash novo (do plugin) no manifesto, com `sourceVersion` (= última versão em que a lib tocou/confirmou o artefato — não a versão de origem real) e `framework` (origem). EDITED nunca é tocado e não altera o manifesto.

**Órfãos (decisão explícita):** se um artefato é descontinuado no plugin, ele some da lista de candidatos → `applySync` nunca o vê → permanece no projeto e no manifesto (entrada inerte). **Não fazemos prune** (YAGNI); o manifesto pode conter entradas de artefatos não mais distribuídos, sem efeito sobre a decisão.

### Integração nas skills

- A **resolução de artefatos** (profiles compostos `odoo`+`nxz` → lista `{src,dest,framework}` para skills + standards de profile, usando `frameworkContributions`/`standardsWithOrigin`) é feita **na lib** (`resolveArtifacts`), não na prosa — fortalece D5 e tira o ponto frágil da skill.
- `context-sync/SKILL.md`: a etapa de cópia de **skills + standards** passa a invocar `node scripts/lib/provenance-sync.mjs apply --project=<root> --plugin=$CLAUDE_PLUGIN_ROOT`. O CLI resolve os artefatos, decide, copia (contido), atualiza o manifesto e retorna `{added, updated, current, preserved, refused}`; a skill reporta. **Agents seguem o fluxo atual** (`fillSingle`/enrich), fora desta lib.
- `project-init/SKILL.md`: re-scaffold delega ao sync (mesma invocação). Scaffold do zero → todos ADD. O `status: filled → SKIP` permanece só para o scaffold inicial; a **atualização** de artefatos verbatim existentes passa pela lib.
- "Preservar edição local" continua honrado — agora **com precisão** (via hash), não por existência/`status`.

### Relatório (D2)

O `report` carrega paths **relativos** ao projeto (não absolutos de tmpdir):

```
Sync provenance-aware:
  + adicionados:  N  (artefatos novos)
  ↑ atualizados:  M  (deploys intocados → versão nova)
  = já atuais:    K
  ⚠ preservados:  J  (editados localmente — revise manualmente)
      - .context/skills/odoo-development/SKILL.md
  ⛔ recusados:    R  (traversal/symlink/src ilegível — fora de .context ou inseguro)
```

## Bootstrap do registry (migração)

O registry precisa conter hashes de versões **passadas** (senão deploys antigos não são reconhecidos). **Git tags NÃO servem** (só existe `v1.0.0`; releases são commits). `gen-known-hashes.mjs`:
1. **Backfill por histórico de commits:** para cada artefato verbatim (`skills/**`, `assets/standards/profiles/**`), `git log --pretty=%H -- <path>` lista os commits que tocaram aquele path; para cada commit, `git show <sha>:<path>` → sha256 → adiciona ao set. Inclui também o working tree atual. (Exato e independente de convenção de tag/release; pega toda versão de cada arquivo, inclusive entre releases.) Renomeação de path causa falso-negativo benigno (hash antigo perdido → vira `edited`), nunca falso-positivo.
2. **Append por release:** `bump-version.sh` chama `gen-known-hashes.mjs --append` após o bump (adiciona os hashes da versão nova ao set existente).

Performance: O(arquivos × commits-que-tocaram-cada-arquivo) — alguns milhares de `git show` no pior caso; é **maintainer-side, one-shot**. Em checkout shallow (CI) o histórico é parcial → `gen` emite **aviso** (não falha). Geração precisa de git/working tree; o projeto consome só o JSON embarcado.

## Estratégia de testes (TDD real)

- `scripts/lib/provenance-sync.mjs` — testes unit cobrindo as **7 linhas** da tabela de decisão (incl. `pluginHash==null`) + migração (registry hit/miss), com fixtures em **tmpdir** (nunca in-place).
- **Segurança (RED obrigatório):** `srcRel: "../../../etc/passwd"` e `destRel: "../../escape.md"` → ambos em `refused`, nenhum byte escrito fora de `.context/`, processo não derruba. `src` symlink → `refused`. (valida via `report.refused` e "nada apareceu fora do tmpdir aninhado").
- E2E: simular sync sobre **cópia** de um projeto-fixture (skill antiga intocada → atualiza; skill editada → preserva; skill nova → add; 2ª sync = no-op), validando manifesto e report (paths relativos).
- `gen-known-hashes.mjs` — set deduplicado, contém os hashes do working tree; backfill por commits testado contra um repo git temporário (não o working tree real, p/ não flakar).
- Guard: qualquer destino de escrita começa em `tmpdir()` nos testes.

## Riscos

- **Backfill por commits** é O(arquivos×commits) e maintainer-side; checkout shallow → cobertura parcial (aviso emitido). Mitigação: rodar no clone completo no release.
- **Path traversal / symlink** (entrada `artifacts` cruza fronteira de I/O) → mitigado por `isWithinDir` (src⊂plugin, dest⊂.context) + recusa de symlink, espelhando `reversa-import/write.mjs`. Sem o guard, a garantia "preservar edição local" não vale fora de `.context/`.
- **Agents fora do escopo** — proveniência por hash não se aplica a artefatos transformados no deploy; tentar copiá-los verbatim regrediria o agent preenchido. Resolvido excluindo-os (D4).
- **Crescimento do registry** → set deduplicado (sha256 hex; dezenas de KB, aceitável).
- **Falso "intocado"**: colisão sha256 desprezível; arquivo editado que volte a bater com versão antiga (irreal) seria tratado como intocado.
- **Skills são prosa LLM** → decisão E resolução de paths na lib testável; a skill só orquestra e reporta.

## Fora de escopo

- **Agents** — transformados no deploy (`fillSingle`/enrich); proveniência por hash não se aplica (D4). Seguem o fluxo atual.
- **Standards default da raiz** (`assets/standards/std-*.md`) — live-loaded, nunca copiados.
- **Stacks** (entradas de manifest, shape diferente) — comportamento atual de seed preservado; provável follow-up.
- Merge UI / 3-way textual de conteúdo editado (D2 = preservar+reportar; YAGNI).
- Flag `--accept=<path>` para re-baseline de arquivo editado (follow-up; evita re-report eterno).
- Rollback/undo de sync (o manifesto permite auditar, mas reverter não é escopo).
