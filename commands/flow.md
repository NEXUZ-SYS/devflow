---
name: flow
description: Start or continue a PREVC development workflow
user_invocable: true
---

# /flow

Start a new PREVC development workflow or continue an existing one.

## Usage

```
/flow init                             # Initialize DevFlow in this project
/flow [description]                    # Auto-detect scale
/flow scale:QUICK [description]        # Explicit scale
/flow scale:SMALL [description]
/flow scale:MEDIUM [description]
/flow scale:LARGE [description]
```

## Behavior

### `/flow init`
1. Invoke `devflow:project-init` skill
2. Scans the project (stack, structure, patterns)
3. Scaffolds `.context/` with project-aware agents, skills, and docs
4. Output is 100% dotcontext-compatible
5. Enables Lite mode automatically

### `/flow [description]`
1. Parse the description and optional scale parameter
2. Invoke `devflow:prevc-flow` skill
3. The skill handles mode detection, scale routing, and phase orchestration

## Examples

```
/flow init
→ Scans project, scaffolds .context/ with project-aware content

/flow fix the login timeout bug
→ Auto-detects QUICK scale, runs E→V

/flow add user profile page with avatar upload
→ Auto-detects MEDIUM scale, runs P→R→E→V→C

/flow scale:LARGE migrate from REST to GraphQL
→ Explicit LARGE scale, runs P→R→E→V→C with checkpoints
```

## Arguments

- `init` — triggers project initialization (devflow:project-init)
- `scale:X` — optional explicit scale (QUICK/SMALL/MEDIUM/LARGE)
- Everything else is passed as the task description to the PREVC flow orchestrator
