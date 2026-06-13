# Correção dos gaps de cobertura de Standards — Design

> **DevFlow workflow:** fix-standards-coverage-gaps | **Scale:** MEDIUM→LARGE (abrangente) | **Phase:** P
> **Data:** 2026-06-12
> **Spec-fonte (análise):** `docs/research/standards-coverage-gap.md`
> **Branch:** `feature/standards-coverage-gap-doc`

## Objetivo

Corrigir os três eixos de gap de cobertura de Standards identificados na pesquisa: gerar os Standards
que a própria taxonomy já define mas nunca foram criados (Eixo A), registrar os concerns lintáveis
ausentes da taxonomy (Eixo B), e rotear o enforcement dos 8 Standards sem linter pelo veículo correto
(Eixo C). Resultado: a `taxonomy-of-concerns.yaml` vira fonte única de verdade e cada Standard tem um
veículo de enforcement explícito (file-linter, hook, CI, ou `linter: null` consciente e documentado).

## Constraints duras (ADRs)

- **ADR-007 v2.2.0:** `machine/*.js` são **bundled-only (TCB)** — nunca fetchados em runtime; sincronizados
  plugin↔standalone só no release com `diff -r` byte-match + revisão humana (anti-RCE). Só os `.md` vão
  via fetch para `${BASE_URL}/.context/engineering/standards/`. As 5 verificações SI-4 + sanitização SI-6
  permanecem intocadas.
- **ADR-008:** concerns universais ficam em `assets/standards/` (root); perfis em `profiles/<fw>/`.
  Manter o trio `MANIFEST.txt ↔ .md ↔ id` sincronizado; sem órfãos. Standards concern-framed (nunca
  por módulo).
- **ADR-002:** triple-layer de Standards preservado.

## Contrato do linter (SI-4)

`node machine/std-X.js <filePath>` → lê o arquivo → violação imprime `VIOLATION: <regra> (<file>) — <fix>`
+ `exit 1`; caso contrário `exit 0`. Arg ausente / arquivo ilegível → `exit 0` (sem falso positivo).
Filosofia **conservadora**: 1–3 regex de alta confiança por linter, não o std inteiro.

## Padrão de teste (TDD obrigatório)

Molde: `tests/odoo-standards/std-odoo-*.test.mjs` — `node:test`, `execFileSync` no linter, fixtures
em `mkdtempSync(tmpdir())`, casos BAD (exit 1 + VIOLATION) e GOOD (exit 0) + gate de path (ignora
extensão fora do `applyTo`). Testes novos em `tests/standards/`. **RED→GREEN:** teste que falha antes
do `.js`. Existe um WIP RED reaproveitável para `layer-boundaries`:
`tests/2026-05-11/.context/standards/machine/std-feature-sliced-design.test.mjs` (190 linhas).

## Arquitetura — 4 fases sequenciadas (camadas horizontais, ordem de dependência)

### Fase 1 — Consolidação da taxonomy (Eixo B + órfão)
Editar `skills/standards-builder/references/taxonomy-of-concerns.yaml`:
- Adicionar concerns: `module-size`/`code-complexity` (fonte `practices/ai-friendly-code.md`,
  `clean-code.md`), `environment-config` (fonte `processes/environments.md`), `git-workflow`
  (fonte `processes/git.md`) — cada um com `principleTemplate`, `antiPatternTemplate`, `linterHints`,
  `relatedAdrCategories`.
- Registrar `typescript-strict` (órfão: tem std+linter, sem entry; `relatedAdrs: ["007-..."]`).
- **Teste de consistência novo** (`tests/standards/taxonomy-consistency.test.mjs`): todo concern com
  `linter` declarado tem `.md` + `machine/.js`; todo `.md` está no `MANIFEST.txt`; sem órfãos (enforça
  ADR-008). Aceita `linter: null` consciente (Eixo C).

### Fase 2 — Gerar os Standards faltantes (Eixo A)
Via `devflow:standards-builder` FROM-CONCERN (os 3 já estão na taxonomy):
- `std-layer-boundaries.md` (fonte `architecture/{fsd,hexagonal,clean-architecture,ddd}.md`)
- `std-domain-events.md` (fonte `contracts/events.md`)
- `std-pre-commit-hygiene.md` (fonte `processes/git.md` + tooling)
- Atualizar `MANIFEST.txt` (+3).

