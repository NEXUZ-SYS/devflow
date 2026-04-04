---
name: prevc-confirmation
description: "Use during PREVC Confirmation phase — finalizes the branch, updates documentation, and syncs context across tools"
---

# PREVC Confirmation Phase

Finalizes the development branch, updates documentation, and ensures all tools and context are synchronized.

**Announce at start:** "I'm using the devflow:prevc-confirmation skill for the Confirmation phase."

## Checklist

1. **Version Bump** — detect capabilities, bump version before merge
2. **Finalize branch** — clean history, ready to merge
3. **Update documentation** — API docs, README, inline docs as needed
4. **Update project context** — reflect changes in .context/ files
5. **Sync to tools** — export context to all configured AI tools
6. **Present completion summary** — what was done, what to do next
7. **Gate check** — everything finalized = workflow complete

## Step 1: Version Bump

<HARD-GATE>
Version bump MUST happen BEFORE branch finalization (merge/PR). This prevents the version bump from being skipped when the merge is executed via any path (skill, hook, or direct Bash command).
</HARD-GATE>

### Detect Project Capabilities

Check for version bump mechanisms in this order:

1. **`scripts/bump-version.sh`** — if exists, use it (supports patch/minor/major argument)
2. **`package.json` with `"version"` field** — if exists, bump with `npm version` or manual edit
3. **README.md version history table** — if exists, add new version entry
4. **None detected** — skip bump, inform user

### Determine Bump Type

Infer from the workflow context:
- **patch** — bug fixes, minor improvements (scale QUICK/SMALL)
- **minor** — new features (scale MEDIUM with new capabilities)
- **major** — breaking changes (scale LARGE with API changes)

### Execute by Autonomy Mode

- **supervised** — Ask the user: "Que tipo de bump? (patch/minor/major)" with the inferred default. Wait for confirmation before bumping.
- **assisted** — Announce the inferred bump type, execute automatically. Report what was bumped.
- **autonomous** — Execute bump silently (patch default unless scale/context suggests otherwise). Report in summary.

### Bump Pipeline

1. Detect capabilities (bump-version.sh, package.json, README)
2. Determine bump type from scale and context
3. Execute bump (run script, update files)
4. Commit bump changes: `chore: bump to vX.Y.Z`
5. Verify commit succeeded

If bump fails, report the error and continue to Step 2 (do not block branch finalization on bump failure).

## Step 2: Finalize Branch

**REQUIRED SUB-SKILL:** Invoke `superpowers:finishing-a-development-branch`

This skill handles:
- Verifying all tests pass one final time
- Presenting merge options to the user (merge, squash, rebase)
- Executing the chosen merge strategy

## Step 3: Update Documentation

### Full Mode
```
agent({ action: "orchestrate", agents: ["documentation-writer"], task: "update-docs" })
```
The documentation-writer agent identifies what docs need updating based on the changes.

### Lite Mode
Read `.context/agents/documentation-writer.md` and apply its workflow:
- Check if API docs need updating
- Check if README needs updating
- Check if architecture docs are still accurate

### Minimal Mode
Manually review if any docs reference changed code/APIs.

### All Modes — Documentation Checklist
- [ ] New public APIs documented
- [ ] Changed APIs have updated docs
- [ ] Removed APIs are removed from docs
- [ ] README reflects new capabilities (if user-facing)
- [ ] Inline comments updated for non-obvious logic changes

## Step 4: Update Project Context

### Full Mode
```
context({ action: "fill" })  # Re-analyze and update .context/ docs
plan({ action: "commitPhase", phase: "C" })
```

### Lite Mode
Manually update relevant `.context/docs/` files:
- `project-overview.md` — if project scope changed
- `codebase-map.json` — if file structure changed
- `development-workflow.md` — if process changed

### Minimal Mode
Skip (no `.context/` to update).

## Step 5: Sync to Tools

### Full Mode
```
sync({ action: "exportContext" })  # Syncs to all configured tools
```
This exports to: Claude (.claude/), Cursor (.cursor/), Copilot (.copilot/), Windsurf, Cline, Codex, etc.

### Lite Mode
If any `.context/` files were updated, manually note that sync hasn't been run.
Suggest: "Run `dotcontext sync-agents` to export context to all AI tools."

### Minimal Mode
Skip sync.

## Step 6: Completion Summary

Present a summary:

```markdown
## Workflow Complete

**Task:** [description]
**Scale:** [QUICK/SMALL/MEDIUM/LARGE]
**Phases completed:** [P → R → E → V → C]

### What was done
- [bullet points of key changes]

### Files changed
- [list of key files]

### What to do next
- [ ] Review PR (if created)
- [ ] Deploy to staging
- [ ] Monitor for issues
```

### Full Mode Addition
```
workflow-status()  # Final status check
```

## Step 6.5: Update PRD (if exists)

After the completion summary, check if this workflow is part of a PRD:

1. Search for `.context/plans/*-prd.md`
2. **If found:**
   a. Find the phase marked `⏳ In Progress`
   b. Update its status to `✓ Completed`
   c. Fill in the Spec path: `docs/superpowers/specs/YYYY-MM-DD-<phase>-design.md`
   d. Fill in the Plan path: `docs/superpowers/plans/YYYY-MM-DD-<phase>.md`
   e. Find the next phase with status `⬚ Pending`
   f. **If next phase exists:**
      - Announce: "Phase N (<name>) completed and marked in PRD. Next up: Phase N+1 (<name>). Start planning Phase N+1?"
      - If user says yes → invoke `devflow:prevc-flow` (which will pick up the next phase via Step 1.5)
      - If user says no → end workflow
   g. **If no more phases:**
      - Announce: "All PRD phases complete! Product roadmap fully delivered."
3. **If not found:**
   a. No change (current behavior)

## Step 7: Gate Check (Workflow Complete)

The Confirmation gate marks the workflow as complete:
- Branch finalized (merged or ready to merge)
- Documentation updated
- Context synced (Full mode)
- PRD updated (if exists)

**Workflow is now COMPLETE.**

## Anti-Patterns

| Thought | Reality |
|---------|---------|
| "Docs can wait" | No. Stale docs cost more than the 5 minutes to update them now. |
| "Context sync is optional" | In Full mode, it's what keeps all your AI tools aligned. Do it. |
| "The PR description is enough" | PR descriptions are ephemeral. Project docs are permanent. |
| "I'll clean up the branch later" | Later means never. Finalize now. |
