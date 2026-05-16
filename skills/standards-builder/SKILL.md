---
name: standards-builder
description: "Use when the user asks to create, refine, audit, or migrate Standards (`.context/standards/std-X.md`) — operational conventions backed by a linter. Trigger words: 'crie/criar standard', 'gerar standard', 'std para <concern>', 'standard cross-cutting', 'consolidar standards', 'audita standard', 'migra std lib-centric', 'standards-builder'. Also trigger when devflow:adr-builder Step 5e emits a CREATE recommendation. Five modes: FROM-CONCERN (default — generate an operational std from the concern taxonomy, optionally enriched with ADR guardrails), FROM-CONCERN+ENRICH, MIGRATE (lib-centric std → concern std), AUDIT (S1-S7 gate), FROM-ADR (legacy lib-centric path — emits warning, discouraged)."
version: 0.2.0
deps:
  internal:
    - "scripts/devflow-standards.mjs"
    - "scripts/lib/taxonomy-loader.mjs"
    - "scripts/lib/concern-resolver.mjs"
    - "scripts/lib/standard-from-concern.mjs"
    - "scripts/lib/standard-enrich.mjs"
    - "scripts/lib/standards-search.mjs"
    - "scripts/lib/standard-audit.mjs"
    - "skills/standards-builder/references/taxonomy-of-concerns.yaml"
trigger_phrases:
  - "crie standard"
  - "criar standard"
  - "gerar standard"
  - "std para"
  - "standard cross-cutting"
  - "standard para concern"
  - "consolidar standards"
  - "audita standard"
  - "migra std"
  - "migrar standard"
  - "standards-builder"
  - "devflow standards new"
---

# Standards Builder — DevFlow Edition (concern-first)

Creates, polishes, audits, and migrates Standards in `.context/standards/`. A Standard is a triple-layer artifact: prose for humans + frontmatter for tooling + linter (`machine/std-X.js`) for CI enforcement.

**Core model** — a Standard describes an **operational concern** (an imperative rule: "validate X at the boundary", "never propagate Y"), NOT a library. An ADR records a **technology decision** ("Zod chosen over Yup because…"). The two reference each other but have independent lifecycles:

- A std can exist with **zero ADRs** — it is a cross-cutting rule (`std-error-handling`, `std-naming-conventions`).
- An ADR feeds a std only its `## Guardrails` and `## Enforcement` (raw input for the `## Linter` section). The ADR's `## Decisão` / `## Contexto` / `## Alternativas` NEVER leak into a std.
- Standards are named after concerns (`std-runtime-validation`), never libraries (`std-zod` is lib-centric — audit S7 flags it).

**Announce at start:** "Invocando `devflow:standards-builder` em modo <FROM-CONCERN|MIGRATE|AUDIT|FROM-ADR-LEGADO>."

---

## Step 0 — Detect mode

Detect in cascade — do not ask if the signal is clear:

| Trigger | Modo |
|---|---|
| `"crie std para <concern>"`, `--concern=<id>`, or a cross-cutting concern in prose | **from-concern** ← default |
| `--concern=<id> --enrich-from-adr=<csv>` or user says "puxe os guardrails da ADR-N" | **from-concern + enrich** |
| `"migra std-<lib>"`, `--migrate=<lib-std-id>` | **migrate** |
| `"audita std-X"`, `--audit`, "está incompleto?" | **audit** |
| `--from-adr=<csv>` without `--concern`, or "std a partir da ADR-N" | **from-adr (LEGADO)** — emits warning, see below |
| ambiguity | ask via prosa with the 5 options |

**Routing:**
- `from-concern` / `from-concern + enrich` → Step 1
- `migrate` → Step M1
- `audit` → Step A1
- `from-adr (legado)` → Step L1

---

## FROM-CONCERN mode (Steps 1-6)

### Step 1 — Resolve concern

The user names a concern in prose ("validação runtime na borda") or as an id (`runtime-validation`). The CLI resolves it via `concern-resolver.mjs` against `references/taxonomy-of-concerns.yaml`:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/devflow-standards.mjs new --concern="<input>" --project=<path>
```

Resolver outcomes:
- **auto-confirmed** (score ≥ 0.75, clear gap) → CLI proceeds.
- **ambiguous** → CLI lists top-3 candidates and exits 1. Present them in prosa; ask the user to pick an exact id.
- **no-match** → CLI lists all concern ids and exits 1. Offer: (a) pick from the list, (b) register a new concern in `.context/standards/concerns.local.yaml`.

The concern id becomes the std id: `std-<concern-id>`. Camada suffixes do NOT apply — concerns are camada-agnostic.

### Step 2 — Optional enrich (only if user wants ADR guardrails)

If the user wants the std's `## Linter` section seeded with an ADR's enforcement, use `--enrich-from-adr=<csv>`:

