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
| D1 | Migração (projetos sem proveniência) | **Registry de hashes históricos no plugin** — projeto cujo hash bate com qualquer release publicada = intocado → atualiza; não bate = editado → preserva |
| D2 | Conflito (arquivo editado localmente) | **Preservar + reportar** (sem merge UI; lista "editado localmente — pulado: `<path>`") |
| D3 | Store de proveniência | **Manifesto único `.context/.provenance.json`** |
| D4 | Escopo de artefatos | **skills + agents + standards** (stacks ficam fora — shape de manifest, comportamento atual preservado) |
| D5 | Execução da decisão | **Lib determinística testada** (`scripts/lib/provenance-sync.mjs`), invocada pelas skills — não por prosa |

## Arquitetura

```
PLUGIN
├── assets/provenance/known-hashes.json   ⟵ NOVO  set de sha256 de todos os artefatos já publicados
├── scripts/lib/provenance-sync.mjs       ⟵ NOVO  lib + CLI: decisão 3-way, aplica cópias, atualiza manifesto, reporta
├── scripts/lib/gen-known-hashes.mjs      ⟵ NOVO  gera/append o registry (backfill via git tags + append no release)
├── scripts/bump-version.sh               + chama gen-known-hashes no release
├── skills/context-sync/SKILL.md          passa a invocar provenance-sync (substitui regra "ausente → skip")
└── skills/project-init/SKILL.md          idem (substitui regra "status: filled → skip") no scaffold de artefatos existentes

PROJETO (.context/)
└── .context/.provenance.json             ⟵ NOVO  { schema, artifacts:[{path, hash, sourceVersion, framework}] }
```

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
Set **deduplicado** de sha256 de todo artefato distribuível (skills/**, agents/*.md, assets/standards/profiles/**, assets/standards/std-*.md) em **cada release publicada**. Usado só na migração: responde "esse arquivo é output de alguma release? → intocado". Não precisa mapear versão (a atualização sempre vai para o bundle atual).

### Decisão 3-way (por artefato) — `provenance-sync.mjs`

Entradas: `projHash` (arquivo no projeto, ou null), `pluginHash` (bundle atual), `recorded` (hash no manifesto, ou null), `registry` (set de hashes históricos).

| Situação | Ação |
|---|---|
| projeto ausente | **ADD** — copia, grava hash no manifesto |
| `projHash === pluginHash` | **CURRENT** — no-op; garante entrada no manifesto |
| `recorded != null` & `projHash === recorded` | **UNTOUCHED** — atualiza p/ plugin, regrava hash |
| `recorded != null` & `projHash !== recorded` | **EDITED** — preserva + reporta |
| `recorded == null` & `projHash ∈ registry` | **UNTOUCHED (stale)** — atualiza + semeia manifesto |
| `recorded == null` & `projHash ∉ registry` | **EDITED (assumido)** — preserva + reporta |

Após ADD/UPDATE: grava o hash novo (do plugin) no manifesto, com `sourceVersion` (versão atual do plugin) e `framework` (origem). EDITED nunca é tocado e não altera o manifesto.

### Integração nas skills

- `context-sync/SKILL.md`: a etapa de cópia de skills/agents/standards passa a invocar `node scripts/lib/provenance-sync.mjs apply --project=<root> --plugin=$CLAUDE_PLUGIN_ROOT --artifacts=<json>` (ou o CLI resolve os artefatos via `frameworkContributions` + base set). O CLI retorna o relatório `{added, updated, preserved, current}`; a skill reporta ao usuário.
- `project-init/SKILL.md`: no fluxo de re-scaffold (quando `.context/` já existe e delega ao sync), mesma invocação. No scaffold do zero, todos são ADD (sem mudança de comportamento).
- A regra "preservar edição local" continua honrada — agora **com precisão** (via hash), não por existência/`status`.

### Relatório (D2)

```
Sync provenance-aware:
  + adicionados:  N  (artefatos novos)
  ↑ atualizados:  M  (deploys intocados → versão nova)
  = já atuais:    K
  ⚠ preservados:  J  (editados localmente — revise manualmente)
      - .context/agents/odoo-specialist.md
```

## Bootstrap do registry (migração)

O registry precisa conter hashes de releases **passadas** (senão deploys antigos não são reconhecidos). `gen-known-hashes.mjs`:
1. **Backfill único:** varre `git tag` (releases), e para cada artefato distribuível faz `git show <tag>:<path>` → sha256 → adiciona ao set. Também inclui os hashes do `assets/`/`skills/`/`agents/` do working tree atual (cobre versões sem tag).
2. **Append por release:** `bump-version.sh` chama `gen-known-hashes.mjs --append` após o bump, adicionando os hashes da versão nova.

Geração é passo **maintainer-side** (precisa de git/working tree); o projeto consome só o JSON embarcado.

## Estratégia de testes (TDD real)

- `scripts/lib/provenance-sync.mjs` — testes unit cobrindo as **6 linhas** da tabela de decisão + migração (registry hit/miss), com fixtures em **tmpdir** (nunca in-place).
- E2E: simular sync sobre **cópia** de um projeto-fixture (skill antiga intocada → atualiza; skill editada → preserva; skill nova → add), validando o manifesto resultante e o relatório.
- `gen-known-hashes.mjs` — teste que o set é deduplicado e contém os hashes do working tree atual.
- Guard: qualquer destino de escrita começa em `tmpdir()` nos testes.

## Riscos

- **Backfill via git tags** é pesado/uma-vez; release sem tag fica de fora → mitigação: incluir também os hashes do working tree atual no backfill.
- **Crescimento do registry** → set deduplicado (sha256 hex; ~64 bytes/entrada; milhares de entradas = dezenas de KB, aceitável).
- **Falso "intocado"**: colisão sha256 é desprezível; mas um arquivo editado que por acaso volte a bater com uma release antiga seria tratado como intocado (cenário irreal).
- **Skills são prosa LLM** → a decisão fica na lib testável (CLI determinístico); a skill só orquestra e reporta, reduzindo ambiguidade.

## Fora de escopo

- **Stacks** (entradas de manifest, shape diferente) — comportamento atual de seed preservado; provável follow-up.
- Merge UI / 3-way textual de conteúdo editado (D2 = preservar+reportar; YAGNI).
- Rollback/undo de sync (o manifesto permite auditar, mas reverter não é escopo).
