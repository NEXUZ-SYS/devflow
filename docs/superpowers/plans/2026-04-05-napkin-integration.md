# Napkin Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate napkin as a native devflow skill with deep PREVC hook integration, giving agents persistent learning memory across sessions.

**Architecture:** New skill `devflow:napkin` in `skills/napkin/SKILL.md` adapted from blader/napkin v6.0.0. Four existing hooks modified to inject/curate `.context/napkin.md`. Bash integration tests validate hook behavior; Node structural tests validate skill integrity.

**Tech Stack:** Bash (hooks), Markdown (skill), Node `node:test` (structural tests)

---

### Task 1: Create the napkin skill

**Files:**
- Create: `skills/napkin/SKILL.md`

- [ ] **Step 1: Write the structural test for the new skill**

Add napkin to the skill frontmatter validation list in `tests/validation/test-structural.mjs`:

```javascript
// In the autonomousLoopSkills array (line 18), add:
const autonomousLoopSkills = [
    "skills/autonomous-loop/SKILL.md",
    "skills/prevc-flow/SKILL.md",
    "skills/prevc-execution/SKILL.md",
    "skills/prevc-planning/SKILL.md",
    "skills/using-devflow/SKILL.md",
    "skills/napkin/SKILL.md",
  ];
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/validation/test-structural.mjs`
Expected: FAIL — `skills/napkin/SKILL.md does not exist`

- [ ] **Step 3: Create `skills/napkin/SKILL.md`**

```markdown
---
name: napkin
description: "Persistent learning memory — curated runbook of mistakes, corrections, and patterns that work. Always active, every session."
---

# Napkin Runbook

Persistent learning memory for agents. Based on [blader/napkin v6.0.0](https://github.com/blader/napkin).

The napkin is a **continuously curated runbook**, NOT a chronological log. It's a live knowledge base for execution speed and reliability.

## Always Active

No trigger required. Every session, unconditionally:

1. Read `.context/napkin.md` before doing anything
2. Internalize and apply silently — do NOT announce "I read the napkin"
3. Immediately curate: re-prioritize, merge duplicates, remove stale items, enforce category caps

## Storage

File: `.context/napkin.md` (one per project, inside dotcontext directory).

- Requires `.context/` to exist (Full or Lite mode only)
- Can be gitignored (personal) or committed (shared with team)
- If the file does not exist but `.context/` does, create it using the template below

## Template

When creating a new napkin:

~~~markdown
# Napkin Runbook

## Curation Rules
- Re-prioritize on every read.
- Keep recurring, high-value notes only.
- Max 15 items per category, max 7 per agent section.
- Each item includes date + "Do instead".

## Execution & Validation
(empty)

## Shell & Command Reliability
(empty)

## Domain Behavior Guardrails
(empty)

## User Directives
(empty)

## Agent-Specific Notes
<!-- Sections appear on demand: ### agent-name -->
~~~

## Entry Format

Every entry MUST follow this format:

```markdown
1. **[YYYY-MM-DD] Short rule**
   Do instead: concrete repeatable action.
```

- Date added `[YYYY-MM-DD]`
- Short, descriptive rule title
- Explicit `Do instead:` line with concrete action
- Concise, action-oriented wording

## What Qualifies

- Frequent gotchas that waste time repeatedly
- User directives affecting repeated behavior
- Non-obvious tactics that work repeatedly
- Tool/environment surprises (APIs, return formats, CLI quirks)

## What Does NOT Qualify

- One-off timeline notes or session diaries
- Verbose postmortems without reusable action
- Pure mistake logs without "Do instead" guidance
- Anything already enforced by linters, tests, or CI

## Categories

Four fixed categories (max **15 items** each, sorted by importance descending):

| Category | What goes here |
|----------|---------------|
| **Execution & Validation** | Test failures, build gotchas, CI surprises, TDD patterns |
| **Shell & Command Reliability** | CLI quirks, command flags, PATH issues, tool-specific behavior |
| **Domain Behavior Guardrails** | Business logic traps, API contracts, data format surprises |
| **User Directives** | Explicit user preferences that affect repeated behavior |

### Agent-Specific Notes

Sub-sections under `## Agent-Specific Notes` for domain-specific learnings. Max **7 items** per agent. Sections appear on demand — no empty placeholders.

