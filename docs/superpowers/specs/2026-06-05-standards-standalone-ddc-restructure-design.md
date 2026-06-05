# Spec — Reestruturação DDC do repo standalone de standards + retarget do fetch

> **DevFlow workflow:** standards-standalone-ddc-restructure · **Scale:** MEDIUM · **Phase:** P
> **Status:** rascunho (aguardando aprovação) · **Data:** 2026-06-05
> **Branch:** `feat/standards-standalone-ddc-restructure`

## Problema

O repo standalone **NEXUZ-SYS/devflow-standards** é a fonte de onde o
`/devflow update` (Step 4d) refresca os `.md` dos standards default. Hoje:
- Os `.md` vivem no **root** do repo; `update-default-standards.sh` fetcha
  `${BASE_URL}/MANIFEST.txt` + `${BASE_URL}/${name}` do root.
- O repo não reflete o layout DDC (`.context/business|product|operations|engineering`)
  que o resto do ecossistema usa.
- Os linters (`.js`) não estão no repo — vivem só no plugin.

O usuário quer o repo standalone como **fonte canônica** padronizada no layout DDC,
**incluindo os linters como fonte**, mantendo a invariante de segurança.

## Restrições (ADR-007 v2.1.0 — guardrails duros)

- **`.js` NUNCA fetchado** pelo update (anti-RCE). Só `.md`.
- Host hardcoded (R3), HEAD-guard com no-op fail-safe, allowlist basename anti-traversal
  (R4), sanitização SI-6 (R6) — **todos preservados**.
- SI-4 / `loadStandardsMerged` / trust-anchor intactos (este ciclo não toca o runner).

## Decisão (escopo aprovado)

Reestruturar o repo standalone no layout DDC, mover os `.md` para
`.context/engineering/standards/`, adicionar os `.js` como **fonte** em
`machine/`, e retargetar o script de fetch para o novo path — `.js` seguem
**bundled-only**.

## Design

### D1 — Estrutura do repo `devflow-standards`
```
.context/
  business/      README.md      (scaffold reservado — sem default content hoje)
  product/       README.md      (scaffold reservado)
  operations/    README.md      (scaffold reservado)
  engineering/standards/
    MANIFEST.txt                 (21 entradas)
    std-*.md                     (21 .md enriquecidos — FONTE canônica)
    machine/std-*.js             (13 linters — FONTE; NUNCA fetchados)
README.md                        (explica layout + invariante .js-bundled-only)
```
As camadas business/product/operations recebem só um README (reservadas);
não inventamos default content.

### D2 — Retarget do `scripts/update-default-standards.sh`
Duas linhas de path (constante de subdir que NÓS controlamos):
- HEAD guard: `${BASE_URL}/.context/engineering/standards/MANIFEST.txt`
- Fetch: `${BASE_URL}/.context/engineering/standards/${safe_name}`

`ENTRY_RE` (`^std-[a-z][a-z0-9-]+\.md$`), R4 (basename-only), R6 (SI-6) **inalterados**.
O subdir é prefixo constante, não vem do MANIFEST → anti-traversal preservado.

### D3 — Compatibilidade retroativa (sem reversão)
Ao mover os `.md` para o novo path e **remover o MANIFEST.txt do root** do repo:
- Plugin **antigo** (script root): HEAD no root MANIFEST → 404 → **no-op limpo**
  (mantém snapshot bundlado; sem reversão do enriquecimento).
- Plugin **novo** (script retargetado): fetcha do novo path normalmente.
Migração segura nos dois sentidos.

### D4 — Sync `.js` plugin ↔ repo (release-time, nunca fetch)
Os `.js` ficam no repo como fonte, mas o bundle confiável é o do plugin
(`assets/standards/machine/`). Sincronização no **release** via passo documentado
+ um **teste de verificação** opcional (byte-match repo↔plugin) rodável em CI/clone.
O `update` do usuário **nunca** toca `.js`.

### D5 — ADR-007 → v2.2.0
Evolução minor: documenta a estrutura DDC do standalone + novo fetch path
`.context/engineering/standards/` + reafirma `.js`-bundled-only (a invariante não muda;
só o local dos `.md` no repo-fonte).

### D6 — População do repo (outward, nesta execução)
Task de Execução: clonar o repo, montar o layout DDC, copiar os 21 `.md` + MANIFEST
+ `machine/*.js` + READMEs de scaffold, remover `.md`/MANIFEST stale do root,
commit + **push (confirmado antes de executar)**.

## TDD (obrigatório)
- **Retarget (D2):** RED — teste com o seam `DEVFLOW_STANDARDS_BASE_TEST=file://`
  apontando para uma fixture que espelha o NOVO layout
  (`.context/engineering/standards/{MANIFEST.txt,std-*.md}`); o script deve fetchar os
  `.md` do novo path. Modelar no teste existente `tests/scripts/test-update-default-standards.sh`.
- **Anti-RCE (regressão):** a fixture pode conter um `machine/x.js`; o teste asserta que
  **nenhum `.js`** foi escrito no STANDARDS_DIR (fetch só `.md`).
- **No-op fail-safe:** fixture sem o MANIFEST no novo path → HEAD 404 → exit 0, snapshot intacto.

## Escopo
- **IN:** retarget do script (D2) + testes; READMEs de scaffold; ADR-007 v2.2.0;
  reestruturação+população do repo standalone (D6, outward com confirmação);
  doc do sync `.js` release-time (D4).
- **OUT:** mudar o runner/SI-4/loadStandardsMerged; fetchar `.js`; popular
  business/product/operations com conteúdo; automatizar o sync `.js` no update.

## Critérios de aceitação
1. `update-default-standards.sh` fetcha `.md` de `.context/engineering/standards/`
   (teste verde com o seam file://); nenhum `.js` escrito (anti-RCE).
2. Script antigo (root) vira no-op limpo após a remoção do MANIFEST root (sem reversão).
3. Repo standalone reestruturado no layout DDC (D1), com 21 `.md` + MANIFEST +
   `machine/*.js` + READMEs; root limpo dos `.md`/MANIFEST stale. (push confirmado)
4. ADR-007 v2.2.0 Aprovado, audit PASSED, supersedes v2.1.0 coerente.
5. Doc do sync `.js` release-time presente.
6. Suíte de scripts/standards verde (exceto as 2 falhas de rede pré-existentes).

## Riscos
- **Push outward no repo errado/estrutura errada** — mitigado por confirmação do
  comando antes de executar (D6) e por revisar o diff do clone antes do push.
- **Janela de migração** — mitigada pelo no-op fail-safe (D3): nenhum usuário reverte.
- **`.js` divergir entre repo e plugin** — mitigado pelo teste de verificação (D4) no release.
