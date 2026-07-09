---
type: adr
name: ci-scaffold-verbatim-provenance
description: Scaffold de infra de CI é copiado verbatim do plugin, nunca templatizado, e o drift é governado por proveniência de hash.
scope: organizational
source: local
stack: universal
category: arquitetura
status: Aprovado
version: 1.1.0
created: 2026-07-09
supersedes: []
refines: []
protocol_contract: null
decision_kind: firm
summary: Artefatos de CI scaffoldados vivem verbatim no plugin (assets/release-scaffold/), são copiados sem interpolação, e o drift é resolvido por hash (intocado→atualiza, editado→preserva). A CI nunca depende do plugin.
---

# ADR — Scaffold de infra de CI: self-contained, verbatim e governado por proveniência

- **Data:** 2026-07-09
- **Status:** Aprovado
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

**Fronteira de confiança (v1.1.0)**

A proveniência por hash detecta **deriva local** — nada mais. Ela responde "esta cópia ainda é byte-idêntica ao asset que o plugin traz hoje?" e **não** é uma atestação de supply-chain: não prova a origem do asset, não assina o plugin, e não protege contra um plugin comprometido. Um atacante que altera o asset no plugin altera junto o `known-hashes.json`, e a cópia derivada passa a ser "intocada" por construção. Tratar o `known-hashes.json` como detector de edição do usuário, jamais como raiz de confiança.

Disso decorre a assimetria dos dois controles de escrita:

- **D7b é o controle mecânico.** `.github/workflows/**` está fora de `allow.fs.write`, logo a ferramenta `Write` cai em `mode: prompt` (e em branch protegida, em `DENY`). O gate é do harness, não do nosso código.
- **D7a é auxiliar e auto-contornável.** O guard de autonomia lê `.context/workflow/status.yaml`, que é um arquivo gravável e isento de branch protection: um agente não-cooperativo pode reescrevê-lo antes de chamar o applier. Ele encurta o caminho feliz do erro honesto; não detém um adversário.

## Guardrails

- SEMPRE copiar artefatos de scaffold **verbatim** (byte-a-byte do plugin).
- NUNCA interpolar/templatizar um artefato scaffoldado — a proveniência por hash só cobre verbatim.
- NUNCA sobrescrever arquivo existente do usuário ao scaffoldar; preservar e reportar.
- NUNCA fazer um artefato que roda em CI depender de `${CLAUDE_PLUGIN_ROOT}` — a CI não alcança o plugin.
- QUANDO um scaffold precisar de configuração por projeto, ENTÃO detectar em runtime, nunca gerar por substituição.
- NUNCA criar workflows de CI sem opt-in explícito, repositório git e remote GitHub.
- NUNCA aplicar update em artefato **classe-CI** sem **diff + confirmação** humana; `untouched` + asset mudou → `needsConfirm`, nunca auto-overwrite.
- NUNCA escrever scaffold sem confirmação humana; NUNCA escrever com `autonomy: autonomous`. `.github/workflows/**` é gravado pela ferramenta **`Write`** (que passa pelo gate de permissões), **nunca** por `node:fs`.
- NUNCA deixar hardcode específico do plugin (`.claude-plugin/`, `.cursor-plugin/`, `marketplace.json`, `known-hashes`, `grep` de manifest fixo) num asset de release-scaffold — o asset roda no repo do **usuário**.

## Enforcement

- [ ] Teste `C.11`: hash do arquivo copiado é idêntico ao do asset (verbatim); editar 1 byte → proveniência marca "preservado" (`D.e`).
- [ ] Teste `C.12`: o scaffold recusa sobrescrever arquivo existente do usuário (`preserved`, conteúdo intacto).
- [ ] Guard-test `B.1a`: rejeitar a string `CLAUDE_PLUGIN_ROOT` em qualquer arquivo sob `assets/release-scaffold/`.
- [ ] Teste `C.1`–`C.8e`: gate — sem git não oferece scaffold; sem remote GitHub avisa; host parseado de forma ancorada (userinfo, porta, case).
- [ ] Teste `C.9`: `applyScaffold` sem `confirmed: true` → `refused`, nada escrito.
- [ ] Teste `C.9b`: `autonomy: autonomous` em `status.yaml` → `refused` mesmo com `confirmed: true` (D7a).
- [ ] Teste `C.9c`: `.github/workflows/**` sai em `mustWriteViaTool`, nunca é escrito por `node:fs` (D7b).
- [ ] Teste `C.9d`: `verifyWritten` — `hash(dest) === hash(asset)`; 1 byte alterado → `mismatch` fail-loud.
- [ ] Teste `C.13`/`C.13b`: contenção — symlink, `..` e diretório-pai symlink fora do `projectRoot` → `refused`.
- [ ] Teste `D.1c`: update de classe-CI exige diff + confirmação (`needsConfirm`); sem `confirm` não escreve.
- [ ] Guard-test `B.1h`: nenhum hardcode do plugin (`.claude-plugin`, `.cursor-plugin`, `marketplace.json`, `known-hashes`, `grep` de `plugin.json`) nos assets.

## Evidências / Anexos

**Fontes oficiais:** [GitHub Actions — workflow syntax](https://docs.github.com/en/actions/reference/workflow-syntax-for-github-actions) · [Semantic Versioning 2.0.0](https://semver.org/) · [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/)

```bash
# assets/release-scaffold/bump-version.sh — detecção em runtime (verbatim, sem interpolação)
# Só manifests de ecossistema, na RAIZ. Nada de .claude-plugin/plugin.json: o asset roda
# no repo do usuário, não no plugin (guardrail anti-hardcode).
for f in package.json pyproject.toml Cargo.toml VERSION; do
  [ -f "$f" ] && update_version "$f" "$NEW_VERSION"   # nada de ${CLAUDE_PLUGIN_ROOT}: a CI não alcança o plugin
done
```
