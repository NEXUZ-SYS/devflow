---
name: prevc-planning
description: "Use during PREVC Planning phase — combines superpowers brainstorming (9-step Socratic process) with dotcontext context enrichment and plan scaffolding"
---

# PREVC Planning Phase

Turns ideas into validated specs and implementation plans through disciplined Socratic dialogue, enriched with project context.

<HARD-GATE>
Do NOT write any code, scaffold any project, or take any implementation action until you have presented a design and the user has approved it. This applies to EVERY project regardless of perceived simplicity.
</HARD-GATE>

**Announce at start:** "I'm using the devflow:prevc-planning skill for the Planning phase."

## Checklist

You MUST create a task for each of these items and complete them in order:

1. **Gather project context** (mode-aware)
2. **Invoke brainstorming** — `superpowers:brainstorming` for the 9-step Socratic process
3. **Enrich spec with context** — annotate spec with codebase-specific details
4. **Write implementation plan** — `superpowers:writing-plans`
5. **Handoff to dotcontext** (mode-aware)
6. **Gate check** — spec approved + plan written = ready to advance

## Step 1: Gather Project Context

### Full Mode
```
context({ action: "buildSemantic" })
agent({ action: "getPhaseDocs", phase: "P" })
```
Feed semantic context into the brainstorming process. The agent knows the codebase structure, patterns, and conventions before asking questions.

### Lite Mode
Read these files and incorporate into brainstorming:
- `.context/docs/project-overview.md` — project description, goals
- `.context/docs/codebase-map.json` — file structure, dependencies
- `.context/docs/development-workflow.md` — existing conventions
- `.context/docs/testing-strategy.md` — testing approach
- `.context/docs/adrs/README.md` — active ADR guardrails (if exists)

### Minimal Mode
Explore project files, docs, and recent git commits directly.

### All Modes — ADR Guardrails Loading (filtered by task)

After gathering base context, check for active ADRs:

1. Check if `.context/docs/adrs/README.md` exists. If not, continue without ADR constraints (ADRs are opt-in).

2. If yes, **invoke `devflow:adr-filter`** passing the current task description. That skill:
   - Reads the README index
   - Resolves the project stacks (from task mentions or filesystem detection with precaution fallback)
   - Selects only the ADRs relevant to the task (by stack + semantic alignment)
   - Loads `## Guardrails` sections of the selected ADRs
   - Emits a focused `<ADR_GUARDRAILS filtered="true">` block

3. Collect the filtered guardrails as constraints for the brainstorming process. Announce: "Loaded N guardrails from M of K active ADRs (filtered for this task)."

**Important:** Guardrails from selected ADRs are treated as hard constraints during brainstorming:
- The brainstorming MUST NOT propose alternatives already rejected in ADRs
- The design MUST comply with all active guardrails
- If a guardrail conflicts with the task requirements, flag the conflict to the user instead of silently violating

**Fallback:** If `devflow:adr-filter` is unavailable (e.g., installation incomplete), fall back to loading **all** ADRs with `status: Aprovado` — correctness over optimization.

**Hierarchy:** Project ADRs (`scope: project`) override Organizational ADRs (`scope: organizational`) for the same topic.

## Step 2: Brainstorming

**REQUIRED SUB-SKILL:** Invoke `superpowers:brainstorming`

The superpowers brainstorming skill runs the full 9-step process:
1. Explore project context (already gathered in Step 1 — feed it in)
2. Offer visual companion (if applicable)
3. Ask clarifying questions — one at a time
4. Propose 2-3 approaches with trade-offs
5. Present design in sections, get approval per section
6. Write design doc
7. Spec self-review
8. User reviews spec
9. Transition to writing-plans

**DevFlow addition:** When proposing approaches, annotate each with:
- Which agents would be involved (from the 15 available)
- Which existing code/patterns to leverage (from context)
- Estimated scale (QUICK/SMALL/MEDIUM/LARGE)

## Step 3: Enrich Spec

After brainstorming produces the spec, enrich it:

### Full Mode
```
agent({ action: "orchestrate", phase: "P" })
```
The architect agent reviews the spec for technical feasibility.

### Lite Mode
Read `.context/agents/architect-specialist.md` and apply its review checklist manually.

### Minimal Mode
Skip enrichment — spec stands as-is from brainstorming.

## Step 3.5: ADR opportunity check (Step 5.6 of plan adr-system-v2)

