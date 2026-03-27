---
name: feature-breakdown
description: "Use when decomposing a large feature into implementable chunks — identifies components, dependencies, and delivery order"
---

# Feature Breakdown

Decompose large features into independently deliverable, testable chunks with clear dependencies.

**Announce at start:** "I'm using the devflow:feature-breakdown skill to decompose this feature."

## When to Use

- Feature touches multiple components or systems
- Scope feels too large for a single plan
- Need to identify delivery order and dependencies
- Planning parallel work across agents/developers

## Checklist

1. **Map the feature** — what does the user see when it's done?
2. **Identify components** — what systems/modules are involved?
3. **Find boundaries** — where can you slice without breaking value?
4. **Order by dependency** — what must exist before what?
5. **Size each chunk** — is each chunk independently deliverable?
6. **Define interfaces** — how do chunks communicate?

## Decomposition Process

### Step 1: User Story Map
```
Feature: "User can upload and share profile photos"

User sees:
├─ Upload button on profile page
├─ Image preview and crop
├─ Progress indicator during upload
├─ Photo appears on profile
└─ Share link for the photo
```

### Step 2: Component Identification
```
Components involved:
├─ Frontend: Upload UI, crop tool, preview
├─ Backend: Upload endpoint, image processing
├─ Storage: File storage (S3/local), thumbnails
├─ Database: Photo metadata, user-photo relation
└─ CDN: Serve optimized images
```

### Step 3: Slice into Chunks

Each chunk must be:
- **Independently deployable** — works without future chunks
- **Independently testable** — has its own test suite
- **Valuable on its own** — delivers something, even if partial

```
Chunk 1: Storage + upload API (backend only, no UI)
Chunk 2: Upload UI + integration with API
Chunk 3: Image processing (crop, resize, thumbnails)
Chunk 4: CDN integration + optimized serving
Chunk 5: Share link generation
```

### Step 4: Dependency Graph
```
Chunk 1 (storage + API)
  ├─ Chunk 2 (UI) depends on 1
  ├─ Chunk 3 (processing) depends on 1
  │   └─ Chunk 4 (CDN) depends on 3
  └─ Chunk 5 (sharing) depends on 1
```

Chunks 2, 3, and 5 can be parallelized after Chunk 1.

### Step 5: Agent Assignment
```
Chunk 1 → database-specialist + backend-specialist
Chunk 2 → frontend-specialist
Chunk 3 → backend-specialist
Chunk 4 → devops-specialist
Chunk 5 → backend-specialist + frontend-specialist
```

## Output Format

```markdown
## Feature Breakdown: [Name]

### Chunks (in dependency order)

#### Chunk 1: [name]
- **Scope:** [what it includes]
- **Depends on:** [nothing / chunk N]
- **Agents:** [which agents]
- **Scale:** [QUICK/SMALL/MEDIUM]
- **Interface:** [what it exposes to other chunks]

#### Chunk 2: [name]
...

### Dependency Graph
[text or graphviz representation]

### Parallelization Opportunities
[which chunks can run concurrently]
```

## Mode Integration

### Full Mode
```
skill({ action: "getContent", skill: "feature-breakdown" })
agent({ action: "orchestrate", agents: ["architect"], task: "breakdown" })
```

### Lite Mode
Read `.context/skills/feature-breakdown/SKILL.md` and `.context/agents/architect-specialist.md`.

## Anti-Patterns

| Pattern | Problem |
|---------|---------|
| "It's all one thing" | If it touches 3+ components, it can be decomposed |
| Chunks that require other chunks to be useful | Each chunk should deliver value alone |
| Too many tiny chunks | Overhead of planning exceeds implementation time |
| No dependency analysis | Leads to blocked parallel work |
| Skipping interface definitions | Chunks can't integrate cleanly without contracts |
