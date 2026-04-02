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

### Minimal Mode
Explore project files, docs, and recent git commits directly.

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

## Step 6: Gate Check

The Planning phase gate requires:
- Design spec written and approved by user
- Implementation plan written
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