After the spec is enriched and BEFORE writing the implementation plan, evaluate whether the design contains an architectural decision that should be registered as an ADR.

**Mechanism:** instrução em linguagem natural — você (LLM) avalia os 4 sinais simultaneamente. Não é regex, não é lib. P11 do plan adr-system-v2.

**Os 4 sinais (todos devem bater para ativar):**

| Sinal | Como detectar |
|---|---|
| **Escolha entre alternativas** | Spec contém ≥2 opções discutidas com tradeoffs ("X vs Y", "em vez de", "considerei A mas optei por B") |
| **Afeta stack/arquitetura** | Spec menciona framework, biblioteca, padrão, protocolo, ferramenta de infra, layer de stack |
| **Implica guardrails** | Decisão cria regras de uso recorrentes ("sempre usar X", "evitar Y", contratos de chamada) |
| **Não-trivial** | Task não é bugfix, rename, typo, ou refactor cosmético |

Se `sinais_presentes < 4 de 4` → pula este step, segue para Step 4. Alta especificidade evita fadiga.

**Quando os 4 sinais batem, oferecer:**

> Detectei uma decisão arquitetural no design proposto:
>   "<frase-chave do spec, ex: Adotar Zod como validador único entre frontend e backend>"
>
> Quer registrar como ADR antes de escrever o plan?
> - **(a) Sim**, rodar `/devflow adr:new --mode=prefilled` com pré-preenchimento deste design
> - **(b) Não**, seguir direto para o plan (decisão fica só no spec)
> - **(c) Não oferecer novamente neste workflow** (`skip_adr_offer=true`)

**Comportamento por escolha:**
- **(a)** — suspende o fluxo de prevc-planning. Spawna workflow filho `/devflow adr:new --mode=prefilled` com o design atual como briefing. Quando workflow-filho conclui (V phase passa, ADR commitada), controle volta para Step 4 com ADR criada disponível em `.context/docs/adrs/`. Plan a ser escrito pode referenciá-la.
- **(b)** — segue direto para Step 4. Nada muda.
- **(c)** — escreve `skip_adr_offer: true` no workflow metadata. Step 3.5 não roda novamente neste workflow. Default permanece ativo em workflows futuros.

**Brittleness mitigada por:**
1. 4 sinais simultâneos — alta especificidade, baixa fadiga
2. Opt-out persistente — usuário pode pular permanentemente neste workflow
3. Texto de oferta declarativo — sempre cita a frase exata do spec que disparou os 4 sinais (transparência)

## Step 4: Write Plan

**REQUIRED SUB-SKILL:** Invoke `superpowers:writing-plans`

The plan follows superpowers format (bite-sized 2-5 minute tasks, TDD, DRY, YAGNI) but with DevFlow additions:

### Plan Header Extension
```markdown
# [Feature Name] Implementation Plan

> **DevFlow workflow:** [workflow-name] | **Scale:** [MEDIUM] | **Phase:** P→R

**Goal:** [One sentence]
**Architecture:** [2-3 sentences]
**Tech Stack:** [Key technologies]
**Agents:** [Which agents will be involved in execution]

---
```

### Agent Annotations Per Task
For each task group, note which agent role is best suited:
```markdown
## Task Group: API Layer
**Agent:** backend-specialist
**Handoff from:** architect (after design review)

- [ ] Step 1: Write failing test for endpoint
- [ ] Step 2: Run test, confirm failure
...
```

### Step 4.5: Generate stories.yaml (if autonomy is assisted or autonomous)

After the plan is written and approved, decompose it into stories for the autonomous loop.

**Source selection (in priority order):**

1. **`--from-prd` flag or PRD detected in Step 1.5 of prevc-flow:** Convert PRD phases into stories directly (skip brainstorming for story generation, use PRD scope as source)
2. **Implementation plan exists:** Decompose plan task groups into stories
3. **Neither:** Error — cannot generate stories without a plan or PRD

#### Path A: From PRD (existing projects)

When `--from-prd` is set or prevc-flow detected an active PRD:

1. Read the PRD file (`.context/plans/*-prd.md`)
2. Find the current phase (marked `⏳ In Progress`)
3. Parse the phase's **Scope** section — each bullet point becomes a story
4. For each scope item:
   - `id`: Sequential (S1, S2, S3, ...)
   - `title`: Scope item text
   - `description`: Expand from PRD context + existing `.context/docs/` (codebase map, project overview)
   - `agent`: Infer from scope item content (e.g., "API endpoint" → `backend-specialist`, "UI component" → `frontend-specialist`, "migration" → `database-specialist`)
   - `priority`: Sequential based on PRD order
   - `blocked_by`: Derive from natural dependencies (DB schema before API, API before UI)
