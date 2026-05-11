---
name: standards-builder
description: "Use when the user asks to create, refine, or audit Standards (`.context/standards/std-X.md`) — coding/operational conventions backed by a linter and cross-referenced to ADRs. Trigger words: 'crie/criar standard', 'gerar standard', 'standard a partir da ADR', 'consolidar standards', 'audita standard', 'standards-builder'. Also trigger when devflow:adr-builder Step 5d emits a CREATE recommendation and the user wants to materialize it. Three modes: FROM-ADR (deterministic CLI extraction + LLM polish; produces audit-PASSED standard from 1+ ADRs in seconds — no TODO scaffolds), CONSOLIDATE (multi-ADR same lib across camadas → one standard with widened applyTo), AUDIT (S1-S5 gate via standard-audit.mjs lib)."
version: 0.1.0
deps:
  internal:
    - "scripts/devflow-standards.mjs"
    - "scripts/lib/standard-from-adr.mjs"
    - "scripts/lib/standard-audit.mjs"
    - "scripts/lib/adr-chain.mjs"
trigger_phrases:
  - "crie standard"
  - "criar standard"
  - "gerar standard"
  - "standard a partir"
  - "consolidar standards"
  - "audita standard"
  - "standards-builder"
  - "devflow standards new"
---

# Standards Builder — DevFlow Edition

Creates, polishes, and audits Standards in `.context/standards/`. A Standard is a triple-layer artifact: prose for humans + frontmatter for tooling + linter (`machine/std-X.js`) for CI enforcement. Standards derive from ADRs — their guardrails become anti-patterns, their enforcement checkboxes become linter rules.

**Critical constraint** (why this skill exists): the bare CLI `devflow standards new <id>` produces a SCAFFOLD with TODO markers. That scaffold fails the audit (S2 detects placeholders). This skill avoids scaffold output by always deriving from at least one ADR.

**Announce at start:** "Invocando `devflow:standards-builder` em modo <FROM-ADR|CONSOLIDATE|AUDIT>."

---

## Step 0 — Detect mode (from-adr | consolidate | audit)

Detect in cascade — do not ask if the signal is clear:

**Auto-detect from invocation:**
- `devflow standards new <id> --from-adr=<csv>` → `from-adr` (single or multi)
- `devflow standards audit <id>` → `audit`
- User mentioned "consolidar", "cross-camada", or passed ≥2 ADR slugs → `consolidate`

**Auto-detect from natural language:**
- "Crie standard a partir da ADR-N" → `from-adr` (1 ADR)
- "Crie std-X cobrindo ADRs N, M, P" → `consolidate` (≥2 ADRs)
- "Audita std-X" / "está incompleto?" → `audit`
- "Quero std-X mas não tenho ADR ainda" → **STOP**, redirect to `devflow:adr-builder` first (no ADR = no standard; the CREATE-from-thin-air path produces TODO scaffolds, which is the anti-pattern this skill exists to prevent)

**Last resort (ambiguity):** ask via prosa with 4 options.

**Routing:**
- `from-adr` / `consolidate` → Step 1 (collect inputs)
- `audit` → Step A1

---

## Common preflight (all modes)

<HARD-GATE>
**Path & invocation rules — NON-NEGOTIABLE:**
1. Standard files **MUST** be saved to `.context/standards/std-<id>.md` (relative to the project root). NEVER `standards/`, `.context/std-X/`, or anywhere else.
2. Linter files **MUST** be saved to `.context/standards/machine/std-<id>.js`.
3. The `<id>` follows convention: lowercase kebab-case, NO `std-` prefix in the user input (CLI strips it; double-prefix `std-std-X` is a known historical bug).
4. Camada-suffix is **stripped automatically** by `deriveStdId` — `adr-zod-bff` → `std-zod` (not `std-zod-bff`). One std per lib; `applyTo` widens across camadas. Do NOT manually preserve camada suffixes.
5. ADR scripts (`devflow-standards.mjs`, `standard-from-adr.mjs`, `standard-audit.mjs`) live in the DevFlow plugin install. Invoke as `node ${CLAUDE_PLUGIN_ROOT}/scripts/devflow-standards.mjs ...` from any working directory; the `--project=<path>` flag points to the user's project.
</HARD-GATE>

Verify project setup:
1. `.context/.devflow.yaml` exists (or `--project=<path>` provided).
2. `.context/adrs/` (canonical) or `.context/docs/adrs/` (legacy) contains at least the ADR slugs the user referenced.
3. `.context/standards/machine/` exists (created by CLI on first run if absent).

---

## FROM-ADR / CONSOLIDATE mode (Steps 1-5)

### Step 1 — Collect inputs

Required inputs:

