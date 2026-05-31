---
type: adr
name: context-layer-knowledge-ddc
description: Camada de conhecimento DDC em 4 níveis no .context/ — engineering/, knowledge, agentes-curadores e migração explícita
scope: organizational
source: local
stack: universal
category: arquitetura
status: Proposto
version: 0.1.0
created: 2026-05-30
supersedes: []
refines: []
protocol_contract: null
decision_kind: firm
summary: "O .context/ adota layout DDC em 4 níveis: engineering/ como container dos subsistemas (adrs/standards/stacks/templates), mecanismo knowledge para narrativa de domínio e D10, 4 agentes-curadores como front door, migração via /devflow update migration. Path canônico de ADRs re-canonicaliza para .context/engineering/adrs/ (refina ADR-001)."
---

# ADR 006 — Camada de conhecimento DDC no `.context/` (4 níveis + re-canonicalização ADR path)

- **Data:** 2026-05-30
- **Status:** Proposto
- **Escopo:** Organizacional
- **Stack:** universal
- **Categoria:** Arquitetura

---

## Contexto

DevFlow v1.0.x estabeleceu `.context/` como raiz de artefatos devflow (ADR-001/002/003). O crescimento orgânico gerou subsistemas díspares (`adrs/`, `standards/`, `stacks/`, `templates/`) sem hierarquia de navegação. Paralelamente, narrativas de domínio (business, product, operations) e narrativas descritivas de engenharia (D10) ficaram sem mecanismo próprio, espalhadas em `docs/` dotcontext. O DDC (DevFlow Domain Context) resolve as duas lacunas com um layout em 4 níveis e um mecanismo `knowledge` dedicado.

## Drivers

- `engineering/` como container único garante indexação determinística (hooks leem um path, não 4)
- Narrativas D10 e de domínio não são regras (→ Standards) nem decisões (→ ADRs) — precisam de mecanismo próprio
- 4 agentes-curadores como front door previnem gravação direta e garantem classificação semântica
- Migração explícita via comando preserva rastreabilidade — dual-read perpétuo mascararia erros

## Decisão

O `.context/` adota layout DDC em 4 níveis:

1. **`engineering/`** — container dos subsistemas de engenharia: `adrs/`, `standards/`, `stacks/`, `templates/`. Path canônico de ADRs passa de `.context/adrs/` para `.context/engineering/adrs/` (re-canonicaliza ADR-001).
2. **`knowledge/`** — mecanismo para narrativa: subpastas `business/`, `product/`, `operations/` (domínio) e `engineering/` (D10 descritivo). Builder + loader + audit (`knowledge-audit.mjs` checks K1–K5). PREVC Planning injeta via `knowledge-filter`; hooks injetam `KNOWLEDGE_INDEX`/bodies via session-start (Stage-1) e pre-tool-use (Stage-2).
3. **Agentes-curadores** — 4 produtores especializados (`business-context`, `product-context`, `operations-context`, `engineering-context`) + roteador front door. Briefings chegam ao roteador, que classifica e despacha ao agente certo.
4. **Migração explícita** — `/devflow update migration` (ou `devflow-migrate.mjs` idempotente) move artefatos legacy; dual-read de compatibilidade ativo durante v1.0.x/v1.1.x via `path-resolver.mjs`.

**Regra de ouro:** `enforça → Standard`; `justifica → ADR`; `ensina → knowledge`.

Compatibilidade dotcontext preservada: `docs/`, `agents/`, `skills/`, `plans/` intocados.

## Alternativas Consideradas

