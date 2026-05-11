---
type: adr
name: adr-path-migration-to-context-root
description: Migrar save path do adr-builder de .context/docs/adrs/ para .context/adrs/
scope: organizational
source: local
stack: universal
category: arquitetura
status: Aprovado
version: 1.0.0
created: 2026-05-06
supersedes: []
refines: []
protocol_contract: null
decision_kind: firm
summary: "Path canônico do adr-builder migra de .context/docs/adrs/ para .context/adrs/ por consistência com outros artefatos devflow; dual-read transitório por v1.0.x e v1.1.x, remoção em v1.2.0."
---

# ADR 001 — Migração de path canônico ADR para `.context/adrs/`

- **Data:** 2026-05-06
- **Status:** Proposto
- **Escopo:** Organizacional
- **Stack:** universal
- **Categoria:** Arquitetura

---

## Contexto

DevFlow v0.13.3 estabeleceu `.context/docs/adrs/` como save path canônico do adr-builder. À medida que devflow estende `.context/` com novos artefatos próprios (`standards/`, `stacks/`, `permissions.yaml`, `observability.yaml`, `.lock`, `.devflow.yaml`), o aninhamento sob `docs/` (território dotcontext) cria fronteira confusa entre domínios. O context layer v2 (esta sprint) torna a inconsistência tangível.

## Drivers

- Consistência com `.context/standards/`, `.context/stacks/`, `.context/permissions.yaml`, `.context/observability.yaml` (todos na raiz)
- Separação clara: `docs/` é território dotcontext (project knowledge gerenciado via `context.fill`); ADRs são domínio devflow (gerenciado por adr-builder)
- Encurtamento de path em logs, audit trail (`actions.jsonl`), reproducibility token computation
- Compatibilidade transitória sem quebrar projetos existentes que usam `adr-builder`

## Decisão

Save path canônico do adr-builder migra para `.context/adrs/` em v1.0.0 do devflow. `scripts/lib/path-resolver.mjs` (novo) provê `resolveAdrPath(projectRoot)` retornando `{ write, readPaths, isLegacy }`. Todos os scripts (`adr-update-index.mjs`, `adr-audit.mjs`, `adr-evolve.mjs`) e o `hooks/session-start` usam o resolver — leem de ambos paths durante v1.0.x e v1.1.x; escrita sempre vai para canonical. `adr-evolve` migra arquivos legados para canonical on-write (transparente).

## Alternativas Consideradas

- **Manter `.context/docs/adrs/` indefinidamente** — rejeitado: cria divergência permanente com outros artefatos devflow (standards, stacks etc.) e gera atrito cognitivo.
- **Mover sob `dotcontext` namespace (ex: `.context/dotcontext/docs/adrs/`)** — rejeitado: ADRs são decisões arquiteturais do projeto, não conteúdo dotcontext. Não há benefício em namespace.
- **Breaking change sem dual-read** — rejeitado: quebra projetos existentes que usam adr-builder em produção. Custo de migração imposto a usuários é desproporcional ao ganho.
- **Migração de path com dual-read transitório por 2 minor versions** ✓ — escolhido: zero quebra de projetos legacy durante v1.0.x/v1.1.x; remoção controlada em v1.2.0 com warning escalando antes.

## Consequências

**Positivas**
- Estrutura `.context/` consistente: ADRs ao lado de standards, stacks, permissions, observability
- Path mais curto reduz overhead em paths em `actions.jsonl`, `<ADR_GUARDRAILS>` injection, hash em reproducibility token
- Separação clara dotcontext (docs/) vs devflow (adrs/, standards/, etc.)

**Negativas**
- Dual-read adiciona ~3-5ms ao SessionStart durante transição (medido em V.4 do plano context-layer-v2)
- Mensagem `LEGACY_PATH_DETECTED` polui stderr de projetos que ainda não migraram
- Documentação dos skills/commands precisa atualizar referências (feito em Task Groups 0.6 e 0.7)

**Riscos aceitos**
- Projetos NXZ em produção precisam migrar manualmente até v1.2 (mitigação: documentar receita de migração no CHANGELOG; warning escala em v1.1)
- Dual-read pode mascarar bugs de path se um path estiver errado (mitigação: `LEGACY_PATH_DETECTED` warning sempre visível)

## Guardrails

- SEMPRE usar `scripts/lib/path-resolver.mjs` `resolveAdrPath()` em scripts/hooks que tocam ADR paths — NUNCA hardcode `.context/docs/adrs/` ou `.context/adrs/`
- SEMPRE escrever novos ADRs em `.context/adrs/` (nunca em legacy)
- NUNCA criar novos arquivos em `.context/docs/adrs/` em projetos novos
- QUANDO um projeto está em estado dual-read (ambos paths existem), ENTÃO canonical wins on filename conflict (filename-based dedup com canonical first)
- QUANDO `LEGACY_PATH_DETECTED` aparece em CI, ENTÃO o time deve agendar migração antes de v1.2

## Enforcement

- [ ] Lint: `tests/validation/test-adr-path-canonical.mjs` greps `skills/` + `commands/` por `docs/adrs` sem qualifier de legacy/dual-read
- [ ] Test suite: `tests/validation/test-adr-path-resolver.mjs` (4 cenários), `test-adr-index-dual-read.mjs` (2), `test-adr-audit-legacy-warning.mjs` (3), `test-adr-evolve-migrates.mjs` (2), `tests/hooks/test-session-start-adr-dualread.sh` (3) — todos passando
- [ ] Code review: PRs que tocam scripts ADR ou hook session-start devem usar `resolveAdrPath()`
- [ ] Gate CI/PREVC: SessionStart hook emite warning a cada sessão se projeto está em legacy-only — força visibilidade

## Evidências / Anexos

- Plano de implementação: `.context/plans/context-layer-v2.md` (Task Groups 0.0 a 0.7)
- Spec original (v2 calibrado): `docs/devflow-context-layer-validation-v2-pt-br.md` §4.6 (Semana 0)
- Resolver lib: `scripts/lib/path-resolver.mjs`

## Roadmap de remoção do dual-read

| Versão | Comportamento |
|---|---|
| v0.13.x | Path canônico: `.context/docs/adrs/` (estado anterior à esta ADR) |
| **v1.0.x** | Path canônico: `.context/adrs/`. Dual-read ativo. Warning `LEGACY_PATH_DETECTED` em audit + SessionStart. |
| **v1.1.x** | Dual-read ainda ativo. Warning escala (mais agressivo, talvez bloqueia em --strict mode). |
| **v1.2.0** | Dual-read **removido**. Apenas `.context/adrs/` é lido. Projetos no path antigo precisam migrar antes do upgrade. |
