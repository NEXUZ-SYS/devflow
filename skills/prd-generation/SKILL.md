---
name: prd-generation
description: "Use to generate a complete product PRD with phased roadmap — supports new projects and retroactive PRD for existing codebases"
---

# PRD Generation

Generate a complete Product Requirements Document with all phases defined upfront. Supports two modes: new projects (Modo A) and existing codebases (Modo B). The PRD lives above the PREVC cycle — each phase becomes a separate PREVC run.

<HARD-GATE>
Do NOT skip the interview step. Codebase analysis alone cannot capture user intent, priorities, or constraints. The interview is mandatory in both modes.
</HARD-GATE>

**Announce at start:** "I'm using the devflow:prd-generation skill to generate the product PRD."

## Checklist

You MUST create a task for each of these items and complete them in order:

1. **Detect mode** — Modo A (new) or Modo B (existing)
2. **Gather context** — invoke `devflow:context-awareness`
3. **Analyze existing state** (Modo B only) — map what already exists
4. **Interview user** — Socratic process, one question at a time
5. **Synthesize** — cross-reference code analysis with interview
6. **Generate PRD** — apply template, RICE, MoSCoW
7. **Decompose into phases** — invoke `devflow:feature-breakdown`
8. **Present for approval** — section by section
9. **Save PRD** — write to `.context/plans/<project>-prd.md`
10. **Handoff** — announce readiness for PREVC of first pending phase

## Step 1: Detect Mode

Auto-detect based on project state:

| Condition | Mode |
|---|---|
| `.context/docs/project-overview.md` exists with `status: filled` | **Modo B** (existing project) |
| `docs/superpowers/specs/` has spec files | **Modo B** (existing project) |
| Otherwise | **Modo A** (new project) |

Announce the detected mode: "Detected **Modo A/B** — [new project / existing codebase]."

## Step 2: Gather Context

Invoke `devflow:context-awareness` to map the project.

### Full Mode
```
context({ action: "buildSemantic" })
context({ action: "getMap" })
context({ action: "detectPatterns" })
```

### Lite Mode
Read in order:
- `.context/docs/project-overview.md`
- `.context/docs/codebase-map.json`
- `.context/docs/development-workflow.md`
- `.context/docs/testing-strategy.md`

### Minimal Mode
Explore project files, `README.md`, `package.json`/`Cargo.toml`/`go.mod`, recent git commits.

## Step 3: Analyze Existing State (Modo B only)

Without asking any questions yet, build a "Current State" picture:

1. Read `.context/plans/` — existing plans and their completion status
2. Read `docs/superpowers/specs/` — specs already generated
3. Analyze `git log --oneline -30` — recent features and milestones
4. Summarize: what components exist, what's complete, what's partially done

Output internally: a draft "Current State" section for the PRD.

## Step 4: Interview User

Socratic process — **one question at a time**. Prefer multiple choice when possible.

### Modo A Questions (new project)
1. "What is the end goal of this project? What problem does it solve?"
2. "Who is the target user?"
3. "What are the core capabilities that make this product valuable?"
4. "What's the minimum viable version? What must Phase 1 include?"
5. "What are the known constraints? (tech stack, timeline, dependencies)"
6. "Are there features you've already decided are out of scope?"

### Modo B Questions (existing project)
Present the "Current State" analysis first, then ask:
1. "Does this analysis of what exists match your understanding?"
2. "What do you consider already complete vs still in progress?"
3. "What's the end goal — what does the finished product look like?"
4. "What are the next deliverables in priority order?"
5. "Is there anything that needs to be redone or refactored?"
6. "What are the constraints? (time, tech, dependencies)"

Continue with follow-up questions as needed. Stop when you have enough to define all phases.

## Step 5: Synthesize

Cross-reference codebase analysis with interview answers:

1. Map features mentioned in interview to existing code (Modo B)
2. Identify gaps between current state and product vision
3. Group related features into logical phases
4. Determine dependencies between phases
5. Apply **RICE scoring** to each phase:
   - **Reach:** How many users/components affected
   - **Impact:** massive (3x) / high (2x) / medium (1x) / low (0.5x) / minimal (0.25x)
   - **Confidence:** high (100%) / medium (80%) / low (50%)
   - **Effort:** person-months estimate (xl/l/m/s/xs)
6. Apply **MoSCoW** classification:
   - **Must Have:** Critical for MVP / next release
   - **Should Have:** Important but not blocking
   - **Could Have:** Nice to have
   - **Won't Have:** Explicitly out of scope

## Step 6: Generate PRD

Apply the Standard PRD template structure adapted for phased delivery:

```markdown
---
type: plan
name: <project>-prd
description: Product Requirements Document
category: prd
generated: YYYY-MM-DD
status: active
scaffoldVersion: "2.0.0"
---

# PRD: <Project Name>

## Executive Summary
- **Problem:** [2-3 sentences]
- **Solution:** [2-3 sentences]
- **Business Impact:** [3 bullet points]

## Product Vision
[End goal, differentiation, target users]

## Current State
[Modo B: what already exists. Modo A: "Greenfield project."]

## Phased Roadmap

### Phase 1: <name> — MVP
- **Scope:** [what it includes]
- **Depends on:** —
- **RICE Score:** [calculated score]
- **MoSCoW:** Must Have
- **Done Criteria:** [specific, measurable criteria]
- **Spec:** (generated when phase starts)
- **Plan:** (generated when phase starts)
- **Status:** ⬚ Pending

### Phase 2: <name>
- **Scope:** [what it includes]
- **Depends on:** Phase 1
- **RICE Score:** [calculated score]
- **MoSCoW:** [Must/Should/Could]
- **Done Criteria:** [specific, measurable criteria]
- **Status:** ⬚ Pending

### Phase N: <name>
...

## Out of Scope
[Won't Have items — explicitly listed]

## Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| ... | ... | ... | ... |

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| ... | ... | ... |
```

## Step 7: Decompose Phases

For each phase, invoke `devflow:feature-breakdown` to validate:
- Phase scope is independently deliverable
- Dependencies between phases are correct
- Each phase produces testable, working software
- No circular dependencies

Do NOT generate detailed specs or plans for future phases. Only the phase scope, dependencies, and done criteria.

## Step 8: Present for Approval

Present the PRD section by section to the user:

1. Executive Summary + Product Vision → approve?
2. Current State (Modo B) → accurate?
3. Phased Roadmap (each phase) → approve scope and order?
4. Out of Scope → anything missing?
5. Risks & Success Metrics → approve?

Revise sections based on feedback before moving on.

## Step 9: Save PRD

Save the approved PRD to `.context/plans/<project>-prd.md`.

If `.context/plans/` doesn't exist, create it.

## Step 10: Handoff

Announce readiness:

> "PRD saved to `.context/plans/<project>-prd.md`. Phase 1 (<name>) is ready for PREVC. Start planning Phase 1 now?"

If user says yes → invoke `devflow:prevc-flow` with Phase 1 scope as the task description.

## Mode Integration

### Full Mode
```
context({ action: "scaffoldPlan", planName: "<project>-prd", title: "PRD: <project>", summary: "<PRD content>", semantic: true, autoFill: true })
```

### Lite Mode
Write directly to `.context/plans/<project>-prd.md`.

### Minimal Mode
Write to `.context/plans/<project>-prd.md` (create directory if needed).

## Anti-Patterns

| Pattern | Problem |
|---|---|
| "Detail all phases now" | Only the current phase gets a detailed spec; future phases stay at macro scope |
| "The PRD is the spec" | PRD is the roadmap; spec is the technical detail of one phase |
| "Skip the interview in Modo B" | Code analysis doesn't capture intent or priority |
| "Phases without done criteria" | Every phase needs a clear, measurable definition of done |
| "One giant phase" | If a phase touches 5+ components, decompose further |
| "Reorder phases ignoring dependencies" | RICE scores guide priority, but dependencies constrain order |