```markdown
## Agent-Specific Notes
### security-auditor
1. **[2026-04-05] Rule title**
   Do instead: action.

### database-specialist
1. **[2026-04-05] Rule title**
   Do instead: action.
```

## Curation Policy

On every read (session start, post-compact):

1. **Re-prioritize** — most impactful items first
2. **Merge duplicates** — combine similar entries
3. **Remove stale** — delete items no longer relevant (fixed bugs, deprecated APIs)
4. **Enforce caps** — max 15 per category, max 7 per agent section
5. **Fewer high-signal items** preferred over broad coverage

## Coexistence with MEMORY.md

Napkin and Claude Code's auto-memory (MEMORY.md) are independent:

- **Napkin** = execution runbook (mistakes, corrections, patterns)
- **MEMORY.md** = high-level context (user profile, project decisions, references)
- No deduplication, no cross-promotion
- Both are read at session start; both serve different purposes

## Mode Compatibility

| Mode | Available? | How |
|------|-----------|-----|
| Full | Yes | SessionStart hook injects; dotcontext MCP can read `.context/napkin.md` |
| Lite | Yes | SessionStart hook injects; direct file read |
| Minimal | No | No `.context/` directory — skill inactive |
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/validation/test-structural.mjs`
Expected: PASS — all skill frontmatter tests pass including napkin

- [ ] **Step 5: Commit**

```bash
git add skills/napkin/SKILL.md tests/validation/test-structural.mjs
git commit -m "feat(napkin): add devflow:napkin skill

Curated runbook for persistent learning memory across sessions.
Based on blader/napkin v6.0.0, adapted for .context/ storage,
hybrid categories (4 fixed + agent-specific), and 15/7 caps."
```

---

### Task 2: Register napkin in using-devflow skill

**Files:**
- Modify: `skills/using-devflow/SKILL.md`

- [ ] **Step 1: Add napkin to the skill reference table**

In `skills/using-devflow/SKILL.md`, find the "Orchestration" skills table (the section with `devflow:agent-dispatch`, `devflow:context-awareness`, etc.) and add napkin:

```markdown
| `devflow:napkin` | Persistent learning memory — curated runbook of mistakes, corrections, and patterns. Always active. |
```

Add it in the orchestration section, after `devflow:autonomous-loop`.

- [ ] **Step 2: Run cross-reference test**

Run: `node --test tests/validation/test-structural.mjs`
Expected: PASS — `devflow:napkin` reference matches existing `skills/napkin/SKILL.md`

- [ ] **Step 3: Commit**

```bash
git add skills/using-devflow/SKILL.md
git commit -m "feat(napkin): register devflow:napkin in using-devflow skill table"
```

---

### Task 3: Integrate napkin in SessionStart hook

**Files:**
- Modify: `hooks/session-start` (lines 64-90, add napkin block after autonomous workflow detection)

- [ ] **Step 1: Write the failing test**

Create `tests/hooks/test-napkin-hooks.sh`:

```bash
#!/usr/bin/env bash
# Integration tests for napkin hook integration.
# Run: bash tests/hooks/test-napkin-hooks.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_TOTAL=0

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

assert_contains() {
  local desc="$1" haystack="$2" needle="$3"
  TESTS_TOTAL=$((TESTS_TOTAL + 1))
  if echo "$haystack" | grep -qF "$needle"; then
    echo -e "  ${GREEN}✓${NC} $desc"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    echo -e "  ${RED}✗${NC} $desc"
    echo "    Expected to contain: $needle"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  fi
}