### Fase 3 — Roteamento de enforcement (Eixo C + linters do Eixo A) — tudo TDD
**File-linters** (`machine/std-X.js`, teste RED primeiro):
- `std-internationalization.js` (~40%): `count === 1`; moeda concatenada; `toLocale*()` sem locale;
  `margin-left/right`.
- `std-accessibility.js` (~30%): `<div|span onClick>`; `tabIndex` positivo; `<img>` sem `alt`.
- `std-documentation.js` (estreito): `TODO|FIXME|HACK` sem issue/dono.
- `std-layer-boundaries.js` (reaproveita WIP FSD test): import cross-slice/upward; import de path
  interno entre features.
- `std-domain-events.js`: evento publicado sem `version`; nome sem sufixo de fato ocorrido.
- `std-pre-commit-hygiene.js`: ausência de `.husky/`/`lefthook.yml`/`.pre-commit-config.yaml` (gate
  de projeto, não de arquivo — avaliar como check de repo).

**Hook** (não file-linter): `commit-msg` (commitlint) para `commit-hygiene` — referenciar/portar o
`guard-conventional-commit` existente do framework_ddc.

**CI/Danger** (PR-level): ruleset para `code-review` (tamanho de diff, presença de testes, gate de
secret, label `ai-generated`).

**`linter: null` consciente** (documentar no frontmatter + comentário): `state-management`
(→ ESLint `react/no-direct-mutation-state` + AST), `caching` (→ code-review + convenção de chave),
`grounding` (→ doc-grounding hook + `tsc --noEmit`/`ts-prune`).

### Fase 4 — Sync & release
- Push dos `.md` novos/alterados → `NEXUZ-SYS/devflow-standards` em `.context/engineering/standards/`
  (evita reversão no `/devflow update` Step 4d).
- Sync byte-match dos `machine/*.js` novos plugin↔standalone (`diff -r` + revisão humana, ADR-007).
- Version bump (auto-bump em commits de skills/; os 3 version files).

## Componentes e fronteiras

| Unidade | Responsabilidade | Depende de |
|---|---|---|
| `taxonomy-of-concerns.yaml` | catálogo de concerns (fonte única) | docs engineering |
| `assets/standards/std-*.md` | doutrina operacional por concern | taxonomy |
| `assets/standards/machine/std-*.js` | enforcement mecânico SI-4 | std-*.md |
| `tests/standards/*.test.mjs` | RED→GREEN dos linters + consistência | machine/*.js, MANIFEST |
| `MANIFEST.txt` | lista trusted de `.md` p/ fetch | std-*.md |
| hook `commit-msg` + Danger/CI | enforcement não-file-level | — |

## Testes

- **Unit (linter):** cada linter novo contra fixtures BAD/GOOD + gate de path.
- **Consistência:** taxonomy ↔ `.md` ↔ `MANIFEST.txt` ↔ `machine/.js` sem órfãos.
- **Regressão:** suíte de standards existente continua verde.
- Sem mutação de dirs versionados (fixtures em tmpdir — ver incidente do linter FSD).

## Fora de escopo (YAGNI)

- Reescrever os 8 stds de baixa fidelidade do Eixo de fidelidade (§3 da pesquisa) — é outro trabalho.
- Linters para `state-management`/`caching`/`grounding` (ficam `null` conscientes).
- Stacks/architecture narrativo/practices metodológico (alimentam knowledge/docs-mcp, não Standards).

## Critério de sucesso

1. `taxonomy-of-concerns.yaml` contém todos os concerns com std no disco (sem órfãos nos dois sentidos).
2. Os 3 Standards do Eixo A existem com `.md` + entrada no MANIFEST + linter (onde aplicável) testado.
3. Cada um dos 8 stds-sem-linter tem veículo de enforcement explícito (linter testado, hook, CI, ou
   `linter: null` documentado com a razão).
4. Suíte de testes verde; `.md` sincronizados ao standalone; `.js` com plano de sync byte-match no release.
