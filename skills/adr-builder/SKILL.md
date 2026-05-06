---
name: adr-builder
description: "Use when the user asks to create, audit, or evolve Architecture Decision Records (ADRs). Trigger words: 'crie/criar ADR', 'gerar ADR', 'registrar decisão', 'audita ADR', 'revisa ADR', 'evolve ADR', 'patch/minor/major na ADR', 'substituir ADR'. Also trigger when the user just made an architectural decision (framework, library, pattern, auth strategy, testing approach, protocol contract) that needs recording. Three modes: CREATE (new ADR via guided/free/prefilled briefing), AUDIT (12 deterministic checks via adr-audit.mjs lib), EVOLVE (patch/minor/major/refine transition with version bump). Skill writes directly to .context/adrs/ (canonical since v1.0; legacy .context/docs/adrs/ read-only via dual-read until v1.2) — no zip packaging."
---

# ADR Builder — DevFlow Edition

Creates, audits, and evolves ADRs following the v2.1.0 canonical template (`assets/TEMPLATE-ADR.md`). Goes beyond Nygard/MADR by requiring **Guardrails** (verifiable rules) and **Enforcement** (concrete check mechanisms).

**Announce at start:** "I'm using the devflow:adr-builder skill in <mode> mode."

## Step 0 — Detect mode (create | audit | evolve)

Detect in cascade — do not ask if the signal is clear:

**Auto-detect from invocation:**
- Subcommand `/devflow adr:new` → `create`
- Subcommand `/devflow adr:audit <file>` → `audit`
- Subcommand `/devflow adr:evolve <target>` → `evolve`

**Auto-detect from natural language (when invoked organically):**
- User pasted/attached an ADR-shaped document, or said "audita esse" / "revisa esse ADR" → `audit`
- User said "atualiza/evolui/substitui ADR X", "mudei de ideia sobre X" → `evolve`
- User described a new decision in prose ("decidimos usar X", "vamos adotar Y") → `create`

**Last resort (ambiguity):** ask via prosa with 4 options: criar ADR nova, auditar existente, evoluir existente, ou descrever a situação para decidir.

**Routing:**
- `create` → Step 1 (mode selection for collection)
- `audit` → Step A1
- `evolve` → Step E1

---

## Common preflight (all modes)