assert_not_contains() {
  local desc="$1" haystack="$2" needle="$3"
  TESTS_TOTAL=$((TESTS_TOTAL + 1))
  if echo "$haystack" | grep -qF "$needle"; then
    echo -e "  ${RED}✗${NC} $desc"
    echo "    Expected NOT to contain: $needle"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  else
    echo -e "  ${GREEN}✓${NC} $desc"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  fi
}

# ─── Setup temp directories ──────────────────────────────────────

TMPDIR=$(mktemp -d)
trap "rm -rf $TMPDIR" EXIT

# ─── Test: napkin injected when .context/napkin.md exists ─────────

echo "=== Napkin SessionStart Injection ==="

# Simulate the napkin detection logic from session-start hook
test_napkin_injection() {
  local project_root="$1"
  local napkin_context=""

  if [ -f "${project_root}/.context/napkin.md" ]; then
    napkin_content=$(cat "${project_root}/.context/napkin.md" 2>/dev/null || echo "")
    if [ -n "$napkin_content" ]; then
      napkin_context="<NAPKIN_RUNBOOK>\n${napkin_content}\n</NAPKIN_RUNBOOK>"
    fi
  elif [ -d "${project_root}/.context" ]; then
    # Create template
    cat > "${project_root}/.context/napkin.md" << 'TMPL'
# Napkin Runbook

## Curation Rules
- Re-prioritize on every read.
- Keep recurring, high-value notes only.
- Max 15 items per category, max 7 per agent section.
- Each item includes date + "Do instead".

## Execution & Validation
(empty)

## Shell & Command Reliability
(empty)

## Domain Behavior Guardrails
(empty)

## User Directives
(empty)

## Agent-Specific Notes
<!-- Sections appear on demand: ### agent-name -->
TMPL
    napkin_content=$(cat "${project_root}/.context/napkin.md")
    napkin_context="<NAPKIN_RUNBOOK>\n${napkin_content}\n</NAPKIN_RUNBOOK>"
  fi

  printf '%s' "$napkin_context"
}

# Test 1: napkin.md exists → inject content
mkdir -p "$TMPDIR/test1/.context"
echo "# Napkin Runbook
## Execution & Validation
1. **[2026-04-05] Always seed DB before E2E**
   Do instead: run npm run db:seed first" > "$TMPDIR/test1/.context/napkin.md"

result=$(test_napkin_injection "$TMPDIR/test1")
assert_contains "injects NAPKIN_RUNBOOK when napkin.md exists" "$result" "<NAPKIN_RUNBOOK>"
assert_contains "includes napkin content" "$result" "Always seed DB before E2E"

# Test 2: .context/ exists but no napkin.md → create template
mkdir -p "$TMPDIR/test2/.context"

result=$(test_napkin_injection "$TMPDIR/test2")
assert_contains "creates template when .context/ exists without napkin" "$result" "<NAPKIN_RUNBOOK>"
assert_contains "template has Curation Rules" "$result" "Curation Rules"
assert_contains "template has categories" "$result" "Execution & Validation"
assert_contains "template has agent section" "$result" "Agent-Specific Notes"

# Verify file was actually created
assert_contains "napkin.md file was created" "$(ls "$TMPDIR/test2/.context/")" "napkin.md"

# Test 3: no .context/ → no injection
mkdir -p "$TMPDIR/test3"

result=$(test_napkin_injection "$TMPDIR/test3")
assert_contains "no injection without .context/ dir" "$result" ""

# Test 4: empty napkin.md → no injection
mkdir -p "$TMPDIR/test4/.context"
touch "$TMPDIR/test4/.context/napkin.md"

result=$(test_napkin_injection "$TMPDIR/test4")
assert_not_contains "no injection for empty napkin" "$result" "NAPKIN_RUNBOOK"

# ─── Test: PreCompact curate instruction ──────────────────────────

echo ""
echo "=== Napkin PreCompact Curate Instruction ==="

test_precompact_napkin() {
  local project_root="$1"
  local napkin_instruction=""

  if [ -f "${project_root}/.context/napkin.md" ]; then
    napkin_instruction="Before compacting, curate .context/napkin.md: merge duplicates, remove stale items, enforce max 15 per category / 7 per agent section, re-prioritize by importance."
  fi

  printf '%s' "$napkin_instruction"
}

