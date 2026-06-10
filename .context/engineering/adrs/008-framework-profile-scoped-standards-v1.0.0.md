---
type: adr
name: framework-profile-scoped-standards
description: Standards de enforcement por perfil de framework — copiados no init (origin:project), sandbox SI-4 do set universal inalterado
scope: organizational
source: local
stack: universal
category: principios-codigo
status: Aprovado
version: 1.0.0
created: 2026-06-09
supersedes: []
refines: ["002-adopt-standards-triple-layer-v1.0.0"]
protocol_contract: null
decision_kind: firm
summary: "A biblioteca de Standards default passa a comportar conjuntos profile-scoped, ativados por detecção de framework (profiles/<fw>.yaml), além do set universal sempre-on. Os Standards de um perfil moram num subdir bundled (assets/standards/profiles/<fw>/) que o loader universal ignora (não recursa), e são COPIADOS para .context/engineering/standards/ do projeto quando o perfil casa — virando origin:project e rodando sob o sandbox de linter do próprio projeto. A allowlist do sandbox origin:default (anti-RCE do ADR-007) NÃO muda: live-merge de linters profile-scoped exigiria abrir a allowlist origin:default, então optou-se pela cópia (mesmo modelo já usado para agents/skills de perfil). profiles/<fw>.yaml ganha as chaves standards: e stacks:; a wishlist de stacks é semeada no manifest do projeto como entradas mcpIndexed. A integridade do trio yaml↔MANIFEST↔arquivos é guardada por teste. Primeiro consumidor: perfil Odoo, com 17 std-odoo-*."
---

# ADR 008 — Standards de enforcement por perfil de framework (copiados no init; sandbox SI-4 universal inalterado)

## Contexto

O ADR-002 estabeleceu o Standard triple-layer (Markdown + frontmatter + linter). O ADR-007 consolidou a **biblioteca de Standards default** universais (~21 `.md` + 13 linters bundled), carregada via `loadStandardsMerged()` como `origin:"default"` em **todo** projeto, com um sandbox SI-4 que trava linters `origin:"default"` na allowlist `<plugin>/assets/standards/machine/` (invariante anti-RCE: `.js` bundled-only, nunca fetchado).

A v1.13.0 introduziu **perfis de framework** (`profiles/<fw>.yaml`, lidos por `detect-framework.mjs`): mapeamento data-driven que, ao detectar um framework no projeto (ex.: Odoo via `__manifest__.py`), contribui **agents** e **skills** extras, **copiados** para `.context/` no `project-init`/`context-sync`.

Faltava um equivalente para **Standards**: regras de enforcement específicas de um framework (ex.: disciplina de ORM, escaping QWeb, higiene de manifest no Odoo) que **não** devem rodar em projetos de outro stack. Pôr essas regras no set universal `assets/standards/` faria o hook lintar regra de OWL/l10n_br em projeto não-Odoo (e o audit S7 do standards-builder as marcaria como lib-centric). Era preciso um mecanismo **condicional por framework**, sem relaxar o sandbox crítico do set universal.

## Decisão

1. **A biblioteca default passa a comportar conjuntos *profile-scoped*.** Um perfil declara seus Standards em `profiles/<fw>.yaml` na chave `standards:` (lista de ids), espelhada num `MANIFEST.txt` do subdir do perfil.

2. **Os arquivos moram num subdir bundled ignorado pelo loader universal.** `assets/standards/profiles/<fw>/std-<id>.md` + `machine/std-<id>.js`. O `readStandardsFromDir` do loader universal lê só `*.md` do **topo** de `assets/standards/` e não recursa em subdiretórios — então o subdir `profiles/` nunca é carregado como default universal.

3. **Ativação por cópia no init/sync (origin:project), não live-merge.** Quando o perfil casa, `project-init`/`context-sync` **copiam** `std-<id>.md` + `machine/std-<id>.js` para `.context/engineering/standards/` (+`machine/`) do projeto. Lá viram `origin:"project"` e rodam sob o sandbox de linter do **projeto** (`contextPaths(projectRoot).standardsMachine`), que já os permite. É o mesmo modelo de cópia já usado para agents/skills de perfil.

4. **O sandbox `origin:"default"` (anti-RCE do ADR-007) NÃO muda.** Live-merge dos linters profile-scoped exigiria estender a allowlist `origin:"default"` para incluir `assets/standards/profiles/*/machine/` — abrindo a superfície de segurança que o ADR-007 fecha. Rejeitado em favor da cópia, que mantém o sandbox crítico **byte-idêntico**.

5. **`profiles/<fw>.yaml` ganha também `stacks:`** — wishlist de docs versionados (`lib`/`version`/`discoveryHints`/`applyTo`), semeada no `manifest.yaml` de stacks do **projeto** como entradas `mcpIndexed: true` (via `devflow stacks add`). O scrape real para o store global do `docs-mcp-server` é follow-up do usuário. O manifest do self-repo permanece vazio (bridge plugin).