1. Optionally run `devflow standards search --by-concern=<id>` to discover ADRs whose stack/category matches the concern.
2. **Ask the user** to confirm which ADRs are valid input — do not assume.
3. The CLI calls `standard-enrich.mjs`, which extracts ONLY `## Guardrails` and `## Enforcement` bullets. `## Decisão` / `## Contexto` / `## Alternativas` are never read.
4. Extracted enforcement bullets feed the std's `## Linter` section; the ADR slugs populate `relatedAdrs`.

If the user does not ask for enrichment, skip Step 2 — a stand-alone concern std is valid by design.

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/devflow-standards.mjs new --concern=<id> --enrich-from-adr=<csv> --project=<path>
```

### Step 3 — Baseline generated by CLI

The CLI invokes `standard-from-concern.mjs`. The baseline std has:
- Frontmatter: `id`, `description` (concern summary), `applyTo` (concern `defaultApplyTo`), `relatedAdrs` (from enrich, else `[]`), `enforcement.linter`, `weakStandardWarning: true`.
- `## Princípios` from the concern's `principleTemplate` (operational prose — never ADR `Decisão`).
- `## Anti-patterns` table from the concern's `antiPatternTemplate` (rule/correct pairs).
- `## Linter` from `linterHints` + enrichment enforcement bullets.
- `## Referência` listing `relatedAdrs` (or "sem ADR de origem").
- A linter stub at `machine/std-<id>.js`.

**Critical**: nothing is copied verbatim from ADRs. Enrichment feeds only `## Linter` and `## Referência`.

### Step 4 — LLM polish (optional but recommended)

Read the baseline std + (if enriched) the source ADRs. Improve:

- **a) Princípios placeholders** — fill `{{boundaryList}}` / `{{lib}}` with the project's concrete vocabulary (read `.context/stacks/refs/` or infer from the enriched ADRs). If stand-alone (no enrich), a generic boundary list is acceptable.
- **b) Anti-patterns tone** — adapt wording to project vocabulary. Do NOT invent new rules — only polish what the taxonomy provided.
- **c) Linter section** — rewrite `linterHints` + raw enforcement bullets into concrete, numbered checks. Identify which are statically lintable (→ `machine/std-<id>.js`) vs. which need human code review.
- **d) Fontes oficiais** — add only if `.context/stacks/refs/` has matching entries. Never invent sources.

**NÃO violar:**
- Não adicionar guardrails ou fontes que não vieram da taxonomia ou das ADRs enriquecidas.
- Manter `weakStandardWarning: true` enquanto `machine/std-<id>.js` for stub.
- Manter `relatedAdrs` exatamente como o CLI gerou.

### Step 5 — Audit gate + commit

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/devflow-standards.mjs audit <id> --project=<path>
```

7 checks (S1-S7). Gate is `PASSED` when S1-S6 have no FAIL. **S7 (concern alignment)** should be `PASS` for a concern-based std — if S7 WARNs, the id matches a known library and you generated a lib-centric std by mistake; restart from Step 1 with a concern id.

Commit:
```bash
git add .context/standards/std-<id>.md .context/standards/machine/std-<id>.js
git commit -m "feat(std): add std-<id> [enriched from <adrs>] — <concern summary>"
```

### Step 6 — Reverse-link (only if enriched)

If the std was enriched from ADRs, offer to add `relatedStandards: [<concern-id>]` to those ADRs' frontmatter so `search --by-concern` finds them later. Confirm with the user before editing any ADR.

---

## MIGRATE mode (Steps M1-M3) — lib-centric std → concern std

### Step M1 — Identify

User invokes `"migra std-<lib>"` or `--migrate=<lib-std-id>`. Confirm the target std is lib-centric (audit S7 = WARN is the signal).

### Step M2 — Run the CLI

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/devflow-standards.mjs new --migrate=<lib> --project=<path> [--target-concern=<id>] [--keep-old]
```

The CLI:
- Resolves the target concern via `inverseHints` (or `--target-concern`).
- **CREATE** path (concern std absent): generates `std-<concern>` enriched from the old std's `relatedAdrs`.
- **INJECT** path (concern std exists): merges `relatedAdrs`. The CLI does only the merge — you (the skill) must review whether the old std's guardrails/enforcement need injecting into the concern std's `## Anti-patterns`/`## Linter`. Do that as a manual polish pass (Step 4 discipline).
- Deprecates the old std: renames to `std-<lib>.deprecated.md` with `deprecated: true` + `supersededBy` frontmatter (or `--keep-old` marks in place).
- Idempotent: no-op if already migrated.

### Step M3 — Audit + commit

Audit the new concern std (S7 must PASS). Commit both changes together:
```bash
git commit -m "chore(std): migrate std-<lib> → std-<concern>"
```

---

## AUDIT mode (Steps A1-A3) — inline, no PREVC workflow

### Step A1 — Resolve target