# Test 5: napkin exists → inject curate instruction
result=$(test_precompact_napkin "$TMPDIR/test1")
assert_contains "pre-compact injects curate instruction" "$result" "curate .context/napkin.md"
assert_contains "mentions category cap" "$result" "max 15 per category"
assert_contains "mentions agent cap" "$result" "7 per agent section"

# Test 6: no napkin → no instruction
result=$(test_precompact_napkin "$TMPDIR/test3")
assert_contains "no curate instruction without napkin" "$result" ""

# ─── Test: PostCompact re-injection ───────────────────────────────

echo ""
echo "=== Napkin PostCompact Re-injection ==="

test_postcompact_napkin() {
  local project_root="$1"
  local napkin_rehydration=""

  if [ -f "${project_root}/.context/napkin.md" ]; then
    napkin_content=$(cat "${project_root}/.context/napkin.md" 2>/dev/null || echo "")
    if [ -n "$napkin_content" ]; then
      napkin_rehydration="<NAPKIN_RUNBOOK>\n${napkin_content}\n</NAPKIN_RUNBOOK>"
    fi
  fi

  printf '%s' "$napkin_rehydration"
}

# Test 7: napkin exists → re-inject after compact
result=$(test_postcompact_napkin "$TMPDIR/test1")
assert_contains "post-compact re-injects napkin" "$result" "<NAPKIN_RUNBOOK>"
assert_contains "re-injection has content" "$result" "Always seed DB before E2E"

# Test 8: no napkin → no re-injection
result=$(test_postcompact_napkin "$TMPDIR/test3")
assert_contains "no re-injection without napkin" "$result" ""

# ─── Report ───────────────────────────────────────────────────────

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Napkin hook tests: ${TESTS_PASSED}/${TESTS_TOTAL} passed"
if [ "$TESTS_FAILED" -gt 0 ]; then
  echo -e "  ${RED}${TESTS_FAILED} FAILED${NC}"
  exit 1
else
  echo -e "  ${GREEN}All passed${NC}"
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
```

- [ ] **Step 2: Run test to verify it passes (tests are self-contained)**

Run: `bash tests/hooks/test-napkin-hooks.sh`
Expected: PASS — all 8 tests pass (the tests validate the logic we'll extract into hooks)

- [ ] **Step 3: Add napkin detection block to `hooks/session-start`**

Insert after the autonomous workflow detection block (after line 90, before `# --- Read using-devflow skill ---`):

```bash
# --- Detect and inject napkin runbook ---

napkin_context=""
napkin_file="${project_root}/.context/napkin.md"

if [ -f "$napkin_file" ]; then
  napkin_content=$(cat "$napkin_file" 2>/dev/null || echo "")
  if [ -n "$napkin_content" ]; then
    napkin_escaped=$(escape_for_json "$napkin_content")
    napkin_context="\\n<NAPKIN_RUNBOOK>\\n${napkin_escaped}\\n</NAPKIN_RUNBOOK>\\n"
  fi
elif [ -d "${project_root}/.context" ]; then
  # Create napkin template
  cat > "$napkin_file" << 'NAPKIN_TMPL'
# Napkin Runbook

## Curation Rules
- Re-prioritize on every read.
- Keep recurring, high-value notes only.
- Max 15 items per category, max 7 per agent section.
- Each item includes date + "Do instead".

## Execution & Validation
(empty)

## Shell & Command Reliability
(empty)

## Domain Behavior Guardrails
(empty)

## User Directives
(empty)

## Agent-Specific Notes
<!-- Sections appear on demand: ### agent-name -->
NAPKIN_TMPL
  napkin_content=$(cat "$napkin_file")
  napkin_escaped=$(escape_for_json "$napkin_content")
  napkin_context="\\n<NAPKIN_RUNBOOK>\\n${napkin_escaped}\\n</NAPKIN_RUNBOOK>\\n"
fi
```

