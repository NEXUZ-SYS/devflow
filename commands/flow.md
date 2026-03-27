---
name: flow
description: Start or continue a PREVC development workflow
user_invocable: true
---

# /flow

Start a new PREVC development workflow or continue an existing one.

## Usage

```
/flow [description]                    # Auto-detect scale
/flow scale:QUICK [description]        # Explicit scale
/flow scale:SMALL [description]
/flow scale:MEDIUM [description]
/flow scale:LARGE [description]
```

## Behavior

1. Parse the description and optional scale parameter
2. Invoke `devflow:prevc-flow` skill
3. The skill handles mode detection, scale routing, and phase orchestration

## Examples

```
/flow fix the login timeout bug
→ Auto-detects QUICK scale, runs E→V

/flow add user profile page with avatar upload
→ Auto-detects MEDIUM scale, runs P→R→E→V→C

/flow scale:LARGE migrate from REST to GraphQL
→ Explicit LARGE scale, runs P→R→E→V→C with checkpoints
```

## Arguments

The full text after `/flow` (and optional `scale:X`) is passed as the task description to the PREVC flow orchestrator.