<HARD-GATE>
**Path & script invocation rules — NON-NEGOTIABLE:**
1. ADR files **MUST** be saved to `.context/adrs/` (relative to the user's project root, canonical since v1.0). NEVER `adrs/` (no `.context/` prefix), `docs/adrs/` (no `.context/` prefix), or `.context/docs/adrs/` (legacy — removed in v1.2; existing legacy ADRs are read-only via dual-read in v1.0.x/v1.1.x).
2. ADR scripts (`adr-update-index.mjs`, `adr-audit.mjs`, `adr-evolve.mjs`) live in the **DevFlow plugin install**, NOT in the user's project. ALWAYS invoke them via `node ${CLAUDE_PLUGIN_ROOT}/scripts/<script>.mjs`. NEVER use the bare relative `node scripts/<script>.mjs` — it will fail silently in user projects.
3. The script's `--project=<path>` flag (default `.`) tells the script which project's `.context/adrs/` to operate on. The script reads/writes there, not in the plugin location.

If `${CLAUDE_PLUGIN_ROOT}` is not set in your environment (rare), resolve it via `claude plugin path devflow@NEXUZ-SYS` or instruct the user to reinstall the plugin. Do NOT fall back to bare `scripts/...` — that bug is what this gate exists to prevent.
</HARD-GATE>

Before any of the modes, verify project setup:

1. **Seed copy** — if `.context/templates/adrs/patterns-catalog.md` doesn't exist, copy from `${CLAUDE_PLUGIN_ROOT}/skills/adr-builder/assets/patterns-catalog.md`. Same for `context.yaml`. This makes them substituable per project.
2. **Verify `.context/adrs/` exists** — create directory if missing; first ADR uses `001-` prefix.
3. **Verify libs available** — `${CLAUDE_PLUGIN_ROOT}/scripts/adr-audit.mjs`, `${CLAUDE_PLUGIN_ROOT}/scripts/adr-update-index.mjs`, `${CLAUDE_PLUGIN_ROOT}/scripts/adr-evolve.mjs`. If missing, the plugin install is broken; ask the user to reinstall DevFlow.

---

## CREATE mode (Steps 1-5)

### Step 1 — Choose collection submode

Ask the user:

> **Como você quer criar o ADR?**
> - **(guided)** Respondo perguntas estruturadas em blocos
> - **(free)** Descrevo em prosa, você extrai o que conseguir
> - **(prefilled)** Já tenho o briefing — colo abaixo

If the triggering message has substantial detail, default to **free** and skip the question. If the user said "crie um ADR sobre X" with no details, default to **guided**.

### Step 2 — Collect content

| Submode | Reference | Behavior |
|---|---|---|
| guided | `references/briefing-guiado.md` | Ask questions in 6 blocks (identification, context, alternatives, consequences, guardrails/enforcement, evidence). Use prose questions with named options. |
| free | `references/extracao-livre.md` | Extract from prose, identify gaps, ONE batched round of follow-ups (max 5 questions), then generate. |
| prefilled | inline parsing | Validate fields against TEMPLATE-ADR.md schema; ask only about missing pieces. |

**Non-negotiable fields** — refuse to proceed without:
- Title + decision in one sentence
- ≥ 2 considered alternatives + the chosen one (3 total)
- ≥ 2 actionable Guardrails (SEMPRE / NUNCA / QUANDO…ENTÃO format, verifiable in code review)
- ≥ 1 Enforcement mechanism (concrete tool + rule)

If user resists, explain: *"ADR sem alternativas é receita; ADR sem guardrails é ornamento."*

### Step 3 — Resolve next number

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/adr-update-index.mjs --next-number
```
Returns 3-digit zero-padded number (e.g. `004`). Filename will be `${num}-${slug}-v1.0.0.md`.

### Step 4 — Generate the file

Read `${CLAUDE_PLUGIN_ROOT}/skills/adr-builder/assets/TEMPLATE-ADR.md` as structural source of truth. Fill in placeholders with real content (or `<a definir>` for missing pieces, with explicit warning at end).

Frontmatter defaults (NEVER ask user about these):
- `version: 1.0.0` (semver of the document, not stack)
- `supersedes: []`
- `refines: []`
- `protocol_contract: null` (unless `category: protocol-contracts`, then prompt for contract name)
- `decision_kind: firm` (default; use `gated` if user mentioned future review gate; `reversible` if explicitly experimental)
- `status: Proposto` (NEVER `Aprovado` on creation — Hard Rule #5)
- `created: <YYYY-MM-DD>` (today)

Format rules:
- Section order MUST follow template (Contexto → Decisão → Preservações* → Alternativas → Consequências → Guardrails → Enforcement → Evidências)
- Mark chosen alternative with `✓` or `(escolhida)`
- Guardrails as bullets starting with `SEMPRE` / `NUNCA` / `QUANDO…ENTÃO` (uppercase)
- Enforcement as `- [ ]` GFM checkboxes

### Step 5 — Self-review against checklist

Mentally run through `references/checklist-qualidade.md`. Fix anything that fails. Mark `<a definir>` for what couldn't be fixed; flag at end.

### Step 5b — Write file + regenerate index

Write the file to `.context/adrs/${num}-${slug}-v1.0.0.md` (in the user's project root, NEVER elsewhere). Then **mandatorily** regenerate the index:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/adr-update-index.mjs
```

Regenerates `.context/adrs/README.md` with 14 columns including the new entry. **Skipping this step is a bug** — the README index goes stale and the AI loses the ability to discover the new ADR during PREVC Planning context gathering. If the command fails, surface the error to the user immediately; do NOT proceed to commit.

### Step 5c — Run audit gate

Verify the new file passes the 12 checks:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/adr-audit.mjs .context/adrs/${num}-${slug}-v1.0.0.md --enforce-gate
```

If FIX-INTERVIEW: present gaps to user, choose whether to fix or commit-as-is.

If 12/12 PASS: commit with message `feat(adr): add ${num}-${slug}-v1.0.0 — <título curto>`.

---

## AUDIT mode (Steps A1-A4) — inline, no PREVC workflow

### Step A1 — Resolve target

Accept `<file>`, prefix (e.g. `001`), or slug. Resolve to canonical filename:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/adr-update-index.mjs --resolve=<query>
```

### Step A2 — Run audit lib

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/adr-audit.mjs <resolved-file> --format=json
```

Parse output JSON. Capture: `summary` (pass/fix_auto/fix_interview counts), `checks` array, `status_gate` (if Aprovado-protected).

### Step A3 — Present report and ask

Show the structured report (table of 12 checks with status + diagnosis). Ask:

> **Encontrei N gaps (X auto-corrigíveis, Y precisam de sua entrada). Como seguir?**
> - Apenas ver o relatório — não corrigir agora
> - Corrigir os auto-corrigíveis e mostrar o resultado
> - Corrigir tudo — aplicar fix-auto + entrevistar para gaps que precisam de julgamento humano

If "Apenas ver" → write report to file, exit.

If "Corrigir auto" or "Corrigir tudo" → delegate to **EVOLVE patch** flow (Step E2 below) with the audit JSON as input. EVOLVE handles version bump and gate semantics.

### Step A4 — S3 reminder

If `status_gate === 'Aprovado-protected'`, the lib has already auto-demoted FIX-AUTO to FIX-INTERVIEW. Inform the user: *"Esta ADR está Aprovada — modificações exigem fluxo EVOLVE explícito (patch/minor) com confirmação humana, mesmo para auto-correções."*

---

## EVOLVE mode (Steps E1-E5)

### Step E1 — Resolve target + classify change

Resolve target via `adr-update-index.mjs --resolve`. Refuse if status is `Substituido` or `Descontinuado` (history is immutable).

Classify the change:

> **Que tipo de mudança você quer fazer?**
> - **(patch)** Typo, link quebrado, clarificação — sem mudar comportamento
> - **(minor)** Adicionar guardrail/enforcement, refinar restrição existente — sem remover
> - **(major)** A decisão em si mudou — outro framework / removeu guardrails aprovados
> - **(refine)** Não substitui — cria ADR-filha que detalha aspecto específico

### Step E2 — Type-specific interview

**Patch:** ask which content needs correction; capture diff.

**Minor:** ask what to add (new guardrail / new enforcement / etc.); enforce SEMPRE/NUNCA/QUANDO format and verifiability.

**Major:** run the full **CREATE guided flow** (briefing-guiado.md) for the new ADR. Pre-fill `supersedes: [<old-slug-without-extension>]`. Ask "por que a v1 deixou de valer?" — this becomes part of new ADR's Contexto.

**Refine:** run **CREATE guided flow** for the new ADR. Pre-fill `refines: [<parent-slug>]`. Ask which specific aspect of the parent ADR is being detailed.

### Step E3 — Apply via lib

```bash
# patch
node ${CLAUDE_PLUGIN_ROOT}/scripts/adr-evolve.mjs <file> --kind=patch --apply

# minor
node ${CLAUDE_PLUGIN_ROOT}/scripts/adr-evolve.mjs <file> --kind=minor --apply

# major
node ${CLAUDE_PLUGIN_ROOT}/scripts/adr-evolve.mjs <file> --kind=major --apply

# refine
node ${CLAUDE_PLUGIN_ROOT}/scripts/adr-evolve.mjs <file> --kind=refine --slug=<new-slug> --apply
```

Lib handles: version bump (via adr-semver), file rename or new file creation, status changes, atomic write-then-rename (S5), index regeneration (calls `adr-update-index.mjs` internally — also via `${CLAUDE_PLUGIN_ROOT}`).

### Step E4 — Validate via gate

Lib calls `adr-update-index.mjs` automatically. Then run audit on touched files:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/adr-audit.mjs <touched-file> --enforce-gate
```

For major: audit BOTH files (new and old-with-Substituido). For refine: audit only new file. For patch/minor: audit the renamed file.

### Step E5 — Commit + close workflow

```bash
git add .context/adrs/
git commit -m "<type>(adr): <kind> <old-slug> → <new-slug-or-version> — <descrição>"
```

EVOLVE always runs as PREVC SMALL (P → E → V), so the V phase Step 2.5 picks up the changes automatically. Workflow closes after V passes.

---

## Hard rules (12 — Hard Rule #4: do NOT deviate from template)

1. **Never generate without alternatives considered** — push back until ≥1 discarded option provided.
2. **Never generate vague guardrails** — refuse "boas práticas", "ter cuidado", "considerar" — require code-review-verifiable rules.
3. **Never invent content the user did not provide** — alternatives, guardrails, consequences must come from user.
4. **Never deviate from `assets/TEMPLATE-ADR.md`** — section order, frontmatter schema are the contract.
5. **Never set status `Aprovado` on generation** — only `Proposto`. Approval is human after PR review.
6. **Always set `version: 0.1.0` or `1.0.0` on generation, `supersedes: []`, `refines: []`, `protocol_contract: null`, `decision_kind: firm` defaults.**
7. **ADR is about stack and architecture, never product features or business operations** — strip product/vertical mentions (consult `context.yaml`).
8. **Evidências accept only official sources** — no Medium, dev.to, blogs, Stack Overflow, YouTube. Refuse if user provides forbidden sources.
9. **No `## Relacionamentos` section in prose** — links live exclusively in frontmatter `supersedes`/`refines`.
10. **Length 80-120 lines** (180 with tabular exception). Density: trigger semantic for technical reader, never tutorial.
11. **Never package without explicit confirmation** — adapted for DevFlow: never commit without user approval; never auto-merge.
12. **Frontmatter graph is navigation metadata, not generation context** — never load referenced ADRs as context during generation/audit. Mention slug, never expand.

## Reference files (loaded on demand)

- `references/briefing-guiado.md` — guided CREATE question script
- `references/extracao-livre.md` — free CREATE extraction rules
- `references/auditoria.md` — AUDIT 11 checks (Check 12 added by adr-graph.mjs)
- `references/checklist-qualidade.md` — pre-delivery self-review
- `references/saida-distribuicao.md` — DevFlow-adapted output (writes to `.context/adrs/`, no zip)

## Asset files

- `assets/TEMPLATE-ADR.md` — canonical template (Hard Rule #4 imutável)
- `assets/patterns-catalog.md` — seed for `.context/templates/adrs/patterns-catalog.md` (substituable per org)
- `assets/context.yaml` — seed for `.context/templates/adrs/context.yaml` (product names + verticals + devflow_url)

## Examples

### CREATE guided (minimal)

User: "Cria um ADR sobre usarmos Zod para validação."

Skill (guided mode):
> Vou criar em modo guiado. Primeiro o básico:
> 1. Escopo: organizational ou project?
> 2. Stack: TypeScript? Node? Outro?
> 3. Categoria: qualidade-testes ou arquitetura?
> 4. Restrições relevantes (orçamento, time, prazo)?

[continues through 6 blocks, generates `004-zod-validation-v1.0.0.md`]

### AUDIT inline

User: `/devflow adr:audit 001`

Skill:
> Resolvendo argumento... `001-tdd-python-v1.0.0.md`. Rodando auditoria.
>
> [shows table]
> ✅ PASS: 11/12 | ❓ FIX-INTERVIEW: 1 (Check 8)
>
> Como seguir?
> [user picks "Corrigir tudo" → delegate to EVOLVE patch]

### EVOLVE major

User: `/devflow adr:evolve 001-tdd-python --major`

Skill:
> ADR 001-tdd-python-v1.0.0.md (Aprovado).
> Tipo: major. Vou rodar o CREATE guiado para a nova ADR. Por que a v1 deixou de valer?
> [user explains, skill runs full CREATE flow, generates 001-tdd-python-v2.0.0.md and marks v1.0.0 as Substituido]
