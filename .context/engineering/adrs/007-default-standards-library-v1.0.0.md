---
type: adr
name: default-standards-library
description: Biblioteca de standards default de engenharia — plugin-bundled + fetch https, warn-only, eject por projeto
scope: organizational
source: local
stack: universal
category: principios-codigo
status: Substituido
version: 1.0.0
created: 2026-06-01
supersedes: []
refines: ["002-adopt-standards-triple-layer-v1.0.0"]
protocol_contract: null
decision_kind: firm
summary: "Standards default vivem em assets/standards/ (snapshot vendorizado) + fetch https de NEXUZ-SYS/devflow-standards no /devflow update. Defaults warn-only (enforcement.linter: null). Linter opt-in por projeto via eject. Escopo tiered: ~16 universais + 4 condicionais; DB-específicos → stacks."
---

# ADR 007 — Biblioteca de standards default de engenharia (plugin-bundled + fetch, warn-only, eject)

- **Data:** 2026-06-01
- **Status:** Proposto
- **Escopo:** Organizacional
- **Stack:** universal
- **Categoria:** Princípios de Código

---

## Contexto

ADR-002 definiu o mecanismo de standards (tripla camada + linter sandboxed). Falta a camada de defaults: novos projetos chegam sem standards, gerando onboarding lento e divergência entre times. O plugin precisa bundlar defaults sem git submodule (marketplace não inicializa submodules) e sem copiar 26 arquivos para cada projeto.

## Drivers

- Instalação via marketplace não inicializa submodules → defaults vazios sem bundling explícito
- Fetch ao vivo de repo standalone mantém defaults atualizados sem pinar commit
- Linter executável no sandbox (SI-4) não pode ser bundlado no plugin sem estender permissões
- Projetos precisam sobrescrever defaults sem fork do plugin (eject por standard)
- Conteúdo remoto flui para contexto do agente (Stage-2) → superfície de injeção SI-6

## Decisão

Standards default são **plugin-bundled** (snapshot em `assets/standards/`) + **fetch https** do repo `NEXUZ-SYS/devflow-standards` executado por `/devflow update` (script `update-default-standards.sh`). Defaults carregam com `enforcement.linter: null` (warn-only) — linter executável é **opt-in por projeto**. Override via **eject** (`/devflow standards eject <id>`) copia o standard para `.context/standards/`; disable via `standards.local.yaml`.

Escopo **tiered**: ~16 universais (concern-first, naming, error-handling, testes, segurança básica) + 4 condicionais (applyTo glob). Contracts DB-específicos excluídos → residem em stacks. Carregamento just-in-time via `loadStandardsMerged` (fusão project + default, project vence) + filtro por `applyTo`/task.

**Trust boundary (R6):** conteúdo de `NEXUZ-SYS/devflow-standards` é first-party, mas flui para Stage-2 → **sanitização SI-6** (strip de role-markers + "ignore instructions") em `update-default-standards.sh` antes de gravar.

## Alternativas Consideradas

- **git submodule** — marketplace não inicializa submodules → defaults vazios; pina commit, contradiz "ao vivo" → rejeitado
- **scaffold-on-init** (copiar para todo projeto) — drift/re-sync + ~26 arquivos de ruído no repo do projeto → rejeitado
- **linter executável bundlado no plugin** — exigiria estender sandbox SI-4 além do escopo atual → rejeitado
- **Plugin-bundled + fetch https + warn-only + eject** ✓ — offline-safe, zero ruído no projeto, linter opt-in, trust-boundary documentado

## Consequências

**Positivas**
- Novos projetos recebem defaults imediatos sem config manual
- `loadStandardsMerged` garante project > default; sem conflito de namespace
- SI-6 sanitização previne prompt injection via MANIFEST remoto

**Negativas**
- Snapshot bundlado pode ficar stale entre releases do plugin (mitigação: `/devflow update` regenera)
- Eject gera cópia local que pode divergir se default evoluir (aceito: é o contrato do eject)

**Riscos aceitos**
- Fetch falha offline → fail-safe: bundle local é usado sem aviso de erro bloqueante

## Guardrails

- SEMPRE carregar defaults via `loadStandardsMerged` — NUNCA ler `assets/standards/` diretamente em hook
- NUNCA bundlar linter executável no plugin (warn-only obrigatório para defaults; linter opt-in por eject)
- QUANDO customizar um default ENTÃO usar `/devflow standards eject <id>` (cópia em `.context/standards/`)
- NUNCA interpolar linha do MANIFEST remoto em path — validar basename antes de gravar (SI-6 anti-traversal)
- SEMPRE aplicar sanitização SI-6 (strip role-markers + "ignore instructions") no `update-default-standards.sh` antes de gravar qualquer conteúdo remoto
- QUANDO fetch falha (offline/timeout) ENTÃO fail-safe: usar bundle local sem bloquear execução

## Enforcement

- [ ] Teste: `tests/validation/test-default-standards-content.mjs` — concern-first presente, `enforcement.linter: null`, sem conteúdo DB-específico nos universais
- [ ] Script: `update-default-standards.sh` — HEAD-guard + MANIFEST-validation (basename allowlist) + strip SI-6 antes de `git write-tree`
- [ ] Lib: `loadStandardsMerged` symlink-safe, project > default, filtro `applyTo`/task
- [ ] Code review: PRs que adicionam default standards verificam `enforcement.linter: null` + `applyTo` glob válido (SI-5)

## Evidências / Anexos

- ADR que esta refina: `002-adopt-standards-triple-layer-v1.0.0` (tripla camada + SI-4)
- Plano de implementação: `.context/plans/default-engineering-standards.md`
- Lib: `scripts/lib/standards-loader.mjs` — função `loadStandardsMerged`
- Script de atualização: `scripts/update-default-standards.sh` (SI-6 sanitização)
- Standard de conteúdo gate: `tests/validation/test-default-standards-content.mjs`