Note: `escape_for_json` is already defined at line 98 of the hook, but the napkin block is inserted before it (line 90). We need to move the napkin injection to **after** the escape function definition. The correct insertion point is after `escape_for_json` is defined (after line 106) and before the `using_devflow_escaped` line (line 108). Actually, looking at the flow more carefully:

The `escape_for_json` function is defined at lines 98-106. The napkin block should be inserted **after line 106** (after the function is available) and **before line 108** (before building the final context).

Then modify line 197 to include napkin in the session context:

```bash
# Change line 197 from:
session_context="<DEVFLOW_CONTEXT>\nYou have DevFlow installed.\n\n**Below is the full content of your 'devflow:using-devflow' skill — your entry point for the unified development workflow. For all other skills, use the 'Skill' tool:**\n\n${using_devflow_escaped}\n\n${mode_escaped}\n${autonomous_escaped}\n</DEVFLOW_CONTEXT>"

# To:
session_context="<DEVFLOW_CONTEXT>\nYou have DevFlow installed.\n\n**Below is the full content of your 'devflow:using-devflow' skill — your entry point for the unified development workflow. For all other skills, use the 'Skill' tool:**\n\n${using_devflow_escaped}\n\n${mode_escaped}\n${autonomous_escaped}\n${napkin_context}\n</DEVFLOW_CONTEXT>"
```

- [ ] **Step 4: Run existing session-start tests to verify no regression**

Run: `bash tests/hooks/test-session-start.sh`
Expected: PASS — all existing tests still pass

- [ ] **Step 5: Commit**

```bash
git add hooks/session-start tests/hooks/test-napkin-hooks.sh
git commit -m "feat(napkin): inject napkin runbook in SessionStart hook

Reads .context/napkin.md and injects as <NAPKIN_RUNBOOK> block.
Creates template automatically when .context/ exists but napkin doesn't.
Ignores silently in Minimal mode (no .context/)."
```

---

### Task 4: Integrate napkin in PreCompact hook

**Files:**
- Modify: `hooks/pre-compact` (add napkin curate instruction after line 54)

- [ ] **Step 1: Add napkin curate instruction to `hooks/pre-compact`**

Insert after the active plan detection block (after line 54, before `# --- Escape for JSON ---`):

```bash
# --- Napkin curation trigger ---

NAPKIN_INSTRUCTION=""
if [ -f ".context/napkin.md" ]; then
  NAPKIN_INSTRUCTION="Before compacting, curate .context/napkin.md: merge duplicates, remove stale items, enforce max 15 per category / 7 per agent section, re-prioritize by importance."
fi
```

Then add the napkin instruction to the checkpoint JSON. Modify the `cat > "$CHECKPOINT_DIR/last.json"` block (lines 73-84) to include it:

```bash
napkin_instruction_escaped=$(escape_for_json "$NAPKIN_INSTRUCTION")

cat > "$CHECKPOINT_DIR/last.json" << EOF
{
  "timestamp": "$TIMESTAMP",
  "git": {
    "branch": "$BRANCH",
    "last_commit": "$LAST_COMMIT",
    "dirty_files": $DIRTY_FILES
  },
  "handoff": "$handoff_escaped",
  "active_plan": "$plan_escaped",
  "napkin_instruction": "$napkin_instruction_escaped"
}
EOF
```

- [ ] **Step 2: Run napkin hook tests**

Run: `bash tests/hooks/test-napkin-hooks.sh`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add hooks/pre-compact
git commit -m "feat(napkin): add curate instruction to PreCompact hook