| Input | Source | Format |
|---|---|---|
| `<id>` | User explicit OR derived via `deriveStdId(adrs[0].slug)` | lowercase kebab-case (e.g. `typescript`, `zod`, `husky-lint-staged`) |
| `<adr-slug>[,<slug>...]` | User explicit OR `adr-chain.findStandardsLinkingAdr` reverse lookup | numeric prefix (`001`), full slug (`adr-zod-frontend`), or filename |

If user passed slugs without `<id>`, derive automatically:
```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/devflow-standards.mjs new --from-adr=001,002 --project=<path>
```
(Omitting `<id>` is NOT supported by current CLI — agent must extract id from first ADR slug via `deriveStdId(name)` and pass explicit `<id>`.)

If user only provided `<id>` without ADRs:
> "Para gerar `std-<id>` sem TODO placeholders, preciso de pelo menos 1 ADR de origem. Quais ADRs cobrem este standard?"

Offer:
- "(a) Liste manualmente: ex. `001,002`"
- "(b) Quero buscar ADRs com slug parecido com `<id>` e te mostro candidatas"
- "(c) Ainda não tenho ADR — devo criar uma primeiro com `devflow:adr-builder`"

### Step 2 — Run deterministic baseline (CLI)

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/devflow-standards.mjs new <id> --from-adr=<csv> --project=<path> [--force]
```

This produces a **baseline standard** with:
- Frontmatter complete (id, applyTo derived from stack, relatedAdrs, enforcement.linter, weakStandardWarning:true)
- Princípios as concatenated `## Decisão` blocks (one per ADR, prefixed by camada)
- Anti-patterns table from `NUNCA` guardrails (errado=full bullet, certo="exceto Y" → "Permitido somente: Y" or generic fallback)
- Linter as numbered list of `## Enforcement` checkboxes (deduplicated)
- Referência with ADR list + consolidated `**Fontes oficiais:**` blocks

**Critical**: this baseline already passes `S1, S2, S3, S4, S5` (audit gate PASSED). Step 3 only POLISHES quality, never required for correctness.

If the CLI fails (e.g., ADR slug not found), surface the error to the user; do NOT proceed to Step 3.

### Step 3 — LLM polish (optional but recommended)

Read the baseline standard + the source ADRs. Improve:

**a) Princípios consolidation** — replace concatenated camada blocks with synthesized prose:
- Single ADR: keep `## Decisão` verbatim (already prose).
- Multi-ADR: write 2-3 dense paragraphs that synthesize the cross-camada intent, citing each camada's specific concern. NÃO copy-paste from individual ADRs — synthesize.

**b) Anti-patterns "Certo" column** — for rows where the CLI fell back to the generic placeholder ("Aplicar a alternativa explicitada na ADR…"), derive a concrete inversion:
- Read the ADR's `## Decisão` to find the prescribed pattern
- Write a 1-line code snippet or rule that demonstrates the correct form
- Keep it ≤ 80 chars per cell (table readability)

**c) Linter rules deduplication** — the CLI lists raw enforcement bullets in original order. Reorganize:
- Group by mechanism (Code review / Lint / Teste / Gate CI)
- Drop near-duplicates (e.g., `tsc --noEmit` mentioned twice across ADRs)
- Renumber

**d) Referências dedup** — collapse duplicate `**Fontes oficiais:**` blocks:
- Single bullet list of unique URLs (preserve hyperlink text)
- Group by domain (TypeScript: typescriptlang.org, TC39: tc39.es)

