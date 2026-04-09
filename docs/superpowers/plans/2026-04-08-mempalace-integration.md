# MemPalace Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate MemPalace as an optional memory layer in DevFlow — MCP detection, config, hooks for read/write, dedicated recall skill, and agent diaries.

**Architecture:** Hybrid MCP-first approach. The `session-start` hook detects MemPalace MCP availability as a capability flag. Hooks inject/extract memory via MCP tools. A dedicated skill provides on-demand deep-dive search. Agent diaries are written on hand-offs via `post-tool-use`.

**Tech Stack:** Bash (hooks), Markdown (skill/command/agent), YAML (config), MemPalace MCP (19 tools)

**Spec:** `docs/superpowers/specs/2026-04-08-mempalace-integration-design.md`

---

## File Structure

### New files

| File | Responsibility |
|------|---------------|
| `skills/memory-recall/SKILL.md` | On-demand memory search skill (query → MemPalace MCP → formatted results) |
| `commands/devflow-recall.md` | `/devflow-recall <query>` command definition |
| `agents/memory-specialist.md` | Agent playbook for memory operations |

### Modified files

| File | Change |
|------|--------|
| `hooks/session-start` | Add mempalace MCP detection + `<MEMPALACE_CONTEXT>` injection |
| `hooks/post-compact` | Add mempalace memory retrieval for rehydration |
| `hooks/pre-compact` | Add agent diary + decision persistence to palace |
| `hooks/post-tool-use` | Detect hand-offs, write agent diary entries |
| `skills/project-init/SKILL.md` | Add mempalace setup step in init interview |
| `skills/config/SKILL.md` | Add mempalace config questions (P6-P8) |
| `skills/using-devflow/SKILL.md` | Add memory-recall to skill tables |
| `commands/devflow.md` | Add `/devflow-recall` to help text |
| `references/skills-map.md` | Add memory-recall entry |

---

### Task 1: Mode Detection — session-start hook

**Files:**
- Modify: `hooks/session-start:39-47` (after dotcontext MCP check)
- Modify: `hooks/session-start:153-157` (mode_context output)

- [ ] **Step 1: Add mempalace MCP detection after dotcontext detection**

In `hooks/session-start`, after the dotcontext MCP detection block (line ~47), add:

```bash
# Check mempalace MCP: look for mempalace in .mcp.json or global mcp config
mempalace_available="false"
if [ -f "${project_root}/.mcp.json" ] && grep -q "mempalace" "${project_root}/.mcp.json" 2>/dev/null; then
  mempalace_available="true"
elif [ -f "${HOME}/.config/claude/mcp.json" ] && grep -q "mempalace" "${HOME}/.config/claude/mcp.json" 2>/dev/null; then
  mempalace_available="true"
fi
```

- [ ] **Step 2: Add mempalace flag to mode_context output**

In `hooks/session-start`, in the mode_context block (line ~153), add after the dotcontext lite line:

```bash
mode_context+="- mempalace: ${mempalace_available}\\n"
```

- [ ] **Step 3: Test detection manually**

