# Plano — Standards default do Odoo (profile-scoped) + wishlist de stacks

> Status: **CONCLUÍDO** (Lotes 0–5) · Branch: `feat/odoo-default-standards` · Autor: standards-builder (DevFlow)
> Registro: ADR-008 (framework-profile-scoped standards). 17 std-odoo-* + wiring + docs entregues; scrape das stacks deixado como follow-up (`/devflow:scrape-stack-batch`).
> Relacionados: [[default-engineering-standards]] · [[standards-default-enforcement]] · [[framework-profiles-agent-skill-selection]] · ADR-007 (default-standards-library) · ADR-002 (triple-layer)

---

## 1. Objetivo

Entregar, como **default do plugin**, um conjunto de **17 Standards de enforcement para desenvolvimento Odoo** (prosa + frontmatter + linter `machine/*.js` + teste), ativados **somente em projetos Odoo** via o perfil de framework existente (`profiles/odoo.yaml`). Adicionalmente, declarar uma **wishlist de stacks** das versões Odoo 12 / 17 / 18 para indexação no store global do `docs-mcp-server`.

Contexto de negócio NXZ: Odoo 12 (NXZ ERP em produção), Odoo 17 (ERP interno), Odoo 18 (futura versão do NXZ ERP, em migração).

Fontes dos standards: **doc oficial Odoo** (`odoo.com/documentation/{12,17,18}`), **OCA `pylint-odoo` / `odoo-pre-commit-hooks`**, e **refs internas NXZ** (`skills/odoo-development`, `skills/frontend-specialist-odoo`, `agents/odoo-specialist.md`). Nenhuma fonte inventada (hard-rule #6 do standards-builder).

---

## 2. Decisões de arquitetura (3 descobertas que contradizem o comando original)

### D1 — Profile-scoped, NÃO universal
`scripts/lib/standards-loader.mjs::loadStandardsMerged()` carrega **todo** `<pluginRoot>/assets/standards/*.md` como `origin:"default"` para **todo** projeto. Colocar os stds Odoo soltos ali faria o hook lintar regra de OWL/ORM/l10n_br em projeto não-Odoo (e o audit S7 marcaria como lib-centric).
→ Os stds Odoo moram num **subdir** (`assets/standards/profiles/odoo/`) que o loader universal **ignora** (`readStandardsFromDir` não recursa; só lê `*.md` do topo). São **copiados** para `.context/engineering/standards/` do projeto **apenas quando o perfil Odoo é detectado**, virando `origin:"project"` — aí o merge loader existente os aplica por-projeto.

### D2 — Stacks = wishlist `mcpIndexed`, NÃO arquivos em `assets/stacks/`
O `scrape-stack-batch` v0.2.0 **removeu** a Fase B de gerar `.md` (`artisanalRef`). O output hoje é o **store global do docs-mcp-server**. `manifest-stacks.mjs` valida entradas com `mcpIndexed: true` + `discoveryHints: [urls]`. O map `frameworks` é keyed por lib (uma versão por chave) → usar chaves distintas `odoo-12` / `odoo-17` / `odoo-18`.
→ O perfil declara a wishlist; o `project-init` semeia o manifest do **projeto** (não o self-repo, que é bridge plugin e fica vazio); o scrape para o store é ação de runtime do usuário.

### D3 — Concern-framed, nunca module-framed
Cada std descreve uma **regra operacional imperativa** que atravessa módulos (ex.: "nunca emitir símbolo de API removido na versão alvo"), nunca um módulo/subsistema ("POS", `point_of_sale`). Regras de POS/MRP/REST são instâncias de `version-api-hygiene` (#7) ou `orm-discipline` (#3), não standards próprios.

---

## 3. Layout físico

```
profiles/odoo.yaml                              # +chaves: standards, stacks
assets/standards/profiles/odoo/
  MANIFEST.txt                                  # lista dos 17 ids (profile-scoped)
  std-odoo-<id>.md            (×17)             # prosa + frontmatter
  machine/std-odoo-<id>.js    (×17)             # linter bundled (recebe argv[2]=filePath)
tests/odoo-standards/
  std-odoo-<id>.test.mjs      (×17)             # fixtures good/bad → asserts exit code
scripts/lib/detect-framework.mjs                # loadProfiles + frameworkContributions: +standards +stacks
skills/project-init/SKILL.md                    # +Step: copiar profile standards → projeto
skills/context-sync/SKILL.md                    # idem (sync incremental)
.context/engineering/adrs/007-...-v2.3.0.md     # evolve minor (lib default agora inclui sets profile-scoped)
```

> `machine/*.js` seguem **bundled-only** (invariante anti-RCE do ADR-007): são fonte no plugin, nunca fetchados. Não tocam no `update-default-standards.sh`.

---

## 4. Catálogo dos 17 standards

Fonte: **[OFC]** oficial Odoo · **[OCA]** pylint-odoo/pre-commit-hooks · **[NXZ]** refs internas.
Lint: **F** forte (grep/AST estático) · **P** parcial (heurístico) · **W** fraca (`weakStandardWarning:true`, maioria human-review).

### Tier 1 — lint forte
| # | id | regra-núcleo | applyTo | lint | fonte |
|---|---|---|---|---|---|
| 1 | std-odoo-naming-conventions | `_name` singular pontilhado + `_description`; campo `_id`/`_ids`; método `_compute_/_search_/_check_/action_`; xml-id `_`(12) vs `__`(17/18) | `**/models/**/*.py`, `**/*.xml` | F/P | OFC+OCA |
| 2 | std-odoo-manifest-hygiene | keys obrigatórias; `version` 5-seg série-prefixada; license permitida; author c/ OCA; `data` security-first | `**/__manifest__.py`, `**/__openerp__.py` | F | OCA |
| 3 | std-odoo-orm-discipline | nunca SQL cru p/ CRUD; nunca interpolar string em SQL; nunca `cr.commit()` mid-method; `super()` em override; sem monkey-patch de core | `**/*.py` | F | OFC+OCA+NXZ |
| 4 | std-odoo-computed-fields | `@api.depends`; iterar `for record in self`; `store=True` quando pesquisado; nunca `write` em compute | `**/models/**/*.py` | F/P | OFC+OCA |
| 5 | std-odoo-i18n | string de usuário em `_()`/`self.env._()`; placeholder `%(name)s` lazy; nunca f-string/`.format()` dentro de `_()` | `**/*.py` | F | OCA |
| 6 | std-odoo-code-hygiene | nunca `print()` (usar `_logger`); sem `string=` redundante; import relativo no addon; `requests` com `timeout` | `**/*.py` | F | OCA |
| 7 | std-odoo-version-api-hygiene | nunca símbolo removido/renomeado na versão alvo (`search(count=True)`, `name_get`, `<tree>`, `attrs=`, `@api.model` em create, `showPopup`, Moment) | `**/*.py`, `**/*.xml`, `**/static/src/**/*.js` | F | NXZ+OCA+OFC |
| 8 | std-odoo-js-modules | ES module + `/** @odoo-module **/`; nunca `odoo.define`/`require` | `**/static/src/**/*.js` | F | OFC |
| 9 | std-odoo-qweb-escaping | `t-out` (nunca `t-raw`; `t-esc` deprecado 18); `Markup` p/ HTML; `t-inherit` c/ prefixo | `**/*.xml`, `**/static/src/**/*.xml` | F | OFC |
| 10 | std-odoo-test-discipline | herdar `TransactionCase`/`HttpCase`; `test_*.py` em `tests/__init__`; `@tagged(post_install)`; nunca `cr.commit()` em teste; fixtures em `setUpClass` | `**/tests/**/*.py` | F/P | OFC |

### Tier 2 — lint parcial
| # | id | regra-núcleo | applyTo | lint | fonte |
|---|---|---|---|---|---|
| 11 | std-odoo-module-structure | dirs canônicos; cadeia `__init__`; `README.rst` (não `.md`); model `.py` nunca na raiz | `**/__manifest__.py` | P | OFC+OCA |
| 12 | std-odoo-orm-performance | nunca query (`search`/`browse` single) em loop; `browse` em lote; `_read_group` p/ agregar; `index=True` em campo pesquisado | `**/*.py` | F/P | OFC |
| 13 | std-odoo-security | `ir.model.access.csv` ≥1 linha/modelo; multi-company `check_company=True`; controller `auth='user'`; nunca `auth='public'`+`sudo()` | `**/*.py`, `**/security/*.csv`, `**/controllers/**/*.py` | F/P | OFC |
| 14 | std-odoo-owl-patterns | `setup()` (não `constructor`); `patch()` (não herança de core); `super.method()` method-notation; service via `registry`+`useService` | `**/static/src/**/*.js` | P | OFC |

### Tier 3 — fraca/human-review, domínio NXZ (`weakStandardWarning:true`)
| # | id | regra-núcleo | applyTo | lint | fonte |
|---|---|---|---|---|---|
| 15 | std-odoo-oca-separation | terceiro/OCA intocado; extensão NXZ só via bridge `_inherit`; nunca campo `nxz_*` em módulo de terceiro | `**/*.py` | P/W | NXZ |
| 16 | std-odoo-qweb-pdf-safety | wkhtmltopdf: `<table>` (sem flex/grid); `class="article"`; QR base64 inline; sem `@media print` | `**/report/**/*.xml`, `**/reports/**/*.xml` | P/W | NXZ |
| 17 | std-odoo-fiscal-br-integrity | invariantes SEFAZ: série sem zero à esquerda; `ind_pres="1"` presencial; parceiro anônimo c/ `state_id`; emitir via `l10n_br_fiscal.document` | `**/*.py`, `**/*.xml` | W | NXZ |

Fontes oficiais verificadas (amostra): `coding_guidelines` 12/17/18 · `backend/security.html` · `backend/performance.html` · `backend/orm.html` · `backend/testing.html` · `backend/module.html` · `frontend/javascript_modules.html` · `frontend/owl_components.html` · `frontend/patching_code.html` · `frontend/qweb.html` · `github.com/OCA/pylint-odoo` · `github.com/OCA/odoo-pre-commit-hooks`.

---

## 5. Mudanças de wiring (código)

1. **`scripts/lib/detect-framework.mjs`** — `loadProfiles()` passa a normalizar `standards: []` e `stacks: []`; `frameworkContributions()` agrega `standards` (Set) e `stacks` (lista de `{lib, version, discoveryHints, applyTo}`). Retrocompatível (default `[]`).
2. **`profiles/odoo.yaml`** — `+standards: [<17 ids>]` e `+stacks:` (odoo-12@12.0, odoo-17@17.0, odoo-18@18.0 com `discoveryHints` apontando p/ `odoo.com/documentation/{ver}/`).
3. **`skills/project-init/SKILL.md`** — novo passo no fluxo de perfil: para cada `standards[]` do perfil ativo, copiar `assets/standards/profiles/odoo/std-<id>.md` + `machine/std-<id>.js` → `.context/engineering/standards/` (+`machine/`) do projeto (containment idêntico ao modo EJECT). Semear `stacks[]` no manifest via `addFrameworksToManifest`.
4. **`skills/context-sync/SKILL.md`** — mesma cópia em modo incremental (não sobrescreve std já customizado pelo projeto; respeita `standards.local.yaml disable:`).
5. **`assets/standards/profiles/odoo/MANIFEST.txt`** — lista os 17 ids (consumido pela cópia e por validação).

---

## 6. Disciplina TDD (obrigatória — RED→GREEN→REFACTOR)

Para **cada** std com linter:
1. **RED** — escrever `tests/odoo-standards/std-odoo-<id>.test.mjs` com ≥1 fixture **má** (deve violar → exit 1, `VIOLATION:`) e ≥1 **boa** (exit 0). Rodar: falha (linter ausente/stub).
2. **GREEN** — implementar `machine/std-odoo-<id>.js` até o teste passar.
3. **REFACTOR** — limpar regex/AST, garantir zero falso-positivo nas fixtures boas.
4. Só então escrever a **prosa** `std-odoo-<id>.md` (Princípios + Anti-patterns + Linter + Referência com as URLs oficiais).

Stds Tier 3 com `weakStandardWarning:true`: teste cobre os poucos checks literais; o resto é documentado como human-review.

Wiring (Lote 0) também é TDD: teste de `detect-framework` afirmando que `frameworkContributions` devolve os 17 standards + 3 stacks para um fixture com `__manifest__.py`.

---

## 7. Faseamento em lotes (commit por lote)

| Lote | Conteúdo | Gate de saída |
|---|---|---|
| **0 — Wiring** | detect-framework (+standards/+stacks) + testes; chaves no `profiles/odoo.yaml`; passo de cópia em project-init/context-sync; MANIFEST profile | testes de wiring verdes; `node detect-framework.mjs <fixture>` lista 17+3 |
| **1 — Tier1 backend** | #1,2,3,4,5,6,7 (test→linter→prosa cada) | 7 linters verdes; `devflow standards audit` S1–S6 sem FAIL |
| **2 — Tier1 front/test** | #8,9,10 | 3 linters verdes; audit ok |
| **3 — Tier2** | #11,12,13,14 | 4 linters verdes (parciais, falso-positivo controlado nas fixtures) |
| **4 — Tier3 NXZ** | #15,16,17 (`weakStandardWarning:true`) | testes dos checks literais verdes |
| **5 — Stacks + ADR + docs** | wishlist no manifest do projeto-fixture; **evolve ADR-007 → v2.3.0** (minor: lib default inclui sets profile-scoped); doc de uso; invocar scrape p/ store global (12/17/18) | `devflow stacks validate` ok; ADR audit ok |

Cada lote: `git add` **só** dos arquivos do lote (não tocar nos `M`/`??` pré-existentes do working tree) + commit `feat(std): ...`. Sem push/merge/PR sem autorização explícita (guardrail de git).

---

## 8. Registro arquitetural

**Evolve ADR-007 → v2.3.0 (minor, estende):** a biblioteca de standards default passa a comportar **sets profile-scoped** (ativados por detecção de framework), além do set universal. Invariante anti-RCE inalterada (`.js` bundled-only). Alternativa rejeitada: nova ADR autônoma (fragmentaria a decisão de "default standards library"). Decisão a confirmar na execução do Lote 5.

---

## 9. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Linter Odoo gera falso-positivo em projeto não-Odoo | Profile-scoped: só copiado quando `__manifest__.py`/`__openerp__.py` detectado (D1) |
| Regex de `version-api-hygiene` anacrônico (símbolo válido em 12, removido em 18) | Linter parametrizado por série quando possível; senão documentar como version-aware e cobrir só símbolos removidos em TODAS as versões alvo |
| xml-id `_` vs `__` diverge 12↔17/18 | Regra version-aware; fixture cobre ambos; não falhar padrão legado em projeto 12 |
| 3 versões Odoo numa só chave de manifest | Chaves distintas `odoo-12/17/18` + `discoveryHints` por versão (D2) |
| Cópia profile sobrescreve std customizado do projeto | context-sync não sobrescreve; respeita `standards.local.yaml disable:` |
| Falso-positivo em Tier 2/3 (heurístico) | `weakStandardWarning` onde aplicável; fixtures boas no teste travam regressão |

---

## 10. Critérios de aceitação

- [ ] 17 `std-odoo-*.md` + 17 `machine/*.js` + 17 `*.test.mjs`, todos os testes verdes.
- [ ] `assets/standards/` universal **inalterado** (nenhum std Odoo no topo).
- [ ] `detect-framework` devolve standards+stacks; project-init/context-sync copiam só em projeto Odoo.
- [ ] `profiles/odoo.yaml` com `standards` (17) e `stacks` (3).
- [ ] Manifest de stacks de um projeto-fixture Odoo recebe `odoo-12/17/18` `mcpIndexed`.
- [ ] ADR-007 evoluída para v2.3.0 (ou nova ADR, conforme Lote 5).
- [ ] Tudo em pt-BR; nenhuma fonte inventada (cada std cita URL oficial ou marca origem NXZ).
- [ ] Working tree pré-existente (`M`/`??`) intocado; commits só dos arquivos de cada lote.