**e) NÃO violar:**
- Não adicionar fontes que não vieram das ADRs (Hard Rule #8 inherited)
- Não adicionar guardrails novos — só polir os derivados das ADRs
- Manter `weakStandardWarning: true` no frontmatter (linter is still placeholder until human writes real rules in `machine/std-<id>.js`)
- Manter `relatedAdrs` exatamente como veio do CLI (dedup-aware order matters for adr-chain reverse lookup)

### Step 4 — Run audit gate

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/devflow-standards.mjs audit <id> --project=<path>
```

Must show `Gate: PASSED` (5/5 PASS or 4/5 PASS with 1 WARN). If BLOCKED:
- S1 (frontmatter): missing field — Step 3 polish removed something — restore from baseline
- S2 (placeholders): polish accidentally introduced TODO — re-edit
- S3 (linter): `machine/std-<id>.js` missing — CLI should have created it; re-run with `--force`
- S4 (relatedAdrs): orphan refs — verify ADR slugs exist in `.context/adrs/`
- S5 (applyTo): SI-5 violation — extglob/negation introduced; revert to CLI baseline applyTo

### Step 5 — Commit + adr-chain back-link suggestion

```bash
git add .context/standards/std-<id>.md .context/standards/machine/std-<id>.js
git commit -m "feat(std): add std-<id> from <adr-slugs> — <description>"
```

After commit, suggest reverse-link: "ADR(s) `<slugs>` agora têm `relatedAdrs` apontando para `std-<id>`. Run `devflow standards verify` para checar consistência cross-reference."

---

## AUDIT mode (Steps A1-A3) — inline, no PREVC workflow

### Step A1 — Resolve target

Accept `<id>` (with or without `std-` prefix) or full path. Resolve:
```bash
ls .context/standards/std-<id>.md  # CLI infers prefix
```

### Step A2 — Run audit lib

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/devflow-standards.mjs audit <id> --project=<path>
```

5 deterministic checks:
- **S1** Frontmatter complete (id, applyTo, version, enforcement.linter)
- **S2** No scaffold placeholders (TODO, `<padrão errado>`, `scaffolded:true`)
- **S3** Linter file exists in `machine/`
- **S4** relatedAdrs cross-reference real ADRs (no orphans)
- **S5** applyTo passes SI-5 validateSubset (no extglob, no leading `!`)

### Step A3 — Present + recommend next action

**If PASSED** (5/5 or 4/5 with WARN):
> "std-<id> passa o gate. Polished e linkado a N ADRs."

**If BLOCKED** (≥1 FAIL):
Show table of failures + diagnosis. Offer:
- "(a) Re-derive do(s) ADR(s) original(is) com `--from-adr=...` `--force`" (if S2/S3 failures suggest stale/incomplete content)
- "(b) Editar manualmente — vou abrir o arquivo p/ você" (if S4 orphan ref or S5 invalid glob — minimal edits)
- "(c) Apenas relatar — não corrigir agora"

---

## Hard rules

1. **Standard sem ADR de origem é PROIBIDO.** O modo "scaffold com TODO" do CLI existe por compat com fluxos legados — nunca recomende esse caminho ao usuário. Se ele insistir, explique que `audit S2` vai bloquear o gate.
2. **Camada-suffix é stripped automaticamente** (`std-zod`, não `std-zod-frontend`). Não tente preservar.
3. **`applyTo` widens cross-camada por design.** TypeScript std cobre `["**/*.ts", "**/*.tsx"]` (todas camadas); não restrinja a `src/**` só.
4. **`weakStandardWarning: true` é o estado correto** quando `machine/std-<id>.js` ainda é scaffold (exit 0). Só remova quando humano implementar regras reais.
5. **`relatedAdrs` ordering matters.** Mantenha exatamente como vem do CLI (preserva ordem de Step 1 input do usuário).
6. **Step 3 polish é OPCIONAL.** Se o usuário disser "rápido, não polish", pule direto para Step 4 (audit) e Step 5 (commit).
7. **NUNCA inventar guardrails ou fontes.** Step 3 só polirá o que o CLI extraiu das ADRs. Conteúdo novo precisa de nova ADR primeiro (`devflow:adr-builder`).
8. **NUNCA editar `.context/standards/README.md`** durante este flow — é índice gerado por CLI separada (não existe ainda — TODO v1.3).

---

## Examples

### FROM-ADR (single ADR)

User: "Crie std-pytest a partir da ADR-014"

Skill (from-adr mode):
1. Run `devflow standards new pytest --from-adr=014 --project=.`
2. Read baseline + ADR-014 source
3. Polish: rewrite Princípios as 2 paragraphs (CLI baseline has 1 block; OK to keep verbatim if single ADR), fill out 2 anti-patterns "certo" cells with concrete inversions
4. Run audit → Gate: PASSED (5/5)
5. Commit `feat(std): add std-pytest from adr-pytest-backend — pytest 8.x convention`

### CONSOLIDATE (multi-ADR cross-camada)

User: "Quero std-typescript cobrindo as 3 ADRs de typescript (frontend, bff, data-infra)"

Skill (consolidate mode):
1. Resolve slugs: `001-adr-typescript-frontend`, `002-adr-typescript-bff`, `003-adr-typescript-data-infra` → CSV `001,002,003`
2. Run `devflow standards new typescript --from-adr=001,002,003 --project=.`
3. Read baseline (3 Princípios blocks, 6 anti-patterns, 11 linter rules, 3 fontes blocks)
4. Polish: synthesize Princípios as 3-paragraph cross-camada prose, dedup linter (`tsc --noEmit` aparece 2x → 1x), dedup fontes oficiais
5. Run audit → Gate: PASSED
6. Commit `feat(std): add std-typescript consolidating 3 ADRs cross-camada (frontend+bff+data-infra)`

### AUDIT inline

User: "Audita std-zod"

Skill (audit mode):
1. Run `devflow standards audit zod --project=.`
2. Show table of 5 checks
3. If PASSED → done. If BLOCKED → offer (a)/(b)/(c) routing.

---

## Reference files (none yet — minimal skill, all logic in CLI + this SKILL.md)

Future v1.1 candidates (out of scope for v0.1):
- `references/polish-guidelines.md` — explicit examples for Step 3 a/b/c/d
- `references/checklist-qualidade.md` — pre-commit self-review per Hard Rule pattern
- `references/saida-distribuicao.md` — DevFlow-adapted output (writes to `.context/standards/`, no zip)