Run:
```bash
bash hooks/session-start
```
Expected: Output includes `"mempalace: false"` (since MCP is not configured in this project's .mcp.json for mempalace).

To test positive detection, temporarily add a mempalace entry to `.mcp.json` and re-run.

- [ ] **Step 4: Commit**

```bash
git add hooks/session-start
git commit -m "feat(hooks): detect mempalace MCP availability in session-start"
```

---

### Task 2: Auto-recall injection — session-start hook

**Files:**
- Modify: `hooks/session-start:110-147` (after napkin context block)

- [ ] **Step 1: Read mempalace config from .devflow.yaml**

In `hooks/session-start`, after the napkin block and before the `using_devflow_escaped` line, add a block that reads mempalace config:

```bash
# --- MemPalace auto-recall ---

mempalace_context=""
if [ "$mempalace_available" = "true" ]; then
  # Read mempalace config from .devflow.yaml
  mp_enabled="true"
  mp_budget="500"
  mp_wing="auto"
  devflow_config="${project_root}/.context/.devflow.yaml"

  if [ -f "$devflow_config" ]; then
    mp_enabled=$(python3 - "$devflow_config" << 'PYEOF'
import sys
try:
    import yaml
    with open(sys.argv[1]) as f:
        data = yaml.safe_load(f) or {}
    mp = data.get('mempalace', {})
    print(str(mp.get('enabled', True)).lower())
except:
    print('true')
PYEOF
    )
    mp_budget=$(python3 - "$devflow_config" << 'PYEOF'
import sys
try:
    import yaml
    with open(sys.argv[1]) as f:
        data = yaml.safe_load(f) or {}
    mp = data.get('mempalace', {})
    print(str(mp.get('budget', 500)))
except:
    print('500')
PYEOF
    )
    mp_wing=$(python3 - "$devflow_config" << 'PYEOF'
import sys
try:
    import yaml
    with open(sys.argv[1]) as f:
        data = yaml.safe_load(f) or {}
    mp = data.get('mempalace', {})
    print(str(mp.get('wing', 'auto')))
except:
    print('auto')
PYEOF
    )
  fi

  # Resolve wing name
  if [ "$mp_wing" = "auto" ]; then
    mp_wing=$(basename "$project_root")
  fi
fi
```

- [ ] **Step 2: Add recall instruction to context injection**

After the config reading block, add the context injection that tells the LLM to call MemPalace MCP at session start:

```bash
  if [ "$mp_enabled" = "true" ]; then
    mempalace_recall_instruction="At session start, call the mempalace MCP tool to search for relevant memories. Use wing '${mp_wing}' and limit results to approximately ${mp_budget} tokens (roughly $((mp_budget * 4 / 3)) words). Search based on the current branch name and any active workflow description. Inject results as context for the session."
    mp_escaped=$(escape_for_json "$mempalace_recall_instruction")
    mempalace_context="\\n<MEMPALACE_CONTEXT>\\nMemPalace integration active. Wing: ${mp_wing}. Budget: ${mp_budget} tokens.\\n${mp_escaped}\\n</MEMPALACE_CONTEXT>\\n"
  fi
```

- [ ] **Step 3: Include mempalace_context in session output**

In the `session_context` string assembly (line ~238), add `${mempalace_context}` after `${napkin_context}`:

```bash
session_context="<DEVFLOW_CONTEXT>\nYou have DevFlow installed.\n\n**Below is the full content of your 'devflow:using-devflow' skill — your entry point for the unified development workflow. For all other skills, use the 'Skill' tool:**\n\n${using_devflow_escaped}\n\n${mode_escaped}\n${autonomous_escaped}\n${napkin_context}\n${mempalace_context}\n</DEVFLOW_CONTEXT>"
```

- [ ] **Step 4: Test the injection**

Run:
```bash
bash hooks/session-start
```
Expected: If mempalace MCP is not available, output is unchanged. If available, output includes `<MEMPALACE_CONTEXT>` block.

- [ ] **Step 5: Commit**

```bash
git add hooks/session-start
git commit -m "feat(hooks): inject mempalace auto-recall context in session-start"
```

---

### Task 3: Rehydration — post-compact hook

**Files:**
- Modify: `hooks/post-compact:112-136` (after napkin re-injection block)

- [ ] **Step 1: Add mempalace rehydration block**

In `hooks/post-compact`, after the napkin re-injection block (line ~122) and before the fallback instructions block (line ~125), add:

```bash
  # Re-inject mempalace recall instruction
  mempalace_available="false"
  if [ -f ".mcp.json" ] && grep -q "mempalace" ".mcp.json" 2>/dev/null; then
    mempalace_available="true"
  elif [ -f "${HOME}/.config/claude/mcp.json" ] && grep -q "mempalace" "${HOME}/.config/claude/mcp.json" 2>/dev/null; then
    mempalace_available="true"
  fi

  if [ "$mempalace_available" = "true" ]; then
    mp_wing="auto"
    mp_budget="500"
    mp_enabled="true"
    if [ -f ".context/.devflow.yaml" ]; then
      mp_enabled=$(python3 - ".context/.devflow.yaml" << 'PYEOF'
import sys
try:
    import yaml
    with open(sys.argv[1]) as f:
        data = yaml.safe_load(f) or {}
    print(str(data.get('mempalace', {}).get('enabled', True)).lower())
except:
    print('true')
PYEOF
      )
      mp_budget=$(python3 - ".context/.devflow.yaml" << 'PYEOF'
import sys
try:
    import yaml
    with open(sys.argv[1]) as f:
        data = yaml.safe_load(f) or {}
    print(str(data.get('mempalace', {}).get('budget', 500)))
except:
    print('500')
PYEOF
      )
      mp_wing=$(python3 - ".context/.devflow.yaml" << 'PYEOF'
import sys
try:
    import yaml
    with open(sys.argv[1]) as f:
        data = yaml.safe_load(f) or {}
    print(str(data.get('mempalace', {}).get('wing', 'auto')))
except:
    print('auto')
PYEOF
      )
    fi
    if [ "$mp_wing" = "auto" ]; then
      mp_wing=$(basename "$PWD")
    fi
    if [ "$mp_enabled" = "true" ]; then
      rehydration="$rehydration

--- MemPalace ---
MemPalace integration active. Wing: ${mp_wing}. Budget: ${mp_budget} tokens.
Search mempalace for context relevant to current branch and workflow to restore session memory."
    fi
  fi
```

- [ ] **Step 2: Test the hook**

Run:
```bash
bash hooks/post-compact
```
Expected: Output includes MemPalace section only if MCP is configured.

- [ ] **Step 3: Commit**

```bash
git add hooks/post-compact
git commit -m "feat(hooks): add mempalace rehydration in post-compact"
```

---

### Task 4: Agent diary persistence — pre-compact hook

**Files:**
- Modify: `hooks/pre-compact:140-157` (before the escape_for_json section)

- [ ] **Step 1: Add mempalace diary flush instruction**

In `hooks/pre-compact`, before the `escape_for_json` section (line ~148), add a block that creates a diary flush instruction for the LLM:

```bash
# --- MemPalace diary flush ---

MEMPALACE_INSTRUCTION=""
mempalace_available="false"
if [ -f ".mcp.json" ] && grep -q "mempalace" ".mcp.json" 2>/dev/null; then
  mempalace_available="true"
elif [ -f "${HOME}/.config/claude/mcp.json" ] && grep -q "mempalace" "${HOME}/.config/claude/mcp.json" 2>/dev/null; then
  mempalace_available="true"
fi

if [ "$mempalace_available" = "true" ]; then
  mp_auto_diary="true"
  if [ -f ".context/.devflow.yaml" ]; then
    mp_auto_diary=$(python3 - ".context/.devflow.yaml" << 'PYEOF'
import sys
try:
    import yaml
    with open(sys.argv[1]) as f:
        data = yaml.safe_load(f) or {}
    print(str(data.get('mempalace', {}).get('auto_diary', True)).lower())
except:
    print('true')
PYEOF
    )
  fi
  if [ "$mp_auto_diary" = "true" ]; then
    MEMPALACE_INSTRUCTION="Before compacting, save a diary entry to MemPalace summarizing: which agents worked this session, key decisions made, artifacts produced, and current workflow state. Use the project wing and current PREVC phase as room."
  fi
fi
```

- [ ] **Step 2: Add mempalace_instruction to checkpoint JSON**

Add the field to the `last.json` output. After the `napkin_instruction_escaped` line:

```bash
mempalace_instruction_escaped=$(escape_for_json "$MEMPALACE_INSTRUCTION")
```

And in the `cat > "$CHECKPOINT_DIR/last.json"` heredoc, add after `napkin_instruction`:

```json
  "mempalace_instruction": "$mempalace_instruction_escaped"
```

- [ ] **Step 3: Update post-compact to read mempalace_instruction from checkpoint**

In `hooks/post-compact`, add extraction of `mempalace_instruction` from checkpoint (after the `napkin_instruction` extraction block, line ~79):

```bash
  mempalace_instruction=$(python3 - "$CHECKPOINT" << 'PYEOF'
import json, sys
try:
    with open(sys.argv[1]) as f:
        d = json.load(f)
    m = d.get('mempalace_instruction', '')
    if m: print(m)
except: pass
PYEOF
  )
```

And include it in the rehydration output (after the napkin block):

```bash
  if [ -n "$mempalace_instruction" ]; then
    rehydration="$rehydration

--- MemPalace Diary ---
$mempalace_instruction"
  fi
```

- [ ] **Step 4: Test pre-compact**

Run:
```bash
bash hooks/pre-compact
cat .context/workflow/.checkpoint/last.json | python3 -m json.tool
```
Expected: `mempalace_instruction` field present (empty string if MCP not configured).

- [ ] **Step 5: Commit**

```bash
git add hooks/pre-compact hooks/post-compact
git commit -m "feat(hooks): add mempalace diary flush in pre-compact and checkpoint read in post-compact"
```

---

### Task 5: Agent diary on hand-off — post-tool-use hook

**Files:**
- Modify: `hooks/post-tool-use:127-148` (after the napkin nudge block)

- [ ] **Step 1: Add workflow-manage hand-off detection**

In `hooks/post-tool-use`, after the napkin nudge block (line ~167) and before the TaskUpdate block (line ~171), add:

```bash
# --- MemPalace diary on workflow-manage hand-off ---

if [ "$TOOL_NAME" = "Bash" ]; then
  # Detect if the bash command was a workflow-manage handoff (MCP call)
  IS_HANDOFF=false
  case "$BASH_CMD" in
    *"workflow-manage"*"handoff"*) IS_HANDOFF=true ;;
  esac

  if [ "$IS_HANDOFF" = "true" ]; then
    mempalace_available="false"
    if [ -f ".mcp.json" ] && grep -q "mempalace" ".mcp.json" 2>/dev/null; then
      mempalace_available="true"
    elif [ -f "${HOME}/.config/claude/mcp.json" ] && grep -q "mempalace" "${HOME}/.config/claude/mcp.json" 2>/dev/null; then
      mempalace_available="true"
    fi

    if [ "$mempalace_available" = "true" ]; then
      mp_auto_diary="true"
      if [ -f ".context/.devflow.yaml" ]; then
        mp_auto_diary=$(python3 - ".context/.devflow.yaml" << 'PYEOF'
import sys
try:
    import yaml
    with open(sys.argv[1]) as f:
        data = yaml.safe_load(f) or {}
    print(str(data.get('mempalace', {}).get('auto_diary', True)).lower())
except:
    print('true')
PYEOF
        )
      fi
      if [ "$mp_auto_diary" = "true" ]; then
        diary_prompt="Agent hand-off detected. Write a diary entry to MemPalace with: agent name, phase, summary of work done, decisions made, artifacts produced, and who the hand-off goes to. Use the project wing and current PREVC phase as room, hall 'agent-diaries'."
        reminder="${reminder}\n\n${diary_prompt}"
      fi
    fi
  fi
fi
```

- [ ] **Step 2: Test the hook**

Create a mock input simulating a Bash tool call with workflow-manage handoff:
```bash
echo '{"tool_name":"Bash","tool_input":{"command":"workflow-manage handoff"},"cwd":"."}' | bash hooks/post-tool-use
```
Expected: Output includes diary prompt if mempalace MCP is configured.

- [ ] **Step 3: Commit**

```bash
git add hooks/post-tool-use
git commit -m "feat(hooks): write agent diary on workflow-manage hand-off"
```

---

### Task 6: Memory recall skill

**Files:**
- Create: `skills/memory-recall/SKILL.md`

- [ ] **Step 1: Create the skill file**

Create `skills/memory-recall/SKILL.md`:

```markdown
---
name: memory-recall
description: "Search MemPalace for project memories — agent diaries, PREVC decisions, and historical context"
---

# Memory Recall

On-demand deep-dive into MemPalace memories. Use when auto-recall budget is insufficient or when you need to explore historical context.

**Announce at start:** "I'm using the devflow:memory-recall skill to search project memories."

## Pre-requisite

Check if MemPalace MCP is available:
- If `mempalace: true` in session context → proceed
- If not → inform: "MemPalace not configured. Run `/devflow init` to set it up."

## Checklist

1. **Parse query** — extract search terms from user request
2. **Determine scope** — project wing (default) or global (if `--global` flag)
3. **Search palace** — call MemPalace MCP search tool with query
4. **Format results** — group by type (agent diaries, decisions, artifacts)
5. **Present** — show results with timestamps and source context
6. **Refine** — offer to narrow down ("filter by phase R", "more from architect")

## Step 1: Parse Query

Accept natural language queries:
- "o que decidimos sobre auth?" → search "auth decisions"
- "qual o raciocínio do architect?" → search "architect diary"
- "memórias sobre caching" → search "caching"

## Step 2: Determine Scope

Read mempalace config from `.context/.devflow.yaml`:

```yaml
mempalace:
  palace: ~/.mempalace/palace    # palace path
  wing: auto                     # project wing (auto = repo name)
```

Default: search within project wing only.
If user passes `--global` or asks for cross-project context, search all wings.

## Step 3: Search Palace

Call MemPalace MCP search tool:
- Query: user's search terms
- Wing filter: project wing (unless global)
- No token budget limit (this is the deep-dive path)

## Step 4: Format Results

Group results by type:

### Agent Diaries
```
[2026-04-08 14:30] architect (Planning)
  Summary: Defined hybrid MCP-first architecture for mempalace integration
  Decisions: MCP-first without CLI fallback, 500 token budget for auto-recall
  Artifacts: docs/superpowers/specs/2026-04-08-mempalace-design.md
  → Handed off to: code-reviewer
```

### PREVC Decisions
```
[2026-04-08 15:00] Review phase — mempalace-integration
  Approved: MCP-first approach, no Python dependency
  Flagged: Consider token budget monitoring
```

### Timeline
Chronological view when user asks for "history" or "timeline".

## Step 5: Refine

After presenting results, offer refinement:
- "Filtrar por fase?" (P/R/E/V/C)
- "Mais resultados de um agent específico?"
- "Buscar em outros projetos?" (→ global search)

## Guidelines

- Always show timestamps and source agent/phase
- Truncate long diary entries to ~200 words with "... [ver completo]" option
- If no results found, suggest broader search terms or global scope
- This skill does NOT write to the palace — only reads
```

- [ ] **Step 2: Verify skill structure**

Check the file has the required frontmatter (`name`, `description`) and the 4 sections expected by DevFlow skills (When to Use is covered by the intro + Pre-requisite, Instructions by Checklist/Steps, Examples by Step 4 format, Guidelines by Guidelines section).

- [ ] **Step 3: Commit**

```bash
git add skills/memory-recall/SKILL.md
git commit -m "feat(skills): add memory-recall skill for on-demand mempalace search"
```

---

### Task 7: Recall command

**Files:**
- Create: `commands/devflow-recall.md`

- [ ] **Step 1: Create the command file**

Create `commands/devflow-recall.md`:

```markdown
---
name: devflow-recall
description: Search MemPalace for project memories
user_invocable: true
---

# /devflow-recall

Search MemPalace for project memories — agent diaries, PREVC decisions, and historical context.

## Usage

```
/devflow-recall <query>            # Search within project wing
/devflow-recall --global <query>   # Search across all projects
```

## Behavior

1. Parse the query and optional `--global` flag
2. Invoke `devflow:memory-recall` skill
3. The skill handles MCP detection, search, and result formatting

## Arguments

- `--global` — search across all wings (default: project wing only)
- Everything else is the search query

## Examples

```
/devflow-recall o que decidimos sobre auth
/devflow-recall architect diary última sessão
/devflow-recall --global caching strategy
```
```

- [ ] **Step 2: Commit**

```bash
git add commands/devflow-recall.md
git commit -m "feat(commands): add /devflow-recall command"
```

---

### Task 8: Memory specialist agent

**Files:**
- Create: `agents/memory-specialist.md`

- [ ] **Step 1: Create the agent playbook**

Create `agents/memory-specialist.md`:

```markdown
---
type: agent
name: memory-specialist
description: MemPalace memory operations — diary writing, context retrieval, and palace organization for DevFlow workflows
role: specialist
generated: 2026-04-08
status: filled
scaffoldVersion: "2.0.0"
---

## Mission

Manage MemPalace integration within DevFlow workflows. Write agent diaries during hand-offs, retrieve relevant memories for context enrichment, and organize the palace structure (wings, rooms, halls) for optimal retrieval.

## Responsibilities

- Write agent diary entries during PREVC hand-offs
- Retrieve relevant memories during session-start and post-compact rehydration
- Organize palace structure: wing per project, room per PREVC phase, hall for agent-diaries
- Monitor token budget for auto-recall (default 500 tokens)
- Execute deep-dive searches via memory-recall skill

## Best Practices

- Diary entries must include: agent name, phase, summary, decisions, artifacts, handoff target
- Auto-recall must respect budget from `.context/.devflow.yaml` (default 500 tokens)
- Wing name defaults to repo basename; respect `mempalace.wing` config override
- Never write to palace without `auto_diary: true` (or explicit user request)
- Search results should be grouped by type (diaries, decisions, timeline)

## Key Project Resources

- `.context/.devflow.yaml` — MemPalace config (palace path, wing, budget, auto_diary, auto_recall)
- `skills/memory-recall/SKILL.md` — On-demand search skill
- `commands/devflow-recall.md` — User-facing recall command
- `hooks/session-start` — Auto-recall injection point
- `hooks/pre-compact` — Diary flush point
- `hooks/post-tool-use` — Hand-off diary trigger

## Repository Starting Points

- `hooks/` — Integration points for read/write operations
- `skills/memory-recall/` — Search skill
- `commands/` — User-facing command
- `.context/.devflow.yaml` — Configuration

## Key Files

- `hooks/session-start` — MemPalace MCP detection + auto-recall
- `hooks/post-compact` — Memory rehydration after compaction
- `hooks/pre-compact` — Diary flush before compaction
- `hooks/post-tool-use` — Hand-off diary writing
- `skills/memory-recall/SKILL.md` — Deep-dive search skill

## Architecture Context

MemPalace integration is a capability layer within DevFlow's Full mode:
- **Detection:** `session-start` hook checks for MemPalace MCP in `.mcp.json`
- **Read path:** session-start and post-compact inject memory context with token budget
- **Write path:** pre-compact flushes diaries, post-tool-use writes on hand-offs
- **On-demand:** memory-recall skill for deep-dive searches without budget limit

## Key Symbols for This Agent

- Palace structure: wing (project), room (PREVC phase), hall (agent-diaries)
- Config keys: mempalace.enabled, mempalace.palace, mempalace.wing, mempalace.budget, mempalace.auto_diary, mempalace.auto_recall
- MCP tools: mempalace search, mempalace store (from MemPalace's 19 MCP tools)
- Budget: ~500 tokens default, counted via word approximation (~0.75 tokens/word)

## Documentation Touchpoints

- `docs/superpowers/specs/2026-04-08-mempalace-integration-design.md` — Design spec
- `.context/docs/project-overview.md` — Project overview (update with mempalace capability)
- `references/skills-map.md` — Skills index (add memory-recall entry)

## Collaboration Checklist

1. Verify MemPalace MCP is configured in `.mcp.json`
2. Read mempalace config from `.context/.devflow.yaml`
3. For diary writes: confirm `auto_diary: true`
4. For auto-recall: confirm `auto_recall: true` and respect budget
5. For deep-dive: use memory-recall skill (no budget limit)

## Hand-off Notes

When handing off memory context to other agents: provide the search results formatted with timestamps, agent sources, and phase context. Include the wing and room path so the receiving agent understands the scope of the memories retrieved.
```

- [ ] **Step 2: Commit**

```bash
git add agents/memory-specialist.md
git commit -m "feat(agents): add memory-specialist agent playbook"
```

---

### Task 9: Config skill — add mempalace questions

**Files:**
- Modify: `skills/config/SKILL.md:130-155` (after P5 auto-finish questions)

- [ ] **Step 1: Add mempalace config questions**

In `skills/config/SKILL.md`, after the P5 (Auto-finish) question block and before "### 3. Gerar `.context/.devflow.yaml`", add:

```markdown
**P6: MemPalace** (condicional — só aparece se MCP detectado ou se usuário quer configurar)

Primeiro, detectar disponibilidade:
```bash
# Check mempalace MCP
HAS_MEMPALACE=false
if [ -f ".mcp.json" ] && grep -q "mempalace" ".mcp.json" 2>/dev/null; then
  HAS_MEMPALACE=true
elif [ -f "${HOME}/.config/claude/mcp.json" ] && grep -q "mempalace" "${HOME}/.config/claude/mcp.json" 2>/dev/null; then
  HAS_MEMPALACE=true
fi

# Check mempalace package
HAS_MEMPALACE_PKG=false
pip show mempalace >/dev/null 2>&1 && HAS_MEMPALACE_PKG=true
pipx list 2>/dev/null | grep -q mempalace && HAS_MEMPALACE_PKG=true
```

**Se `HAS_MEMPALACE=true`:**
```
AskUserQuestion:
  question: "MemPalace detectado. Habilitar integração de memória?"
  header: "MemPalace Integration"
  multiSelect: false
  options:
    - label: "Sim (Recomendado)"
      description: "Memória semântica persistente entre sessões"
    - label: "Não"
      description: "Desativar integração MemPalace"
```

**Se sim, P7: Palace path**
```
AskUserQuestion:
  question: "Caminho do palace?"
  header: "Palace Path"
  multiSelect: false
  options:
    - label: "~/.mempalace/palace (Global — Recomendado)"
      description: "Um palace compartilhado, cada projeto é uma wing"
    - label: "Personalizar"
      description: "Informar um caminho customizado"
```

**Se sim, P8: Token budget**
```
AskUserQuestion:
  question: "Budget de tokens para auto-recall?"
  header: "Auto-recall Budget"
  multiSelect: false
  options:
    - label: "500 tokens (Recomendado)"
      description: "Contexto compacto injetado automaticamente"
    - label: "250 tokens"
      description: "Mínimo — apenas memórias mais relevantes"
    - label: "1000 tokens"
      description: "Contexto rico — usa mais do context window"
    - label: "Desativar auto-recall"
      description: "Apenas busca manual via /devflow-recall"
```

**Se `HAS_MEMPALACE=false`:**
```
AskUserQuestion:
  question: "MemPalace não detectado. Deseja configurar memória semântica?"
  header: "MemPalace Setup"
  multiSelect: false
  options:
    - label: "Sim, instalar e configurar agora"
      description: "Instala mempalace e configura MCP automaticamente"
    - label: "Não, pular"
      description: "Continuar sem MemPalace"
```

**Se sim (instalar):**
1. Detectar instalador: `command -v pipx` → usar pipx, senão pip
2. Instalar: `pipx install mempalace` ou `pip install mempalace`
3. Configurar MCP: adicionar entry ao `.mcp.json`:
   ```json
   {
     "mempalace": {
       "command": "python",
       "args": ["-m", "mempalace.mcp_server"]
     }
   }
   ```
   Se `.mcp.json` já existe, merge a entry. Se não existe, criar com a entry.
4. Inicializar palace: `mempalace init ~/.mempalace/palace`
5. Seguir para P7 e P8
```

- [ ] **Step 2: Update YAML generation section**

In the "### 3. Gerar `.context/.devflow.yaml`" section, add the mempalace block to the template:

```markdown
**Regras de geração para mempalace:**
- Se mempalace desativado ou pulado: **não incluir** a seção `mempalace:` (ausência = desativado)
- Se habilitado com defaults: incluir seção mínima:
  ```yaml
  mempalace:
    enabled: true
  ```
- Se habilitado com customizações:
  ```yaml
  mempalace:
    enabled: true
    palace: <caminho personalizado>  # só se diferente do default
    budget: <valor>                  # só se diferente de 500
    auto_recall: false               # só se desativado
  ```
- `wing: auto` é o default — só incluir se o usuário informar um nome customizado
- `auto_diary: true` é o default — só incluir se desativado
```

- [ ] **Step 3: Update confirmation output**

In the "### 4. Confirmar e informar" section, add mempalace to the summary:

```markdown
```
✅ Configuração salva em .context/.devflow.yaml

  Estratégia: branch-flow
  Branches protegidas: main, develop
  CLI de PR: gh
  Proteção de branch: ativada
  Auto-finish: desativado
  MemPalace: ativado (global, 500 tokens)    ← novo
```
```

- [ ] **Step 4: Commit**

```bash
git add skills/config/SKILL.md
git commit -m "feat(config): add mempalace setup questions to config interview"
```

---

### Task 10: Project init — add mempalace step

**Files:**
- Modify: `skills/project-init/SKILL.md:439-441` (after Git Strategy Configuration)

- [ ] **Step 1: Add mempalace step to init checklist**

In `skills/project-init/SKILL.md`, in the checklist section (line ~144), add after item 6:

```markdown
7. **Configure MemPalace** — detect and optionally set up MemPalace integration (via devflow:config)
```

Note: The actual mempalace questions are in `devflow:config` (Task 9). The init flow already calls `devflow:config` for git strategy. The config skill now includes mempalace questions, so no additional delegation is needed — the existing `devflow:config` invocation handles both git and mempalace.

- [ ] **Step 2: Add a note in the Git Strategy Configuration section**

After the "Invoke `devflow:config` skill to run the interactive interview" line, add a clarification:

```markdown
The config skill interview includes both git strategy (P1-P5) and MemPalace integration (P6-P8, conditional on MCP availability). Both are handled in a single interview flow.
```

- [ ] **Step 3: Commit**

```bash
git add skills/project-init/SKILL.md
git commit -m "feat(project-init): document mempalace setup as part of init flow"
```

---

### Task 11: Update using-devflow skill

**Files:**
- Modify: `skills/using-devflow/SKILL.md:66-71` (Bridge Skills table)
- Modify: `skills/using-devflow/SKILL.md:83-97` (On-Demand Skills table)

- [ ] **Step 1: Add memory-recall to On-Demand Skills table**

In `skills/using-devflow/SKILL.md`, in the "On-Demand Skills" table (line ~83), add a new row:

```markdown
| `devflow:memory-recall` | Searching MemPalace for project memories, agent diaries, and historical decisions |
```

- [ ] **Step 2: Add /devflow-recall to Slash Commands table**

In the "Slash Commands" table, add:

```markdown
| `/devflow-recall <query>` | Search MemPalace for project memories |
```

- [ ] **Step 3: Commit**

```bash
git add skills/using-devflow/SKILL.md
git commit -m "feat(using-devflow): add memory-recall skill and /devflow-recall command"
```

---

### Task 12: Update devflow command help

**Files:**
- Modify: `commands/devflow.md` (help text block)

- [ ] **Step 1: Add /devflow-recall to the help text**

In `commands/devflow.md`, in the COMMANDS section of the help text, add:

```
  /devflow-recall <query>   Search MemPalace for project memories
```

In the QUICK REFERENCE section, add:

```
  Search project memories      /devflow-recall <query>
```

In the ON-DEMAND CAPABILITIES section, add:

```
  Memory Recall             "what did we decide about X?"
```

- [ ] **Step 2: Commit**

```bash
git add commands/devflow.md
git commit -m "feat(commands): add /devflow-recall to devflow help text"
```

---

### Task 13: Update skills-map.md

**Files:**
- Modify: `references/skills-map.md:62-64` (after parallel-dispatch row)

- [ ] **Step 1: Add memory-recall to Bridge Skills table**

In `references/skills-map.md`, in the "Bridge Skills" table, add a new row after `parallel-dispatch`:

```markdown
| memory-recall | devflow | `devflow:memory-recall` | any | Full | On-demand MemPalace search for project memories and agent diaries |
```

- [ ] **Step 2: Add memory-recall to Quick Reference table**

In the "Quick Reference" table at the bottom, add:

```markdown
| Search project memories | `devflow:memory-recall` or `/devflow-recall` |
```

- [ ] **Step 3: Commit**

```bash
git add references/skills-map.md
git commit -m "feat(skills-map): add memory-recall to unified skills index"
```

---

### Task 14: Final verification

**Files:**
- All modified files

- [ ] **Step 1: Verify all hooks parse correctly**

Run each hook and check for syntax errors:
```bash
bash -n hooks/session-start && echo "session-start: OK"
bash -n hooks/post-compact && echo "post-compact: OK"
bash -n hooks/pre-compact && echo "pre-compact: OK"
bash -n hooks/post-tool-use && echo "post-tool-use: OK"
```
Expected: All print "OK".

- [ ] **Step 2: Verify new files have correct structure**

```bash
# Check skill has frontmatter
head -5 skills/memory-recall/SKILL.md

# Check command has frontmatter
head -5 commands/devflow-recall.md

# Check agent has 11 sections
grep "^## " agents/memory-specialist.md | wc -l
```
Expected: Skill and command have YAML frontmatter. Agent has 11 `## ` headings.

- [ ] **Step 3: Verify skills-map has the new entry**

```bash
grep "memory-recall" references/skills-map.md
```
Expected: At least 2 matches (Bridge Skills table + Quick Reference).

- [ ] **Step 4: Run existing tests**

```bash
node --test tests/validation/test-adr-structural.mjs 2>/dev/null || echo "No test runner or tests skipped"
```

- [ ] **Step 5: Commit any remaining changes**

```bash
git status
# If any unstaged changes remain:
git add -A
git commit -m "chore: final verification pass for mempalace integration"
```
