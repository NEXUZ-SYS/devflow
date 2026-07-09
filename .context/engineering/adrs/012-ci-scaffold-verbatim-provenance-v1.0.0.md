---
type: adr
name: ci-scaffold-verbatim-provenance
description: Scaffold de infra de CI é copiado verbatim do plugin, nunca templatizado, e o drift é governado por proveniência de hash.
scope: organizational
source: local
stack: universal
category: arquitetura
status: Proposto
version: 1.0.0
created: 2026-07-09
supersedes: []
refines: []
protocol_contract: null
decision_kind: firm
summary: "Artefatos de CI scaffoldados vivem verbatim no plugin (assets/release-scaffold/), são copiados sem interpolação, e o drift é resolvido por hash (intocado→atualiza, editado→preserva). A CI nunca depende do plugin."
---

# ADR — Scaffold de infra de CI: self-contained, verbatim e governado por proveniência

- **Data:** 2026-07-09
- **Status:** Proposto
- **Escopo:** Organizacional
- **Stack:** universal (GitHub Actions + Node + bash)
- **Categoria:** Arquitetura

---

## Contexto

O DevFlow quer oferecer scaffold de uma pipeline de release a projetos que escolhem `versioning: pipeline` sem ter CI (hoje o bump vira no-op silencioso). Duas restrições duras moldam a solução:

1. **A CI não alcança o plugin.** O workflow roda num runner do GitHub **sem o DevFlow instalado** — não pode invocar `${CLAUDE_PLUGIN_ROOT}/scripts/...`. Logo "scaffoldar" significa **copiar código para o repo do usuário**, criando risco de *drift* entre a cópia e o plugin.
2. **A proveniência só cobre verbatim.** O mecanismo existente (`scripts/lib/provenance-sync.mjs` + `assets/provenance/known-hashes.json`) decide "deploy intocado → atualiza" vs "editado localmente → preserva" comparando **hash byte-a-byte**. Qualquer templating/interpolação quebra a proveniência.

## Decisão

Manter os artefatos de scaffold em `assets/release-scaffold/` no plugin, **verbatim**, indexados em `known-hashes.json`. O `devflow:config` os copia (**opt-in explícito**, apenas com repositório git **e** remote GitHub) para `.github/workflows/` e `scripts/`. O `/devflow update` aplica `provenance-sync` a essas cópias: **intocado → atualiza; editado localmente → preserva e reporta; ausente → não recria** (scaffold é opt-in). Nenhum artefato scaffoldado é templatizado — configuração por projeto é resolvida por **detecção em runtime** (ex.: o `bump-version.sh` genérico detecta os version files presentes).

## Alternativas Consideradas

- **Delegar ao ecossistema** — o workflow usa `npm version`/`poetry version`/`cargo` conforme o manifest detectado. Copia pouco código, mas ramifica por ecossistema (multi-stack confuso) e perde os guards (`version-guard`/`changelog-guard`) que barram pulo/regressão de versão e release sem notas.
- **Não scaffoldar: avisar + documentar** um modelo de referência. Zero drift e zero manutenção, mas resolve só metade do gap (o usuário monta tudo à mão).
- **Self-contained + proveniência** ✓ — copia os dois workflows (release PR + publish) e os scripts de que dependem; o drift é governado pela proveniência por hash.

## Consequências

**Positivas**
- O scaffold funciona sem o plugin instalado (a CI é autossuficiente).
- Drift governado por hash; edições locais nunca são sobrescritas silenciosamente.
- Artefatos auditáveis: o que roda na CI do usuário é byte-idêntico ao asset do plugin.

**Negativas**
- Código copiado passa a viver no repo do usuário (superfície de manutenção).
- Os assets do plugin precisam ser mantidos em sincronia com a infra de release do próprio devflow.

**Riscos aceitos**
- Escrever em `.github/workflows/` executa CI no repo do usuário — mitigado por opt-in explícito, gate git+GitHub e "nunca sobrescrever".

## Guardrails

- SEMPRE copiar artefatos de scaffold **verbatim** (byte-a-byte do plugin).
- NUNCA interpolar/templatizar um artefato scaffoldado — a proveniência por hash só cobre verbatim.
- NUNCA sobrescrever arquivo existente do usuário ao scaffoldar; preservar e reportar.
- NUNCA fazer um artefato que roda em CI depender de `${CLAUDE_PLUGIN_ROOT}` — a CI não alcança o plugin.
- QUANDO um scaffold precisar de configuração por projeto, ENTÃO detectar em runtime, nunca gerar por substituição.
- NUNCA criar workflows de CI sem opt-in explícito, repositório git e remote GitHub.

## Enforcement

- [ ] Teste: hash do arquivo copiado é idêntico ao do asset (verbatim); editar 1 byte → proveniência marca "preservado".
- [ ] Teste: o scaffold recusa sobrescrever arquivo existente do usuário.
- [ ] Lint/guard: rejeitar a string `CLAUDE_PLUGIN_ROOT` em qualquer arquivo sob `assets/release-scaffold/`.
- [ ] Teste: gate — sem git não oferece scaffold; sem remote GitHub avisa.

## Evidências / Anexos

**Fontes oficiais:** [GitHub Actions — workflow syntax](https://docs.github.com/en/actions/reference/workflow-syntax-for-github-actions) · [Semantic Versioning 2.0.0](https://semver.org/) · [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/)

```bash
# assets/release-scaffold/bump-version.sh — detecção em runtime (verbatim, sem interpolação)
for f in package.json pyproject.toml Cargo.toml .claude-plugin/plugin.json VERSION; do
  [ -f "$f" ] && update_version "$f" "$NEW_VERSION"   # nada de ${CLAUDE_PLUGIN_ROOT}: a CI não alcança o plugin
done
```
