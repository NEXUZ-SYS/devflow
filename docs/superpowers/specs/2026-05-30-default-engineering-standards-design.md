# Design — Biblioteca de Standards Default de Engenharia

> **Workflow DevFlow:** default-engineering-standards-library · **Escala:** MEDIUM · **Fase:** P (Design)
> **Data:** 2026-05-30 · **Branch:** `feat/default-engineering-standards` · **Idioma:** pt-BR
> **Origem:** análise de `framework_ddc/.contexts/engineering/` (18 rules + 8 contracts genéricas) cruzada com o subsistema de Standards do DevFlow (ADR-002 triple-layer, taxonomia de concerns, standards-loader, run-linter SI-4).

---

## 1. Contexto e problema

O DevFlow tem o **mecanismo** de Standards (ADR-002: triple-layer markdown + frontmatter + linter; `standards-builder`; taxonomia de 11 concerns; `standards-loader`; `run-linter` SI-4) — mas **não shippa nenhum `std-*.md` default**. Hoje cada projeto começa do zero: a taxonomia é só um catálogo do que *pode* ser gerado sob demanda.

As 18 rules (`security, validation, error-handling, observability, performance, testing, caching, migration, data-modeling, accessibility, internationalization, state-management, documentation, code-review, api-design, development, governance, grounding`) + 8 contracts (`api, events, schemas, secrets, postgres, pgvector, bigquery, firebase-firestore`) do framework DDC são **guardrails genéricos** que se aplicam à maioria dos projetos. O usuário quer shippá-los como **biblioteca default sempre disponível**, com o filtro just-in-time selecionando só os necessários no momento da definição da task.

### Objetivo

Entregar uma biblioteca curada de standards default de engenharia, mantida ao vivo num repo standalone, sempre disponível nos projetos via snapshot vendorizado no plugin, carregada just-in-time pelo motor existente (`applyTo` + filtro por task), com override por projeto (eject) — sem quebrar o install do plugin, sem complicar o SI-4, respeitando ADR-002 (concern-first).

---

## 2. Decisões (resolvidas no brainstorming)

| # | Decisão | Escolha |
|---|---|---|
| D1 | Bundling / sempre-carregar | **Repo standalone + fetch https no `/devflow update`** (à la napkin) + snapshot vendorizado em `<plugin>/assets/standards/`. NÃO git submodule (quebra o install do plugin). |
| D2 | Escopo da biblioteca | **Tiered:** ~16 universais + 4 condicionais; contracts DB-específicos **excluídos** (→ subsistema de stacks). |
| D3 | Enforcement | Defaults **warn-only** (`enforcement.linter: null`); linter executável **opt-in por projeto**. |
| D4 | Override por projeto | **Eject-to-customize** + override por `id` + `disable:` em `standards.local.yaml`. |

### Por que não git submodule (D1)

1. O install via marketplace (`claude plugin install`) busca um **snapshot** da tag, **não** faz `git clone --recursive` → um submodule chegaria **vazio** no cache instalado.
2. Submodule **fixa um commit** — o oposto de "manutenção ao vivo".
3. Introduz dependência de git/rede no runtime, contra a regra dep-free/local do DevFlow.
4. Desacopla a versão dos defaults da versão do plugin (ambiguidade).

O DevFlow **já tem** o padrão certo: `update-external-skill.sh` busca o napkin de `raw.githubusercontent.com/blader/napkin` via https no `/devflow update`. Reusamos esse mecanismo.

---

## 3. Arquitetura

```
NEXUZ-SYS/devflow-standards            ← repo standalone (fonte viva, contribuível)
  std-security.md  std-runtime-validation.md  ... (~20)

<plugin>/assets/standards/             ← snapshot vendorizado (offline/reprodutível por versão do plugin)
  std-*.md

<projeto>/.context/engineering/standards/   ← vazio por padrão
  std-<id>.md                          ← overrides/ejects (origin: project)
  machine/std-<id>.js                  ← linters opt-in do projeto
  standards.local.yaml                 ← disable: [<id>], extensões
```