Accept `<id>` (with or without `std-` prefix) or full path.

### Step A2 — Run audit

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/devflow-standards.mjs audit <id> --project=<path>
```

7 deterministic checks:
- **S1** Frontmatter complete · **S2** No scaffold placeholders · **S3** Linter file exists
- **S4** relatedAdrs cross-reference real ADRs · **S5** applyTo passes SI-5 subset
- **S6** stack-refs completeness · **S7** concern alignment (WARN if lib-centric)

### Step A3 — Present + recommend

**If PASSED** (no FAIL): report. If S7 WARNs, suggest `devflow standards new --migrate=<lib>`.
**If BLOCKED** (≥1 FAIL): show the failures + diagnosis. Offer: (a) re-derive, (b) manual edit, (c) report-only.

---

## FROM-ADR mode (Step L1) — LEGADO, desencorajado

This path still works for backward compatibility but is **discouraged** — it produces lib-centric standards.

### Step L1

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/devflow-standards.mjs new <id> --from-adr=<csv> --project=<path>
```

The CLI emits a stderr warning suggesting the canonical operational concern (via `inverseHints`), logs the invocation to `.context/standards/.legacy-from-adr.log`, and pauses 3s (skip with `--yes`).

**Announce:** "Invocando standards-builder em modo from-adr [LEGADO] — considere `--concern` para o caminho preferido."

After commit, recommend (do not force): "Este std-X é lib-centric. Quer migrar para um concern std agora com `/devflow standards migrate X`?"

---

## Hard rules

1. **FROM-CONCERN é o default.** Standards descrevem concerns operacionais, não libs. Um std sem ADR é normal e correto (concern cross-cutting).
2. **FROM-ADR é legado.** Emite warning e é desencorajado. Use `--migrate` para transicionar stds lib-centric existentes.
3. **ADR alimenta apenas `## Linter` e `## Referência`.** `## Decisão`/`## Contexto`/`## Alternativas` da ADR NUNCA entram num std. `## Princípios` vem da taxonomia.
4. **`weakStandardWarning: true` é o estado correto** enquanto `machine/std-<id>.js` é stub. Só remova quando humano implementar regras reais.
5. **Step 4 polish é OPCIONAL.** Se o usuário disser "rápido, sem polish", pule para Step 5 (audit) e commit.
6. **NUNCA inventar guardrails, anti-patterns ou fontes.** Step 4 só pole o que a taxonomia/ADRs forneceram. Conteúdo novo precisa de nova entrada na taxonomia (`concerns.local.yaml`) ou nova ADR.
7. **S7 WARN num std novo = erro de processo.** Significa que você gerou um std lib-centric. Reinicie do Step 1 com um concern id.
8. **NUNCA editar `references/taxonomy-of-concerns.yaml`** durante um flow de criação — extensões de projeto vão para `.context/standards/concerns.local.yaml`.

---

## Examples

### FROM-CONCERN (stand-alone, sem ADR)

User: "Crie um standard para tratamento de erros"

1. Step 1: `devflow standards new --concern="tratamento de erros"` → resolver auto-confirma `error-handling`.
2. Step 3: CLI gera `std-error-handling.md` (`relatedAdrs: []`) + linter stub.
3. Step 4: polish — ajusta tom dos anti-patterns ao vocabulário do projeto.
4. Step 5: audit → PASSED (S7 PASS, id é concern). Commit.

### FROM-CONCERN + enrich

User: "Crie std de validação runtime puxando os guardrails da ADR-009 (Zod)"

1. Step 1: resolver → `runtime-validation`.
2. Step 2: confirma ADR-009 como insumo; CLI extrai Guardrails + Enforcement.
3. Step 3: CLI gera `std-runtime-validation.md` com `relatedAdrs: [adr-zod-frontend]`, `## Linter` seedado.
4. Step 4-5: polish + audit PASSED. Commit `feat(std): add std-runtime-validation enriched from adr-zod-frontend`.
5. Step 6: oferece reverse-link `relatedStandards` na ADR-009.

### MIGRATE

User: "Migra o std-zod para concern"

1. Step M2: `devflow standards new --migrate=zod` → CLI cria `std-runtime-validation` (enriquecido dos ADRs de std-zod), deprecia `std-zod` → `std-zod.deprecated.md`.
2. Skill revisa se guardrails do std-zod antigo precisam de INJECT manual.
3. Step M3: audit PASSED. Commit `chore(std): migrate std-zod → std-runtime-validation`.

### AUDIT

User: "Audita std-zod"

1. `devflow standards audit zod` → S7 WARN (lib-centric).
2. Reporta + sugere `devflow standards new --migrate=zod`.

---

## Reference files

- `references/taxonomy-of-concerns.yaml` — catálogo curado de concerns operacionais (~30 entries; projeto estende via `.context/standards/concerns.local.yaml`).
