---
name: prevc-confirmation
description: "Use during PREVC Confirmation phase — finalizes the branch, updates documentation, and syncs context across tools"
---

# PREVC Confirmation Phase

Finalizes the development branch, updates documentation, and ensures all tools and context are synchronized.

**Announce at start:** "I'm using the devflow:prevc-confirmation skill for the Confirmation phase."

## Checklist

1. **Finalize branch** — clean history, ready to merge
2. **Update documentation** — API docs, README, inline docs as needed
3. **Update project context** — reflect changes in .context/ files
4. **Sync to tools** — export context to all configured AI tools
5. **Present completion summary** — what was done, what to do next
6. **Gate check** — everything finalized = workflow complete

## Step 1: Finalize Branch

**REQUIRED SUB-SKILL:** Invoke `superpowers:finishing-a-development-branch`

This skill handles:
- Verifying all tests pass one final time
- Presenting merge options to the user (merge, squash, rebase)
- Executing the chosen merge strategy

## Step 2: Update Documentation

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

## Step 3: Update Project Context

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

## Step 4: Sync to Tools

### Full Mode
```
sync({ action: "exportContext" })  # Syncs to all configured tools
```
This exports to: Claude (.claude/), Cursor (.cursor/), Copilot (.copilot/), Windsurf, Cline, Codex, etc.

### Lite Mode
If any `.context/` files were updated, manually note that sync hasn't been run.
Suggest: "Run `npx dotcontext sync` to export context to all AI tools."

### Minimal Mode
Skip sync.

## Step 5: Completion Summary

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

## Step 6: Gate Check (Workflow Complete)

The Confirmation gate marks the workflow as complete:
- Branch finalized (merged or ready to merge)
- Documentation updated
- Context synced (Full mode)

**Workflow is now COMPLETE.**

## Anti-Patterns

| Thought | Reality |
|---------|---------|
| "Docs can wait" | No. Stale docs cost more than the 5 minutes to update them now. |
| "Context sync is optional" | In Full mode, it's what keeps all your AI tools aligned. Do it. |
| "The PR description is enough" | PR descriptions are ephemeral. Project docs are permanent. |
| "I'll clean up the branch later" | Later means never. Finalize now. |