5. Set escalation defaults from `templates/stories-schema.yaml`
6. Write to `.context/workflow/stories.yaml`
7. Announce: "Generated stories.yaml with <N> stories from PRD phase <phase>."

**Important:** Enrich story descriptions with existing project context. Read `.context/docs/project-overview.md` and `.context/docs/codebase-map.json` to include real file paths, existing patterns, and conventions in each story description.

#### Path B: From implementation plan (default)

1. Read the implementation plan
2. For each task group in the plan, create a story entry:
   - `id`: Sequential (S1, S2, S3, ...)
   - `title`: Task group title
   - `description`: Combine the task group's steps into a concise description that fits in 1 context window
   - `agent`: Use the agent annotation from the plan (e.g., `backend-specialist`)
   - `priority`: Sequential based on plan order
   - `blocked_by`: Derive from task dependencies (if Task 3 depends on Task 1, S3 blocked_by [S1])
3. Set escalation defaults from `templates/stories-schema.yaml`
4. Write to `.context/workflow/stories.yaml`
5. Announce: "Generated stories.yaml with <N> stories for autonomous execution."

**Reference:** See `templates/stories-schema.yaml` for the full schema.

**Important:** Each story MUST fit in a single context window. If a task group is too large, split it into multiple stories. A good story is: one model, one endpoint, one component, one migration — not "build the entire API."

## Step 5: Handoff to Dotcontext

After writing-plans generates the plan and the user approves:

### Full Mode
1. Read the complete spec (written by `superpowers:brainstorming` in Step 2, typically at `docs/superpowers/specs/<file>.md`)
2. Derive planName from the spec title (slugified)
3. Create the plan in dotcontext:
   ```
   context({ action: "scaffoldPlan", planName: "<slug>", title: "<spec title>", summary: "<FULL SPEC CONTENT>", semantic: true, autoFill: true })
   ```
4. Link to active workflow:
   ```
   plan({ action: "link", planSlug: "<slug>" })
   ```
5. Inform user: "Plan linked to dotcontext workflow. Ready for Review."

### Lite Mode
1. Convert the Markdown plan to dotcontext v2 format
2. Save as `.context/plans/<slug>.md`
3. Include the full spec as a section of the file
4. Track via Claude Code tasks

### Minimal Mode
No conversion — execution follows superpowers workflow.

## Step 5.5: Validate Test-First Ordering in Plan

<HARD-GATE>
Before the Planning gate can pass, verify the implementation plan follows TDD ordering:

1. **Every task group must start with a test step** — "Write failing test" before any "Implement" step
2. **Test types must be specified** — each task group must declare which test types are needed:
   - Unit tests (always)
   - Integration tests (if task touches API, DB, or service boundaries)
   - E2E tests (if task touches auth, payments, user flows, CLI tools)
3. **No implementation step without a preceding test step** — if a task group has implementation code but no test code before it, the plan is invalid

**Quick check:** Scan the plan for task groups. For each group:
- Does "test" or "spec" appear BEFORE "implement" or "code"?
- Are test types annotated? (e.g., `**Tests:** unit + integration`)
- Is there at least one test file path in the `Test:` field?

If any task group violates test-first ordering, fix the plan before advancing.
</HARD-GATE>

## Step 6: Gate Check

The Planning phase gate requires:
- Design spec written and approved by user
- Implementation plan written
- Plan validates test-first ordering (Step 5.5)
- Plan linked to workflow (Full mode) or saved to docs/

**When gate is met:** Announce readiness to advance.

### Full Mode
```
workflow-advance()  # Moves to R phase
```

## Anti-Patterns

| Thought | Reality |
|---------|---------|
| "I already know the codebase" | Context enrichment finds what you missed. Always gather. |
| "The spec is obvious" | Obvious specs still need user approval. No exceptions. |
| "Plans are busywork" | Bite-sized plans prevent 3-hour debugging sessions. Write them. |
| "Agent annotations are overhead" | They enable parallel execution in E phase. Worth the 2 minutes. |
| "I can skip the dotcontext handoff" | Without it, agents execute blind. The handoff is the bridge. |