- **Dirs paralelos estilo DDC puro** (`architecture/`, `practices/`, `contracts/`, `processes/` como mecanismos próprios) — rejeitado: duplicaria o mecanismo Standards já existente; quebra ADR-002.
- **Dual-read perpétuo sem migração explícita** — rejeitado: ambiguidade de path permanente; hooks não sabem onde escrever novos artefatos; mascararia erros de resolução silenciosamente.
- **Internalizar/forkar superpowers** — rejeitado: custo de sync perpétuo com upstream; contradiz identidade de bridge do devflow (devflow orquestra, não substitui).
- **Manter layout plano (status quo + knowledge/)** — rejeitado: sem container `engineering/` a indexação requer lista hardcoded de subsistemas; frágil a novos subsistemas.
- **Layout DDC com `engineering/` + `knowledge/` + migração explícita** ✓ — escolhido: indexação determinística, mecanismo próprio para narrativas, rastreabilidade de migração, compatibilidade dotcontext.

## Consequências

**Positivas**
- Hooks leem um path canônico (`engineering/`); scripts usam `context-paths.mjs` como SSOT
- Narrativas D10 e de domínio têm ciclo de vida próprio (audit K1–K5, não poluem ADRs)
- Agentes-curadores garantem classificação semântica consistente em todo briefing

**Negativas**
- Projetos com ADRs em `.context/adrs/` precisam migrar até v1.2 (dual-read ativo; warning `LEGACY_PATH_DETECTED`)
- 4 agentes-curadores adicionam superfície de manutenção (mitigado por roteador central)

**Riscos aceitos**
- `devflow-migrate.mjs` idempotente pode falhar silenciosamente se permissões de FS forem restritivas (mitigação: exit code não-zero propagado; audit K5 verifica integridade pós-migração)

## Guardrails

- NUNCA mover ou criar arquivos em `docs/`, `agents/`, `skills/`, `plans/` via mecanismos devflow — esses dirs são gerenciados pelo dotcontext
- SEMPRE perguntar a `context-paths.mjs` pelos paths canônicos — NUNCA hardcodar `.context/engineering/adrs/` ou qualquer subpath
- QUANDO um briefing de engenharia chega ENTÃO classificar via `engineering-context` (roteador) e despachar ao mecanismo certo (Standard se enforçável, ADR se decisão, knowledge se narrativa)
- QUANDO `LEGACY_PATH_DETECTED` aparece ENTÃO agendar `devflow update migration` antes da v1.2
- NUNCA escrever diretamente em `knowledge/` sem passar por um agente-curador — gravação direta bypassa classificação semântica e audit K1–K5

## Enforcement

- [ ] Script: `scripts/knowledge-audit.mjs` checks K1–K5 (schema, completude, links, freshness, integridade pós-migração) — executado em PostToolUse quando arquivos `knowledge/**` são editados
- [ ] Script: `scripts/devflow-migrate.mjs` idempotente — move artefatos legacy, atualiza índices, exit code não-zero em falha; invocado por `/devflow update migration`
- [ ] Hook: session-start Stage-1 injeta `KNOWLEDGE_INDEX` via `context-paths.mjs`; pre-tool-use Stage-2 injeta bodies on-demand
- [ ] Code review: PRs que tocam `scripts/` ou `hooks/` com paths ADR devem usar `resolveAdrPath()` de `path-resolver.mjs`

**Nota sobre `refines` (estado de transição):** A relação desta ADR com ADR-001 está documentada no campo `summary` e na seção Decisão (ponto 1). O campo `refines: []` está intencionalmente vazio durante a transição v1.0–v1.2: o validador `adr-graph.mjs` resolve referências apenas dentro do mesmo diretório, e ADR-001 ainda reside em `.context/adrs/` (path legado). Preencher `refines` neste estado causaria falha do gate de grafo. O campo será populado com `["001-adr-path-migration-to-context-root"]` após a consolidação de ADR-001 em `.context/engineering/adrs/` pela migração explícita.

## Evidências / Anexos

- Plano de implementação: `.context/plans/context-layer-v2.md` (Task Groups Stage-1 e Stage-2)
- ADR que esta refina (prosa): `.context/adrs/001-adr-path-migration-to-context-root-v1.0.0.md` (path legado — pendente migração para `.context/engineering/adrs/`)
- SSOT de paths: `scripts/lib/context-paths.mjs`
- Resolver de compatibilidade: `scripts/lib/path-resolver.mjs`
