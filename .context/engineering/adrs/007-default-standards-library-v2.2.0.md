---
type: adr
name: default-standards-library
description: Repo standalone devflow-standards adota layout DDC — .md fetchados de .context/engineering/standards/, .js seguem bundled-only (anti-RCE)
scope: organizational
source: local
stack: universal
category: principios-codigo
status: Aprovado
version: 2.2.0
created: 2026-06-05
supersedes: ["007-default-standards-library-v2.1.0"]
refines: ["002-adopt-standards-triple-layer-v1.0.0"]
protocol_contract: null
decision_kind: firm
summary: "Evolução minor da v2.1.0 (estende, não reverte): o repo standalone NEXUZ-SYS/devflow-standards passa a adotar o layout DDC (.context/business|product|operations|engineering/standards), tornando-se fonte canônica navegável. Os std-*.md deixam de ser fetchados do root do repo e passam a vir de .context/engineering/standards/ — um subpath CONSTANTE controlado pelo plugin (nunca derivado do MANIFEST, anti-traversal preservado). A invariante de segurança não muda: machine/*.js continuam bundled-only — o repo os contém como FONTE em machine/, mas update-default-standards.sh NUNCA os fetcha (só .md). O conjunto de 13 linters, o loader origin-aware e todos os invariantes SI-4 da v2.1.0 permanecem byte-idênticos. O que muda é apenas o caminho de onde os .md são buscados e a estrutura do repo upstream."
---

# ADR 007 — Repo standalone adota layout DDC; fetch dos .md retargetado para .context/engineering/standards/ (anti-RCE preservado)

## Contexto

A v2.1.0 desta ADR consolidou 13 linters default bundlados e o mecanismo de resolução origin-aware (loader, 2º allowlist root, trust-anchor, fail-closed, bundled-only). O `scripts/update-default-standards.sh` refresca o snapshot vendorizado (`assets/standards/*.md`) buscando os `.md` do repo standalone `NEXUZ-SYS/devflow-standards` por HTTPS, com a invariante dura de que `.js` **nunca** é fetchado (anti-RCE).

Até a v2.1.0 o repo standalone era um diretório **plano**: `MANIFEST.txt` + `std-*.md` no **root**. Isso funcionava para o fetch, mas deixava o repo upstream desalinhado do layout DDC (`.context/business|product|operations|engineering/standards`) que o DevFlow adota como single source of truth navegável por IA. O repo standalone não era, ele próprio, um contexto DDC — era um despejo de arquivos no root.

Esta v2.2.0 é uma **evolução minor** (estende, **não reverte** a v2.1.0): reestrutura o repo standalone para o layout DDC e retargeta o fetch dos `.md` para o subpath correspondente. Nenhum invariante de segurança muda; o conjunto curado de 13 linters e o mecanismo de resolução permanecem byte-idênticos.

## Decisão

1. **O repo standalone `NEXUZ-SYS/devflow-standards` adota o layout DDC.** Passa a ter `.context/business/`, `.context/product/`, `.context/operations/` (reservados para conteúdo default futuro) e `.context/engineering/standards/` como camada de standards de engenharia, contendo `MANIFEST.txt` + `std-*.md` + `machine/*.js` (estes últimos como **fonte**). O root do repo é limpo dos `MANIFEST.txt`/`std-*.md` stale.

2. **O fetch dos `.md` é retargetado para `.context/engineering/standards/`.** `update-default-standards.sh` introduz a constante `STD_SUBPATH=".context/engineering/standards"`; o HEAD guard passa a bater em `${BASE_URL}/${STD_SUBPATH}/MANIFEST.txt` e o fetch por arquivo em `${BASE_URL}/${STD_SUBPATH}/${safe_name}`. O subpath é uma **constante controlada pelo plugin** — NUNCA derivada do MANIFEST nem de conteúdo remoto — então as garantias anti-traversal (R4) permanecem intactas: o destino local segue sendo `${STANDARDS_DIR}/$(basename validado)`.

3. **A invariante anti-RCE NÃO muda.** `machine/*.js` seguem **bundled-only**: o repo standalone os contém como FONTE em `.context/engineering/standards/machine/`, mas o `update` **nunca os fetcha** — só `.md` listados no MANIFEST local validado. A sincronização plugin↔repo dos `.js` acontece **no release**, com revisão humana e verificação byte-match, fora do caminho de fetch (ver `docs/standards-standalone-sync.md`).

4. **Migração é um no-op limpo para o plugin antigo.** Um usuário do plugin pré-retarget (que busca do root) rodando contra o repo já reestruturado faz HEAD no root → 404 → no-op (exit 0, snapshot intacto). Não há reversão nem erro — provado por teste executado (Test 7).