Injects napkin curation reminder into checkpoint before context
compaction. Stored in last.json for PostCompact to consume."
```

---

### Task 5: Integrate napkin in PostCompact hook

**Files:**
- Modify: `hooks/post-compact` (add napkin re-injection after plan block, around line 97)

- [ ] **Step 1: Add napkin re-injection to `hooks/post-compact`**

Insert after the plan extraction block (after line 89, before the fallback instructions block):

```bash
  # Extract napkin instruction
  napkin_instruction=$(python3 -c "
import json, sys
try:
    d = json.load(open('$CHECKPOINT'))
    n = d.get('napkin_instruction', '')
    if n: print(n)
except: pass
" 2>/dev/null || echo "")

  if [ -n "$napkin_instruction" ]; then
    rehydration="$rehydration

--- Napkin ---
$napkin_instruction"
  fi

  # Re-inject napkin content
  if [ -f ".context/napkin.md" ]; then
    napkin_content=$(cat ".context/napkin.md" 2>/dev/null || echo "")
    if [ -n "$napkin_content" ]; then
      rehydration="$rehydration

<NAPKIN_RUNBOOK>
$napkin_content
</NAPKIN_RUNBOOK>"
    fi
  fi
```

- [ ] **Step 2: Run napkin hook tests**

Run: `bash tests/hooks/test-napkin-hooks.sh`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add hooks/post-compact
git commit -m "feat(napkin): re-inject napkin in PostCompact hook

After context compaction, re-injects both the curate instruction
and the full napkin content so the agent retains learning memory."
```

---

### Task 6: Add napkin nudge to PostToolUse hook

**Files:**
- Modify: `hooks/post-tool-use` (add retry detection after merge check, around line 68)

- [ ] **Step 1: Add retry nudge logic to `hooks/post-tool-use`**

Insert after the merge detection block (after line 68, before `# --- Check if this is TaskUpdate ---`):

```bash
# --- Napkin nudge on Bash failures ---

if [ "$TOOL_NAME" = "Bash" ]; then
  TOOL_RESULT=$(printf '%s' "$INPUT" | python3 -c "
import json, sys
d = json.load(sys.stdin)
r = d.get('tool_result', {})
# Check for non-zero exit or error indicators
stdout = str(r.get('stdout', ''))
stderr = str(r.get('stderr', ''))
if r.get('exit_code', 0) != 0 or stderr:
    print('error')
else:
    print('ok')
" 2>/dev/null || echo "ok")

  if [ "$TOOL_RESULT" = "error" ] && [ -f ".context/napkin.md" ]; then
    reminder="${reminder}\n\n💡 Consider logging this in .context/napkin.md if it reveals a recurring pattern."
  fi
fi
```

- [ ] **Step 2: Run existing hook tests to verify no regression**

Run: `bash tests/hooks/test-session-start.sh`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add hooks/post-tool-use
git commit -m "feat(napkin): add correction nudge to PostToolUse hook

When a Bash command fails and .context/napkin.md exists, gently
reminds the agent to log the pattern if it's recurring."
```

---

### Task 7: Run all tests and final validation

**Files:** None (validation only)

- [ ] **Step 1: Run structural tests**

Run: `node --test tests/validation/test-structural.mjs`
Expected: PASS — all tests including napkin frontmatter validation

- [ ] **Step 2: Run session-start hook tests**

Run: `bash tests/hooks/test-session-start.sh`
Expected: PASS — all existing tests still pass

- [ ] **Step 3: Run napkin hook tests**

Run: `bash tests/hooks/test-napkin-hooks.sh`
Expected: PASS — all 8 napkin-specific tests pass

- [ ] **Step 4: Verify file structure**

Run: `ls -la skills/napkin/SKILL.md .context/napkin.md 2>/dev/null; echo "---"; head -5 skills/napkin/SKILL.md`
Expected: `skills/napkin/SKILL.md` exists with correct frontmatter. `.context/napkin.md` may or may not exist (created on session start).

- [ ] **Step 5: Smoke test — run session-start hook manually**

Run: `CLAUDE_PLUGIN_ROOT="$(pwd)" bash hooks/session-start 2>/dev/null | python3 -c "import json,sys; d=json.load(sys.stdin); ctx=d.get('hookSpecificOutput',{}).get('additionalContext',''); print('NAPKIN OK' if 'NAPKIN_RUNBOOK' in ctx else 'NAPKIN MISSING')"`
Expected: `NAPKIN OK` (since this project has `.context/`)