6. **Integridade garantida por teste.** O trio `profiles/<fw>.yaml standards:` ↔ `MANIFEST.txt` ↔ arquivos em disco é verificado por `tests/integration/test-profile-standards-integrity.mjs` (sem órfãos; todo id tem `.md`+`.js`).

Primeiro consumidor: o **perfil Odoo**, com 17 `std-odoo-*` (Tier 1 forte, Tier 2 parcial, Tier 3 NXZ `weakStandardWarning`).

## Alternativas Consideradas

- **Pôr os Standards de framework no set universal `assets/standards/`** — fariam lint em todo projeto, inclusive não-Odoo; lib-centric (S7 WARN). Rejeitado.
- **Live-merge profile-scoped como `origin:"framework-default"` com nova allowlist** — abriria a allowlist do sandbox `origin:"default"`, relaxando o anti-RCE do ADR-007. Rejeitado por segurança.
- **Cópia no init para `.context/` (origin:project), sandbox universal intocado** ✓ — condicional por framework, consistente com agents/skills de perfil, sem tocar na superfície crítica.
- **Só documentar as regras em skill (sem linter)** — perde enforcement em CI/hook. Rejeitado.

## Consequências

**Positivas**
- Enforcement de framework ativado **só** onde se aplica; set universal permanece limpo e genuinamente cross-cutting.
- Zero mudança na superfície de segurança do set universal (sandbox `origin:"default"` byte-idêntico).
- Mecanismo data-driven e extensível: novo framework = novo `profiles/<fw>.yaml` + subdir, sem mudar código.
- Reusa o pipeline de cópia já existente para agents/skills de perfil.

**Negativas**
- Os Standards de perfil só passam a valer após `init`/`sync` copiá-los (não são live como os universais). Aceitável — consistente com agents/skills de perfil.
- Cópia cria snapshots no projeto que podem divergir do bundle ao longo do tempo; `context-sync` reconcilia sem sobrescrever customizações.

**Riscos aceitos**
- Drift entre o `.md`/`.js` copiado e o bundle do plugin — mitigado pelo `context-sync` (cópia incremental, não sobrescreve edição do projeto; respeita `standards.local.yaml disable:`).
- Órfão no trio yaml/MANIFEST/arquivos — mitigado pelo teste de integridade (fail-closed no CI).

## Guardrails

- SEMPRE manter os Standards de perfil em `assets/standards/profiles/<fw>/` (subdir) — NUNCA soltos em `assets/standards/`, senão o loader universal os carrega em todo projeto.
- NUNCA estender a allowlist do sandbox `origin:"default"` para incluir `profiles/*/machine/` — os linters de perfil rodam como `origin:"project"` após cópia (anti-RCE do ADR-007 preservado).
- SEMPRE manter o trio `profiles/<fw>.yaml standards:` ↔ `MANIFEST.txt` ↔ arquivos sincronizado — todo id declarado tem `.md` + `machine/.js`; sem órfãos.
- SEMPRE copiar (nunca live-merge) os Standards de perfil no `project-init`/`context-sync`, sem sobrescrever Standard já customizado pelo projeto e respeitando `standards.local.yaml disable:`.
- SEMPRE semear a wishlist `stacks:` do perfil no manifest do PROJETO como `mcpIndexed`, nunca no manifest do self-repo (bridge plugin, vazio por design).
- NUNCA nomear um Standard de perfil por módulo/subsistema (`std-odoo-pos`) — concern-framed sempre (regra que atravessa módulos).

## Enforcement

- [ ] `tests/integration/test-profile-standards-wiring.mjs` — `frameworkContributions` expõe `standards`/`stacks`; `loadProfiles` normaliza as chaves; backward-compat (perfil sem as chaves → arrays vazios).
- [ ] `tests/integration/test-profile-standards-integrity.mjs` — trio yaml↔MANIFEST↔arquivos sem órfãos (fail-closed).
- [ ] `tests/integration/test-stacks-add.mjs` — `devflow stacks add` semeia o manifest com entrada `mcpIndexed`.
- [ ] `tests/odoo-standards/*.test.mjs` — 17 linters `std-odoo-*` com fixtures BAD/GOOD (RED→GREEN).

## Evidências

**Referências internas:** plano `.context/plans/odoo-profile-standards.md` (spec + faseamento PREVC) · doc `docs/odoo-profile-standards.md` · `scripts/lib/standards-loader.mjs` (`loadStandardsMerged`, `readStandardsFromDir`) · `scripts/lib/run-linter.mjs` (`resolveAndCheckSandbox`, sandbox SI-4 origin-aware) · `scripts/lib/detect-framework.mjs` (`loadProfiles`/`frameworkContributions`) · `profiles/odoo.yaml`. Refina o ADR-002 (Standard triple-layer); coexiste com o ADR-007 (default standards library / sync do repo standalone), cujo invariante anti-RCE (`.js` bundled-only, allowlist `origin:"default"`) permanece intocado por esta decisão. Estende o mecanismo de perfis de framework introduzido na v1.13.0 (agents/skills) para também carregar Standards e stacks.