O conjunto de 13 linters, o loader `loadStandardsMerged`, o trust-anchor por marker, o fail-closed e o sandbox SI-4 são **exatamente** os da v2.1.0 — nada neles muda.

## Alternativas Consideradas

- **Manter o repo standalone plano (root)** — deixa o upstream desalinhado do DDC, não-navegável como contexto; rejeitado.
- **Derivar o subpath do MANIFEST remoto** — reabriria a superfície de path-traversal que R4 fecha; rejeitado em favor de uma constante hardcoded controlada pelo plugin.
- **Passar a fetchar `machine/*.js` agora que o repo é DDC** — violaria a invariante anti-RCE (código executável fetchado por HTTPS é RCE); rejeitado. `.js` seguem bundled-only, sincronizados só no release com revisão.
- **Reestruturar o repo para DDC + retargetar só o `.md`, mantendo `.js` bundled-only** ✓ — alinha o upstream ao DDC sem relaxar nenhum invariante de segurança.

## Consequências

**Positivas**
- O repo standalone vira fonte canônica navegável no layout DDC, consistente com o resto do DevFlow.
- O fetch dos `.md` continua igualmente seguro (subpath constante, anti-traversal preservado, anti-RCE intacto).
- Migração transparente: plugin antigo vira no-op limpo; nenhum usuário quebra na janela de transição.

**Negativas**
- Há uma janela de migração em que o plugin antigo (root-targeting) deixa de refrescar (no-op) até o usuário atualizar — aceitável, pois o snapshot bundlado continua válido.
- O sync dos `.js` plugin↔repo passa a exigir um passo de release explícito (byte-match) documentado, em vez de coincidir com a estrutura plana anterior.

**Riscos aceitos**
- Drift entre `machine/*.js` do plugin e do repo standalone se o sync de release for pulado — mitigado pelo procedimento de verificação byte-match (`diff -r`) documentado em `docs/standards-standalone-sync.md`, a rodar no release/CI.

## Guardrails

- SEMPRE fetchar os `.md` de `${BASE_URL}/.context/engineering/standards/` no repo standalone — o subpath é uma CONSTANTE controlada pelo plugin, NUNCA derivada do MANIFEST nem de conteúdo remoto (anti-traversal R4).
- NUNCA fetchar `machine/*.js`: `update-default-standards.sh` busca SÓ `.md`; os `.js` são **bundled-only**, parte do TCB do plugin, sincronizados plugin↔repo apenas no release com revisão humana (anti-RCE).
- SEMPRE manter o destino local como `${STANDARDS_DIR}/$(basename validado contra ENTRY_RE)` — o retarget muda APENAS a origem remota, nunca o caminho de escrita local.
- SEMPRE manter as 5 verificações SI-4 e o loader origin-aware da v2.1.0 — esta evolução não toca no mecanismo de resolução nem no sandbox.
- SEMPRE aplicar sanitização SI-6 no conteúdo `.md` fetchado antes de gravar.
- QUANDO sincronizar `machine/*.js` entre plugin e repo standalone ENTÃO fazê-lo no release com `diff -r` byte-match e revisão humana — NUNCA via fetch em runtime.
- SEMPRE garantir que o plugin antigo (root-targeting) contra o repo reestruturado seja um no-op limpo (HEAD root 404 → exit 0, snapshot intacto) — sem reversão.

## Enforcement

- [ ] `tests/scripts/test-update-default-standards.sh` — Tests 2/4 (happy path + sanitização) provam o fetch do novo subpath; Test 6 prova anti-RCE no novo path (`machine/*.js` nunca fetchado); Test 7 prova a migração (plugin antigo → no-op limpo, AC2).
- [ ] `docs/standards-standalone-sync.md` — procedimento de sync `.js` release-time + verificação byte-match plugin↔repo.

## Evidências

**Referências internas:** spec/plano `docs/superpowers/specs/2026-06-05-standards-standalone-ddc-restructure-design.md` + `docs/superpowers/plans/2026-06-05-standards-standalone-ddc-restructure.md` · invariantes SI-4, trust-anchor e bundled-only herdados da v2.1.0 (byte-idênticos) · ADR-002 (standards triple-layer) · ADR-006 (camada de conhecimento DDC). Evolução minor sobre `007-default-standards-library-v2.1.0` (file-per-version): reestrutura o repo upstream e retargeta o fetch dos `.md`, mantendo o mecanismo e a invariante anti-RCE intactos.