**Loader (duas fontes, projeto vence por `id`):**
```js
const defaults = readStandards(`${pluginRoot}/assets/standards`);   // origin: "default"
const project  = readStandards(contextPaths(root).standards);       // origin: "project"
const disabled = readDisableList(root);                              // standards.local.yaml
const byId = new Map();
for (const s of defaults) if (!disabled.has(s.id)) byId.set(s.id, { ...s, origin: "default" });
for (const s of project)  byId.set(s.id, { ...s, origin: "project" });  // sobrescreve
```

---

## 4. Escopo da biblioteca (D2 — tiered)

### Universal (~16, sempre na lib, `applyTo` broad — filtrado por task)
`std-security`, `std-runtime-validation`, `std-error-handling`, `std-test-discipline`, `std-observability`, `std-performance`, `std-documentation`, `std-code-review`, `std-grounding`, `std-naming-conventions`, `std-migration`, `std-data-modeling`, `std-api-conventions`, `std-secret-conventions`, `std-schemas`, `std-commit-hygiene`.

### Condicional (4, na lib, `applyTo` estreito — ativa quando o path/stack bate)
`std-accessibility` (UI/web), `std-internationalization`, `std-caching`, `std-state-management`.

### Excluído dos defaults
Contracts DB-específicos: `postgres`, `pgvector`, `bigquery`, `firebase-firestore`. São doutrina de um stack, não guardrail universal — pertencem ao subsistema de **stacks** (`scrape-stack-batch`) / gerados quando o DB é detectado. Misturá-los injetaria doutrina de Postgres num projeto Firebase.

**Naming:** todos concern-first (`std-<concern>`), nunca lib-centric (ADR-002 / audit S7). Os concerns que já existem na taxonomia (runtime-validation, error-handling, test-discipline, observability-spans, naming-conventions, api-conventions, secret-conventions, commit-hygiene) reusam o id; os novos (security, performance, documentation, code-review, grounding, migration, data-modeling, schemas, accessibility, i18n, caching, state-management) entram como entradas de taxonomia + std default.

---

## 5. Enforcement (D3 — warn-only)

Cada default tem `enforcement.linter: null`, `source: devflow-default`, `weakStandardWarning: true`. São **guidance** (prosa imperativa + anti-patterns), injetados como contexto Stage-2 — não executam linter. Isso:
- Evita complicar o **SI-4** (que confina linters em `<root>/.context/engineering/standards/machine/`; um linter bundlado no plugin exigiria estender o allowlist — fora de escopo).
- Casa com a natureza das rules DDC (são guidance, não código).

**Linter executável = opt-in por projeto:** ao fazer `eject` de um default (ou autorar um std), o time adiciona `machine/std-<id>.js` no próprio projeto (path já permitido pelo SI-4) e seta `enforcement.linter`.

---

## 6. Carregamento just-in-time (reusa o motor existente)

- **Stage-1 (SessionStart):** os defaults entram no índice de standards disponíveis (1 linha/std: id, description, origin, applyTo).
- **Stage-2 (PreToolUse / PREVC Planning):** ao definir/editar, o filtro por `applyTo` + relevância de task injeta só os corpos relevantes. Editou `README.md` → nenhum bate → nada. Editou `src/api/orders.ts` → security/validation/api-conventions.
- Sem novo mecanismo: estende o `standards-loader` (2 fontes) e o filtro já existente.

---

## 7. Override (D4)

- `/devflow standards eject <id>` — copia `<plugin>/assets/standards/std-<id>.md` → `.context/engineering/standards/std-<id>.md`. Vira `origin: project`, editável; opcionalmente adiciona linter em `machine/`.
- **Override por id:** criar `.context/engineering/standards/std-<id>.md` com o mesmo `id` → loader usa o do projeto.
- **Desligar:** `.context/standards.local.yaml` com `disable: [std-<id>]`.

---

## 8. Update ao vivo (D1)

`/devflow update` ganha **Step 4d — refresh dos standards default**:
```bash
bash "<plugin>/scripts/update-external-skill.sh" \
  standards "https://raw.githubusercontent.com/NEXUZ-SYS/devflow-standards/main" <lista-de-std>
```
Mesmo mecanismo do napkin (fetch https, atômico, fail-safe silencioso). Atualiza o snapshot em `assets/standards/` sem esperar release do plugin. Offline continua funcionando (snapshot vendorizado).

> Nota: `update-external-skill.sh` hoje atualiza um dir de skill; precisa generalizar para aceitar um dir-alvo de standards (ou um script irmão `update-default-standards.sh`). Detalhe de implementação no plano.

---

## 9. Componentes a construir (TDD, `node:*` only)

| Componente | Tipo | Papel |
|---|---|---|
| repo `devflow-standards` (conteúdo: ~20 `std-*.md`) | conteúdo | portar rules/contracts DDC genéricas → concern-first, warn-only |
| `<plugin>/assets/standards/` (snapshot) | assets | defaults vendorizados |
| `scripts/lib/standards-loader.mjs` (estender) | lib | merge 2 fontes + `origin` + `disable` (standards.local.yaml) |
| expansão `taxonomy-of-concerns.yaml` | dados | concerns novos (security, performance, documentation, grounding, migration, data-modeling, schemas, accessibility, i18n, caching, state-management, code-review) |
| `skills/standards-builder/SKILL.md` (modo EJECT) | skill | `/devflow standards eject <id>` |
| `commands/devflow.md` Step 4d + `update-external-skill.sh` (generalizar) | comando | fetch dos defaults no update |
| wiring Stage-1/Stage-2 (defaults no índice) | hooks | já existe; só incluir `origin: default` |
| ADR-007 | ADR | decisão: defaults plugin-bundled via fetch, warn-only, eject |

**Modificações:** `standards-loader.mjs`, `taxonomy-of-concerns.yaml`, `standards-builder/SKILL.md`, `commands/devflow.md`, `scripts/update-external-skill.sh` (ou irmão), `project-init` (mencionar defaults disponíveis), README/CHANGELOG.

---

## 10. Invariantes

1. **Concern-first** (ADR-002): nenhum default lib-centric; audit S7 deve passar.
2. **Warn-only respeita SI-4**: zero linter executável bundlado no plugin; linters só no `machine/` do projeto.
3. **dotcontext intocado** (docs/agents/skills/plans).
4. **Offline-safe:** snapshot vendorizado garante funcionamento sem rede; o fetch é refresh opt-in.
5. **TDD** (RED→GREEN); testes reais; pt-BR; branch única; 1 PR.
6. **Sem git submodule** (quebra o install do plugin).

---

## 11. Fora de escopo

- Contracts DB-específicos como defaults (vão pro subsistema de stacks).
- Linters executáveis bundlados no plugin + extensão do SI-4 (follow-up, se um dia quiser defaults enforçáveis centralmente).
- Popular as camadas business/product/operations (outro trabalho).
- Criar o conteúdo final das ~20 prosas com qualidade de produção — o plano scaffolda a estrutura + porta o essencial das rules DDC; refino editorial é incremental.

---

## 12. Estratégia de testes

| Componente | Teste |
|---|---|
| `standards-loader` (2 fontes) | unit — default+project merge, override por id, disable, origin tag (fixtures tmpdir) |
| escopo/naming | unit — todos os defaults são concern-first (audit S7 PASS), frontmatter completo, `linter: null` |
| eject | integração — `eject std-x` copia para o projeto, vira origin:project (tmpdir) |
| update Step 4d | integração — fetch mockado (https) atualiza snapshot; offline = no-op fail-safe |
| filtro por task | shell — editar `src/**/*.ts` injeta os relevantes; `README.md` injeta nada |
| ADR-007 | adr-audit PASSED |

---

## 13. Próximo passo

Após aprovação do spec → ADR opportunity check (provável ADR-007) → `superpowers:writing-plans` → handoff dotcontext → gate P→R. Execução pelo trilho PREVC.
